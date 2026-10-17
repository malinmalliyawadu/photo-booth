/* eslint-disable @next/next/no-img-element */
import {
  coverCrop,
  cssFilter,
  placeProp,
  propImageUrl,
  type Crop,
  type Face,
  type FilterId,
  type PropId,
  type Size,
} from "@booth/core";
import type { ShotView, TemplateSummary } from "@booth/db";

/** How a photo is flipped: the same transform the live preview uses, so the two agree. */
export const MIRROR_TRANSFORM = "scaleX(-1)";

/**
 * A photo to draw: a URL alone (the sample photos), or a shot with its
 * frame's size and faces, which is what props need: they are placed on
 * the frame, so the frame has to be laid out, not just covered.
 */
export type Photo = string | Pick<ShotView, "url" | "width" | "height" | "faces">;

/** The ivory mat's width around a print, as a fraction of the print's width. */
const MAT = 0.025;

/**
 * A layout with photos in its slots. Until a session is composed the
 * browser draws it: the photos sit under the knocked-out template
 * overlay at the slot rectangles, scaled by percentage so one component
 * serves a thumbnail and the review screen alike, with the session's
 * props, filter and mirroring applied to the photos here, never to the
 * files. The compositor makes the print and web JPEGs from the same
 * geometry and the same look (`placePhotos`, `placeProp`, `applyLook`);
 * once it has, `composed` shows that JPEG in the same box, which is
 * exactly what was printed and sent to the gallery.
 */
export function Composite({
  template,
  photos,
  composed,
  filter = "colour",
  prop = "none",
  mirrored = false,
  className = "",
  fit = false,
  mat = false,
}: {
  template: Pick<TemplateSummary, "width" | "height" | "slots" | "screenUrl" | "name">;
  /** Shot number to photo. Missing shots render as an empty slot. */
  photos: Record<number, Photo | undefined>;
  /** The compositor's JPEG, when there is one: shown instead of drawing the photos. */
  composed?: string | null;
  /** The look the guest picked; the overlay is never filtered. */
  filter?: FilterId;
  /** What every face wears; drawn on photos that know their faces. */
  prop?: PropId;
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
  /** Show it as a print: on an ivory mat with a deep shadow. */
  mat?: boolean;
}) {
  const { width, height } = template;
  const ratio = width / height;
  const look = cssFilter(filter);
  const pad = mat ? MAT : 0;
  // The mat's padding is a share of the width on every side, so the
  // matted box is a little squarer than the print inside it.
  const outer = (ratio * (1 + 2 * pad)) / (1 + 2 * pad * ratio);
  const print = (
    <div className="relative h-full w-full overflow-hidden bg-velvet-lifted" style={{ aspectRatio: `${width} / ${height}` }}>
      {composed ? (
        <img src={composed} alt={template.name} className="absolute inset-0 h-full w-full" draggable={false} data-testid="composed" />
      ) : (
        <BrowserDrawn template={template} photos={photos} look={look} prop={prop} mirrored={mirrored} />
      )}
    </div>
  );
  const box = (
    <div
      className={`${mat ? "mat" : "overflow-hidden"} ${className}`}
      style={{
        ...(fit ? { aspectRatio: `${outer}`, width: `min(100%, calc(100cqh * ${outer}))` } : {}),
        ...(mat ? { padding: `${pad * 100}%` } : {}),
      }}
    >
      {print}
    </div>
  );
  if (!fit) return box;
  return <div className="flex h-full w-full items-center justify-center [container-type:size]">{box}</div>;
}

