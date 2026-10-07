/**
 * One Postgres LISTEN per process, fanned out to every SSE client.
 *
 * Every state change in the database ends with NOTIFY on the booth
 * channel. The first subscriber opens a dedicated client that listens;
 * each notification is coalesced for a few milliseconds and then one
 * fresh snapshot goes to every subscriber. A slow timer re-reads
 * regardless, so a missed notification costs seconds rather than the
 * evening. The globalThis stash survives dev HMR.
 */
import { Client } from "pg";
import { CHANNEL, readSnapshot, type Snapshot } from "@booth/db";

type Listener = (snapshot: Snapshot) => void;

class Bus {
  private listeners = new Set<Listener>();
  private client: Client | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private refresh: NodeJS.Timeout | null = null;
  private latest: Snapshot | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) void this.connect();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) void this.disconnect();
    };
  }

  /** The last snapshot sent, or a fresh one. */
  async current(): Promise<Snapshot> {
    return this.latest ?? (await readSnapshot());
  }

  private async connect() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    this.client = client;
    client.on("notification", () => this.schedule());
    client.on("error", (err) => {
      console.error("[bus] listener error", err.message);
      void this.reconnect();
    });
    try {
      await client.connect();
      await client.query(`listen ${CHANNEL}`);
    } catch (err) {
      console.error("[bus] listen failed", err instanceof Error ? err.message : err);
      void this.reconnect();
      return;
    }
    this.refresh = setInterval(() => this.schedule(), 10_000);
    this.schedule();
  }

  private async reconnect() {
    await this.disconnect();
    if (this.listeners.size > 0) setTimeout(() => void this.connect(), 2000);
  }

  private async disconnect() {
    if (this.refresh) clearInterval(this.refresh);
    this.refresh = null;
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => {});
  }

  private schedule() {
    if (this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.broadcast();
    }, 25);
  }

  private async broadcast() {
    try {
      const snapshot = await readSnapshot();
      this.latest = snapshot;
      for (const l of this.listeners) l(snapshot);
    } catch (err) {
      console.error("[bus] snapshot failed", err instanceof Error ? err.message : err);
    }
  }
}

const globalForBus = globalThis as unknown as { boothBus: Bus | undefined };
export const bus: Bus = globalForBus.boothBus ?? new Bus();
if (process.env.NODE_ENV !== "production") globalForBus.boothBus = bus;
