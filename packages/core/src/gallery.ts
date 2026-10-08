/**
 * The gallery: where a session's photos go once the guest has accepted
 * them, and the page the QR code sends the guest to.
 *
 * The booth does not host a gallery of its own. The event's own site
 * does, because that is where guests upload their phone photos too, and
 * the day's album should be one album. The booth only knows how to push
 * a finished session to a URL with a token, and what link to print on
 * the QR; which site answers is configuration. For the wedding it is
 * the wedding-planner's `/api/booth/photos`; a friend's party points it
 * somewhere else or leaves it unset and the QR is the only copy.
 */

/** Where the QR template puts the session's ID. */
export const SESSION_ID_PLACEHOLDER = "{id}";

/**
 * The link a guest scans. `template` is `GALLERY_SESSION_URL`: either a
 * URL with `{id}` in it, or a prefix the ID is appended to, so
 * `https://w.example/i/booth/{id}` and `https://w.example/i/booth` mean
 * the same thing.
 */
export function sessionLink(template: string, id: string): string {
  const trimmed = template.trim();
  if (trimmed.includes(SESSION_ID_PLACEHOLDER)) return trimmed.replaceAll(SESSION_ID_PLACEHOLDER, id);
  return `${trimmed.replace(/\/+$/, "")}/${id}`;
}

export type GallerySetting =
  /** Nothing configured: sessions are not sent anywhere. */
  | { kind: "off" }
  /** Configured, but not usably: the worker reports this rather than crashing. */
  | { kind: "invalid"; detail: string }
  | { kind: "on"; url: string; token: string; host: string };

/**
 * Reads the gallery out of the environment. Both variables or neither:
 * a URL with no token would be refused by any gallery worth sending to,
 * and a token with no URL is a leftover, so half a configuration is
 * reported rather than guessed around.
 */
export function gallerySetting(env: Record<string, string | undefined>): GallerySetting {
  // `|| ""`: a compose file passes an unset variable as "".
  const url = (env.GALLERY_SYNC_URL || "").trim();
  const token = (env.GALLERY_SYNC_TOKEN || "").trim();
  if (!url && !token) return { kind: "off" };
  if (!url) return { kind: "invalid", detail: "GALLERY_SYNC_TOKEN is set but GALLERY_SYNC_URL is not" };
  if (!token) return { kind: "invalid", detail: "GALLERY_SYNC_URL is set but GALLERY_SYNC_TOKEN is not" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "invalid", detail: `GALLERY_SYNC_URL is not a URL: ${url}` };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { kind: "invalid", detail: `GALLERY_SYNC_URL must be http(s): ${url}` };
  }
  return { kind: "on", url, token, host: parsed.host };
}

export type SyncPlan =
  /** The job is done and nothing was sent; the session stays unsynced. */
  | { kind: "skip"; reason: string }
  /** The job fails and the queue retries it with backoff. */
  | { kind: "fail"; reason: string }
  /**
   * The photos are all there but were never put together (a session
   * from before the compositor, or one it failed on): compose, then plan
   * again.
   */
  | { kind: "compose" }
  /** Relative data paths of the files to send. */
  | { kind: "upload"; photo: string; thumb: string };

/**
 * What the sync job does for a session. The compositor's web JPEG and
 * thumbnail are what the gallery gets: the look and the mirror are
 * baked into them, and the shots on disk are the camera's own frames,
 * which a guest never asked to publish.
 */
export function planSync(
  gallery: GallerySetting,
  session: {
    deletedAt: Date | null;
    webPath: string | null;
    thumbPath: string | null;
    takenCount: number;
    shotCount: number;
  },
): SyncPlan {
  if (session.deletedAt) return { kind: "skip", reason: "the session was deleted" };
  if (gallery.kind === "off") return { kind: "skip", reason: "no gallery is configured" };
  if (gallery.kind === "invalid") return { kind: "fail", reason: gallery.detail };
  if (!session.webPath || !session.thumbPath) {
    if (session.takenCount < session.shotCount) return { kind: "fail", reason: "the session has no photos to send" };
    return { kind: "compose" };
  }
  return { kind: "upload", photo: session.webPath, thumb: session.thumbPath };
}
