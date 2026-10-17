"use client";

/* eslint-disable @next/next/no-img-element */
import { Check, Smile } from "lucide-react";
import { propImageUrl, type PropId } from "@booth/core";

/** A swatch's shape: `Choice` draws it 4.75rem by 3.5rem. */
export const SWATCH = { width: 4.75, height: 3.5 };
/** A `PropTile`'s swatch shape. */
export const TILE = { width: 4, height: 3 };

/**
 * One choice on the kiosk: a swatch of the guest's own photo the way
 * this option would show it (or the prop's artwork, before there is a
 * photo), with its name beside it, and a check (a radio) or a switch at
 * the end of the row. The review screen's looks, props and mirror, and
 * the props before posing.
 */
export function Choice({
  role,
  selected,
  label,
  hint,
  icon,
  testId,
  onClick,
  children,
}: {
  role: "radio" | "switch";
  selected: boolean;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onClick}
      data-testid={testId}
      className={`flex min-h-[4.6rem] w-full shrink-0 items-center gap-4 rounded-xl px-3 py-2 text-left transition-[background,transform] duration-150 active:scale-[0.985] ${
        selected ? "bg-gold-tint shadow-[inset_0_0_0_1px_var(--color-gold)]" : "active:bg-velvet-lifted"
      }`}
    >
      <div className="relative h-14 w-[4.75rem] shrink-0 overflow-hidden rounded-md bg-velvet-lifted shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]">{children}</div>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 text-xl font-semibold ${selected ? "text-ivory" : "text-ivory-soft"}`}>
          {icon}
          {label}
        </span>
        {hint && <span className="mt-0.5 block text-sm text-ivory-faint">{hint}</span>}
      </span>
      {role === "radio" ? (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
            selected ? "bg-gold text-velvet" : "ring-1 ring-ivory/30"
          }`}
          aria-hidden
        >
          {selected && <Check className="h-5 w-5" strokeWidth={3} />}
        </span>
      ) : (
        <span className="switch" aria-checked={selected} aria-hidden />
      )}
    </button>
  );
}

/** A prop's artwork on its own, for a swatch when there is no photo of the guest to show it on. */
export function PropSwatch({ prop }: { prop: PropId }) {
  const url = propImageUrl(prop);
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_50%_40%,#3a2d3f_0%,#1a1320_100%)] p-1.5">
      {url ? <img src={url} alt="" className="max-h-full max-w-full" draggable={false} /> : <Smile className="h-7 w-7 text-ivory-faint" strokeWidth={1.4} />}
    </div>
  );
}

/**
 * One prop as a tile: its swatch above its name. Props are things to
 * look at, and seven of them fit a grid where seven rows would not.
 */
export function PropTile({
  selected,
  label,
  testId,
  onClick,
  children,
}: {
  selected: boolean;
  label: string;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      data-testid={testId}
      className={`flex min-w-0 flex-col gap-1.5 rounded-xl p-1.5 transition-[background,transform] duration-150 active:scale-[0.97] ${
        selected ? "bg-gold-tint shadow-[inset_0_0_0_1px_var(--color-gold)]" : "active:bg-velvet-lifted"
      }`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-velvet-lifted shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]">{children}</div>
      <span className={`truncate px-0.5 text-center text-[0.95rem] leading-tight font-semibold ${selected ? "text-ivory" : "text-ivory-soft"}`}>{label}</span>
    </button>
  );
}
