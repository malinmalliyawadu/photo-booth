import { bus } from "@/lib/bus";
import type { Snapshot } from "@booth/db";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const KEEPALIVE_MS = 15_000;

/**
 * The state stream. Every screen opens one of these and redraws from
 * each snapshot; commands go the other way as plain POSTs. The first
 * message is the current state, so a Safari reload mid-session lands
 * back on the right screen.
 */
export async function GET(request: Request) {
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (snapshot: Snapshot) => {
        try {
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify(snapshot)}\n\n`));
        } catch {
          cleanup?.();
        }
      };
      const unsubscribe = bus.subscribe(send);
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          cleanup?.();
        }
      }, KEEPALIVE_MS);
      cleanup = () => {
        cleanup = null;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", () => cleanup?.());
      send(await bus.current());
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