function BrowserDrawn({
  template,
  photos,
  look,
  prop,
  mirrored,
}: {
  template: Pick<TemplateSummary, "width" | "height" | "slots" | "screenUrl" | "name">;
  photos: Record<number, Photo | undefined>;
  look: string;
  prop: PropId;
  mirrored: boolean;
}) {
  const { width, height, slots } = template;
  return (
    <>
      {slots.map((slot, i) => {
        const photo = photos[slot.shot];
        return (
          <div
            key={i}
            className="absolute overflow-hidden bg-velvet-edge"
            style={{
              left: `${(slot.x / width) * 100}%`,
              top: `${(slot.y / height) * 100}%`,
              width: `${(slot.width / width) * 100}%`,
              height: `${(slot.height / height) * 100}%`,
            }}
          >
            {photo ? (
              <CoveredPhoto photo={photo} box={slot} look={look} prop={prop} mirrored={mirrored} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="display text-[1.4em] text-ivory-faint">{slot.shot}</span>
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

export function sessionPhotos(shots: ShotView[]): Record<number, Photo> {
  return Object.fromEntries(shots.map((s) => [s.shot, s]));
}

/**
 * A photo filling a box the way a slot crops it, like CSS `object-fit:
 * cover`, centred (`coverCrop`, which the compositor uses too), with the
 * props on its faces. A photo that does not know its frame's size is
 * left to the browser's own `object-fit: cover`, which is the same crop
 * without the props.
 */
export function CoveredPhoto({
  photo,
  box,
  look,
  prop,
  mirrored,
}: {
  photo: Photo;
  /** The box's shape, in any unit. */
  box: Size;
  look: string;
  prop: PropId;
  mirrored: boolean;
}) {
  const transform = mirrored ? MIRROR_TRANSFORM : undefined;
  if (typeof photo === "string" || !photo.width || !photo.height) {
    const url = typeof photo === "string" ? photo : photo.url;
    return <img src={url} alt="" className="h-full w-full object-cover" style={{ filter: look, transform }} draggable={false} data-photo={url} />;
  }
  const frame = { width: photo.width, height: photo.height };
  return <FramedPhoto photo={{ ...photo, ...frame }} crop={coverCrop(frame, box)} look={look} prop={prop} mirrored={mirrored} />;
}

/**
 * Part of a photo (`crop`, fractions of its frame) filling its parent,
 * which must be positioned, sized and clip its overflow. The whole frame
 * is laid out at the scale the crop needs and shifted so only the crop
 * shows, with the props on it at the frame's own coordinates, which is
 * where the compositor draws them. The look and the mirror apply to the
 * visible box, photo and props together, as they do on the print; the
 * box flips about its own middle, so a crop off the frame's centre (a
 * face's close-up) still shows the same face.
 */
export function FramedPhoto({
  photo,
  crop,
  look,
  prop,
  mirrored,
}: {
  photo: { url: string; width: number; height: number; faces: readonly Face[] | null };
  crop: Crop;
  look: string;
  prop: PropId;
  mirrored: boolean;
}) {
  return (
    <div className="absolute inset-0" style={{ filter: look, transform: mirrored ? MIRROR_TRANSFORM : undefined }} data-photo={photo.url}>
      <div
        className="absolute"
        style={{
          left: percent(-crop.x / crop.width),
          top: percent(-crop.y / crop.height),
          width: percent(1 / crop.width),
          height: percent(1 / crop.height),
        }}
      >
        <img src={photo.url} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
        {photo.faces && <PropLayer faces={photo.faces} prop={prop} frame={photo} />}
      </div>
    </div>
  );
}

/**
 * A fraction as a CSS percentage, to a millionth: the browser keeps six
 * significant figures of a style it is given, so a longer number the
 * server rendered would not match the one it hydrates.
 */
function percent(fraction: number): string {
  return `${+(fraction * 100).toFixed(4)}%`;
}

const PROP_URLS = new Map<PropId, string | null>();

function propUrl(id: PropId): string | null {
  if (!PROP_URLS.has(id)) PROP_URLS.set(id, propImageUrl(id));
  return PROP_URLS.get(id)!;
}

/**
 * One prop on each face, laid over a box that is the frame (its parent
 * has the frame's aspect ratio and is positioned): each at `placeProp`'s
 * middle, size and turn, as percentages of the frame, so it lands where
 * the compositor puts it at any size. `keys` keeps a face's prop the
 * same element as the live preview follows it.
 */
export function PropLayer({
  faces,
  prop,
  frame,
  keys,
}: {
  faces: readonly Face[];
  prop: PropId;
  frame: Size;
  keys?: readonly (string | number)[];
}) {
  const url = propUrl(prop);
  if (!url) return null;
  return (
    <>
      {faces.map((face, i) => {
        const p = placeProp(face, prop, frame);
        if (!p) return null;
        return (
          <img
            key={keys?.[i] ?? i}
            src={url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            data-testid="prop"
            style={{
              left: percent((p.x - p.width / 2) / frame.width),
              top: percent((p.y - p.height / 2) / frame.height),
              width: percent(p.width / frame.width),
              height: percent(p.height / frame.height),
              transform: p.angle ? `rotate(${+p.angle.toFixed(3)}deg)` : undefined,
            }}
          />
        );
      })}
    </>
  );
}
