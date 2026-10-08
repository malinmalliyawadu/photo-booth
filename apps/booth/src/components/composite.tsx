/* eslint-disable @next/next/no-img-element */
import { cssFilter, type FilterId } from "@booth/core";
import type { TemplateSummary } from "@booth/db";

/** How a photo is flipped: the same transform the live preview uses, so the two agree. */
export const MIRROR_TRANSFORM = "scaleX(-1)";

/**
 * A layout with photos in its slots. Until a session is composed the
 * browser draws it: the photos sit under the knocked-out template
 * overlay at the slot rectangles, scaled by percentage so one component
 * serves a thumbnail and the review screen alike, with the session's
 * filter and mirroring applied to the photos here, never to the files.
 * The compositor makes the print and web JPEGs from the same geometry
 * and the same look (`placePhotos`, `applyLook`); once it has, `composed`
 * shows that JPEG in the same box, which is exactly what was printed and
 * sent to the gallery.
 */
export function Composite({
  template,
  photos,
  composed,
  filter = "colour",
  mirrored = false,
  className = "",
  fit = false,
}: {
  template: Pick<TemplateSummary, "width" | "height" | "slots" | "screenUrl" | "name">;
  /** Shot number to image URL. Missing shots render as an empty slot. */
  photos: Record<number, string | undefined>;
  /** The compositor's JPEG, when there is one: shown instead of drawing the photos. */
  composed?: string | null;
  /** The look the guest picked; the overlay is never filtered. */
  filter?: FilterId;
  /** Flip the photos, the way the mirror showed the guest; the overlay stays. */
  mirrored?: boolean;
  className?: string;
  /**
   * Fill the parent like object-fit: contain. The parent must have a
   * definite size; the composite takes the larger size its aspect ratio
   * allows. Without it the composite is width-driven, which suits a
   * thumbnail in a column.
   */
  fit?: boolean;
}) {
  const { width, height } = template;
  const ratio = width / height;
  const look = cssFilter(filter);
  const transform = mirrored ? MIRROR_TRANSFORM : undefined;
  const box = (
    <div
      className={`relative overflow-hidden bg-night-lifted ${className}`}
      style={{
        aspectRatio: `${width} / ${height}`,
        ...(fit ? { width: `min(100%, calc(100cqh * ${ratio}))` } : {}),
      }}
    >
      {composed ? (
        <img src={composed} alt={template.name} className="absolute inset-0 h-full w-full" draggable={false} data-testid="composed" />
      ) : (
        <BrowserDrawn template={template} photos={photos} look={look} transform={transform} />
      )}
    </div>
  );
  if (!fit) return box;
  return <div className="flex h-full w-full items-center justify-center [container-type:size]">{box}</div>;
}

function BrowserDrawn({
  template,
  photos,
  look,
  transform,
}: {
  template: Pick<TemplateSummary, "width" | "height" | "slots" | "screenUrl" | "name">;
  photos: Record<number, string | undefined>;
  look: string;
  transform: string | undefined;
}) {
  const { width, height, slots } = template;
  return (
    <>
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
              <img src={url} alt="" className="h-full w-full object-cover" style={{ filter: look, transform }} draggable={false} />
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
    </>
  );
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
