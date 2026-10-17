import { printBlocker } from "./print";
import type { Phase } from "./session";

/**
 * A copy at the kiosk: a guest finds a print from earlier in the
 * evening on the attract screen's "Print a copy" and asks for another.
 * The guestbook's card is the booth's job; a copy comes out of the same
 * tray and cassette, so the attendant sets how many each session may
 * have (none switches the button off), and the last few cards are kept
 * for the guests still to come. The attendant's own Reprint, on the
 * admin page, is not counted here and is never refused by these rules.
 */

/** The most copies per session the attendant can allow. */
export const GUEST_COPY_LIMIT_MAX = 3;

/** The booth's default: one copy per session. */
export const GUEST_COPY_LIMIT_DEFAULT = 1;

/**
 * Cards and prints kept back for new sessions: a copy is refused once
 * taking it, and the prints already queued, would leave this few or
 * fewer, so the next guest's guestbook card never finds the tray empty
 * because of someone's second copy.
 */
export const GUEST_COPY_RESERVE = 2;

/**
 * How far back a guest can find a print. The booth is lent from party
 * to party, and a database that was not cleared between them must not
 * offer last week's guests to this week's.
 */
export const GUEST_COPY_WINDOW_MS = 24 * 60 * 60_000;

/** The session as far as a copy cares. */
export interface CopySession {
  phase: Phase;
  /** The compositor's postcard exists: a copy prints exactly what the guest saw. */
  composed: boolean;
  deleted: boolean;
  createdAt: Date | string;
  /** Copies guests have already asked for. */
  guestCopies: number;
}

/** The booth as far as a copy cares. */
export interface CopyBooth {
  /** Copies per session the attendant allows; 0 is off. */
  guestCopyLimit: number;
  paperLeft: number;
  inkLeft: number;
  /** Prints queued or printing, each of which will take a card. */
  pendingPrints: number;
  /** The worker's printer card says error: not found, not answering, or something only a person can fix. */
  printerDown: boolean;
}

/** Whether a guest browsing the evening's prints sees this one. */
export function isFindable(session: CopySession, now: Date): boolean {
  return (
    session.phase === "done" &&
    session.composed &&
    !session.deleted &&
    now.getTime() - new Date(session.createdAt).getTime() <= GUEST_COPY_WINDOW_MS
  );
}

/** How many more copies this session may have, ignoring the printer. */
export function copiesLeft(limit: number, session: Pick<CopySession, "guestCopies">): number {
  return Math.max(0, limit - session.guestCopies);
}

/**
 * Why a guest cannot have a copy of this print now, in words for the
 * kiosk, or null when they can. The kiosk shows the same answer the
 * server gives, so a button is never offered that the booth refuses.
 */
export function copyRefusal(booth: CopyBooth, session: CopySession, now: Date): string | null {
  if (booth.guestCopyLimit <= 0) return "Copies are not on offer right now";
  if (!isFindable(session, now)) return "That print is not available";
  if (copiesLeft(booth.guestCopyLimit, session) === 0) {
    return booth.guestCopyLimit === 1 ? "This print has had its copy" : `This print has had its ${booth.guestCopyLimit} copies`;
  }
  if (booth.printerDown) return "The printer is not answering; the attendant can help";
  if (printBlocker(booth)) return "The printer needs a refill; the attendant can help";
  const after = Math.min(booth.paperLeft, booth.inkLeft) - booth.pendingPrints;
  if (after <= GUEST_COPY_RESERVE) return "The last few cards are kept for new photos; the attendant can print one for you";
  return null;
}
