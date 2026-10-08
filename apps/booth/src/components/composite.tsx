/* eslint-disable @next/next/no-img-element */
import { cssFilter, type FilterId } from "@booth/core";
import type { TemplateSummary } from "@booth/db";

/**
 * A layout with photos in its slots, drawn by the browser: the photos
 * sit under the knocked-out template overlay at the slot rectangles,
 * scaled by percentage so one component serves a thumbnail and the
 * review screen alike. The session's filter is applied to the photos
 * here, never to the files. Phase 2's compositor makes the print from
 * the same geometry and the same look.
 */
export function Composite({
  template,
  photos,
  filter = "colour",
  className = "",
  fit = false,
}: {
  template: Pick<TemplateSummary, "width" | "height" | "slots" | "screenUrl" | "name">;
  /** Shot number to image URL. Missing shots render as an empty slot. */
  photos: Record<number, string | undefined>;
  /** The look the guest picked; the overlay is never filtered. */
  filter?: FilterId;
  className?: string;
  /**
   * Fill the parent like object-fit: contain. The parent must have a
   * definite size; the composite takes the larger size its aspect ratio
   * allows. Without it the composite is width-driven, which suits a
   * thumbnail in a column.
   */
  fit?: boolean;
}) {
  const { width, height, slots } = template;
  const ratio = width / height;
  const look = cssFilter(filter);
  const box = (
    <div
      className={`relative overflow-hidden bg-night-lifted ${className}`}
      style={{
        aspectRatio: `${width} / ${height}`,
        ...(fit ? { width: `min(100%, calc(100cqh * ${ratio}))` } : {}),
      }}
    >
      {slots.map((slot, i) => {
        const url = photos[slot.shot];
        return (
          <div
            key={i}
            className="absolute overflow-hidden bg-night-edge"
            style={{
              left: `${(slot.x / width) * 100}%`,
              top: `${(slot.y / height) * 100}%`,
              width: `${(slot.width / width) * 100}%`,
              height: `${(slot.height / height) * 100}%`,
            }}
          >
            {url ? (
              <img src={url} alt="" className="h-full w-full object-cover" style={{ filter: look }} draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="mono text-cream-faint text-[1.2em]">{slot.shot}</span>
              </div>
            )}
          </div>
        );
      })}
      <img
        src={template.screenUrl}
        alt={template.name}
        className="pointer-events-none absolute inset-0 h-full w-full"
        draggable={false}
      />
    </div>
  );
  if (!fit) return box;
  return <div className="flex h-full w-full items-center justify-center [container-type:size]">{box}</div>;
}

/** The sample photos under public/samples, one per shot, for previews. */
export function samplePhotos(shotCount: number, offset = 0): Record<number, string> {
  const photos: Record<number, string> = {};
  for (let n = 1; n <= shotCount; n++) photos[n] = `/samples/sample-${((n - 1 + offset) % 8) + 1}.jpg`;
  return photos;
}

export function sessionPhotos(shots: { shot: number; url: string }[]): Record<number, string> {
  return Object.fromEntries(shots.map((s) => [s.shot, s.url]));
}
