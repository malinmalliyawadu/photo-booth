"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Activity, Images, SlidersHorizontal } from "lucide-react";
import type { Snapshot } from "@booth/db";
import { Aperture, Grain, Spotlight } from "@/components/chrome";
import { patch, useSnapshot } from "@/components/use-snapshot";
import { boothVerdict } from "./health";

interface Admin {
  snapshot: Snapshot;
  connected: boolean;
  /** Runs a request and reports its failure as a toast. */
  run: (label: string, fn: () => Promise<Response>) => Promise<void>;
  /** Patches the booth settings. */
  setBooth: (body: Record<string, unknown>, label?: string) => Promise<void>;
  notify: (message: string) => void;
}

const AdminContext = createContext<Admin | null>(null);

export function useAdmin(): Admin {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin outside AdminShell");
  return ctx;
}

const TABS = [
  { href: "/admin", label: "Live", icon: Activity },
  { href: "/admin/sessions", label: "Sessions", icon: Images },
  { href: "/admin/setup", label: "Setup", icon: SlidersHorizontal },
] as const;

/**
 * The attendant's page: one snapshot shared by three tabs, with the
 * booth's verdict and the connection in the header and a tab bar at
 * the thumb (a rail, on anything wider than a phone).
 */
export function AdminShell({ initial, children }: { initial: Snapshot; children: React.ReactNode }) {
  const { snapshot, connected } = useSnapshot(initial);
  const [toast, setToast] = useState<string | null>(null);
  const pathname = usePathname();

  const run = useCallback(async (label: string, fn: () => Promise<Response>) => {
    const res = await fn().catch(() => null);
    if (!res) return setToast(`${label}: the booth did not answer`);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setToast(`${label}: ${data.error ?? res.status}`);
    }
  }, []);
  const setBooth = useCallback((body: Record<string, unknown>, label = "Settings") => run(label, () => patch("/api/admin/booth", body)), [run]);
  const value = useMemo<Admin>(() => ({ snapshot, connected, run, setBooth, notify: setToast }), [snapshot, connected, run, setBooth]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const verdict = boothVerdict(snapshot);

  return (
    <AdminContext.Provider value={value}>
      <main className="relative min-h-dvh bg-velvet text-ivory md:grid md:grid-cols-[13.5rem_1fr]">
        <Spotlight />
        <Grain />

        {/* The rail, on a tablet or a laptop. */}
        <aside className="relative hidden md:flex md:flex-col md:border-r md:border-velvet-edge md:px-5 md:pt-safe-8 md:pb-8">
          <div className="flex items-center gap-3">
            <Aperture className="h-8 w-8 text-gold" />
            <div>
              <p className="eyebrow">Booth admin</p>
            </div>
          </div>
          <nav className="mt-10 flex flex-col gap-1" aria-label="Admin">
            {TABS.map((t) => (
              <Tab key={t.href} {...t} active={pathname === t.href} />
            ))}
          </nav>
        </aside>

        <div className="relative mx-auto w-full max-w-xl px-4 pt-safe-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:max-w-2xl md:px-10 md:pb-16">
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow md:hidden">Booth admin</p>
              <h1 className="display mt-1 truncate text-3xl md:text-4xl">{snapshot.booth.eventName}</h1>
            </div>
            <span className={`pill mt-1 ${connected ? "pill-ok" : "pill-warn"}`} data-testid="connection">
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-sage" : "bg-amber"} ${connected ? "" : "animate-breathe"}`} />
              {connected ? "Live" : "Reconnecting"}
            </span>
          </header>

          <div className={`mt-5 flex items-center gap-4 rounded-2xl px-4 py-3 ring-1 ${verdictRing(verdict.tone)}`} data-testid="verdict" data-tone={verdict.tone}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${verdictDot(verdict.tone)}`} aria-hidden />
            <div className="min-w-0">
              <p className="display text-2xl leading-tight">{verdict.label}</p>
              <p className="truncate text-sm text-ivory-soft">{verdict.detail}</p>
            </div>
          </div>

          {toast && (
            <p className="mt-4 rounded-xl bg-claret-tint px-4 py-3 text-sm text-claret" role="alert" data-testid="toast">
              {toast}
            </p>
          )}

          {children}
        </div>

        {/* The tab bar, at the thumb on a phone. */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-velvet-edge bg-velvet/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
          aria-label="Admin"
        >
          <div className="mx-auto grid max-w-xl grid-cols-3">
            {TABS.map((t) => (
              <Tab key={t.href} {...t} active={pathname === t.href} bar />
            ))}
          </div>
        </nav>
      </main>
    </AdminContext.Provider>
  );
}

function Tab({ href, label, icon: Icon, active, bar = false }: (typeof TABS)[number] & { active: boolean; bar?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        bar
          ? `flex min-h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold tracking-wide ${active ? "text-gold" : "text-ivory-faint"}`
          : `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-gold-tint text-gold" : "text-ivory-soft active:bg-velvet-lifted"}`
      }
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
      {label}
    </Link>
  );
}

function verdictRing(tone: string): string {
  switch (tone) {
    case "ok":
      return "bg-sage-tint/60 ring-sage/30";
    case "warn":
      return "bg-amber-tint/60 ring-amber/30";
    case "error":
      return "bg-claret-tint/60 ring-claret/30";
    default:
      return "bg-velvet-raised ring-velvet-edge";
  }
}

function verdictDot(tone: string): string {
  switch (tone) {
    case "ok":
      return "bg-sage";
    case "warn":
      return "bg-amber";
    case "error":
      return "bg-claret animate-breathe";
    default:
      return "bg-ivory-faint";
  }
}
