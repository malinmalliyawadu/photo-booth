import QRCode from "qrcode";
import { isShortIdShape } from "@booth/core";
import { sessionUrl } from "@/lib/api";

/**
 * The QR for a session, made on the controller so it works with no
 * internet. It encodes the gallery link; the photos appear there once
 * the sync catches up.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/qr">) {
  const { id } = await ctx.params;
  if (!isShortIdShape(id)) return new Response("Not found", { status: 404 });
  const svg = await QRCode.toString(sessionUrl(id), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#0f1113", light: "#f3ede2" },
  });
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400, immutable" },
  });
}
