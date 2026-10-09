"use client";

import { Minus, Plus } from "lucide-react";

export function Section({ title, eyebrow, children, testId }: { title: string; eyebrow?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="card mt-5 p-4" data-testid={testId}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="display text-2xl">{title}</h2>
        {eyebrow && <span className="eyebrow eyebrow-dim">{eyebrow}</span>}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 grid grid-cols-[6.5rem_1fr] items-center gap-3">
      <span>
        <span className="block text-sm font-semibold text-ivory-soft">{label}</span>
        {hint && <span className="block text-xs text-ivory-faint">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

/** Nothing when there is plenty; the booth skips prints at zero, so that is an error. */
export function SupplyPill({ left, low }: { left: number; low: number }) {
  if (left <= 0) return <span className="pill pill-error">Empty</span>;
  if (left <= low) return <span className="pill pill-warn">Low</span>;
  return null;
}

/** How much of a tray or a cassette is left, as a bar that changes colour as it empties. */
export function Gauge({ value, max, low }: { value: number; max: number; low: number }) {
  const share = Math.max(0, Math.min(1, value / max));
  const tone = value <= 0 ? "bg-claret" : value <= low ? "bg-amber" : "bg-gold";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-velvet" role="presentation">
      <div className={`h-full rounded-full ${tone} transition-[width] duration-300`} style={{ width: `${share * 100}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, testPrefix }: { value: T; options: [T, string][]; onChange: (v: T) => void; testPrefix: string }) {
  return (
    <div className="grid gap-1 rounded-xl bg-velvet p-1 ring-1 ring-velvet-edge" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-10 rounded-lg text-sm font-semibold transition ${value === v ? "bg-gold text-velvet" : "text-ivory-soft active:bg-velvet-lifted"}`}
          data-testid={`${testPrefix}-${v}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  suffix = "",
  onChange,
  testId,
}: {
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <div className="inline-flex items-center justify-self-start rounded-xl bg-velvet ring-1 ring-velvet-edge">
      <button type="button" className="flex h-11 w-11 items-center justify-center rounded-l-xl active:bg-velvet-lifted disabled:opacity-30" aria-label="Less" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="mono min-w-14 text-center text-base" data-testid={testId}>
        {value}
        {suffix}
      </span>
      <button type="button" className="flex h-11 w-11 items-center justify-center rounded-r-xl active:bg-velvet-lifted disabled:opacity-30" aria-label="More" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
