/**
 * The compositor: a session's photos laid into its layout, with the
 * look and the mirror the guest chose on the review screen, as three
 * JPEGs: the postcard for the printer, the web photo for the gallery and
 * the screens, and a thumbnail.
 *
 * The geometry and the colour arithmetic are in core (`placePhotos`,
 * `planOutputs`, `applyLook`) and tested there; this file is the sharp
 * that carries them out. Each shot is decoded once, upright and in sRGB,
 * and every slot it fills is cut from that: cropped like CSS
 * `object-fit: cover`, scaled to the slot, flopped if mirrored, and put
 * through the look, which is what `Composite` draws in the browser. The
 * photos go on white paper, the knocked-out overlay on top.
 */
import { access } from "node:fs/promises";
import sharp from "sharp";
import { PRINT_DPI, applyLook, placePhotos, planOutputs, type Size } from "@booth/core";
import {
  ensureDir,
  getSession,
  getTemplate,
  listShots,
  removeData,
  resolveData,
  sessionPaths,
  setComposite,
  templatePaths,
} from "@booth/db";

const PAPER = { r: 255, g: 255, b: 255 };
/** The printer gets the best the card can show; 4:4:4 keeps thin type in the design crisp. */
const PRINT_JPEG = { quality: 95, chromaSubsampling: "4:4:4" } as const;
const WEB_JPEG = { quality: 85, mozjpeg: true } as const;
const THUMB_JPEG = { quality: 80, mozjpeg: true } as const;

export interface Composed {
  compositePath: string;
  webPath: string;
  thumbPath: string;
}

interface Frame {
  data: Buffer;
  size: Size;
}

/**
 * Composes a session from what is stored on it now and records the
 * files on the row (`setComposite`), replacing any earlier ones. Throws
 * with a sentence for the admin page when it cannot: a photo missing or
 * unreadable, the layout gone, the session deleted meanwhile.
 */
export async function composeSession(id: string): Promise<Composed> {
  const session = await getSession(id);
  if (!session || session.deletedAt) throw new Error("the session was deleted");
  const template = await getTemplate(session.templateId);
  if (!template) throw new Error("its layout is gone");
  const overlay = resolveData(templatePaths.overlay(template.id));
  await access(overlay).catch(() => {
    throw new Error(`the layout's overlay file is missing (${templatePaths.overlay(template.id)})`);
  });

  const frames = new Map<number, Frame>();
  for (const { shot, path } of await listShots(id)) {
    if (shot > session.shotCount) continue;
    frames.set(shot, await decode(resolveData(path), shot));
  }
  const placements = placePhotos(template, new Map([...frames].map(([shot, f]) => [shot, f.size])));

  const photos = await Promise.all(
    placements.map(async ({ shot, crop, dest }) => {
      const frame = frames.get(shot)!;
      let photo = sharp(frame.data, { raw: { ...frame.size, channels: 3 } })
        .extract(crop)
        .resize(dest.width, dest.height, { fit: "fill" });
      if (session.mirrored) photo = photo.flop();
      const { data, info } = await photo.raw().toBuffer({ resolveWithObject: true });
      applyLook(data, 3, session.filter);
      return {
        input: data,
        raw: { width: info.width, height: info.height, channels: 3 as const },
        left: dest.left,
        top: dest.top,
      };
    }),
  );

  const layout = await sharp({
    create: { width: template.width, height: template.height, channels: 3, background: PAPER },
  })
    .composite([...photos, { input: overlay }])
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { width: layout.info.width, height: layout.info.height, channels: 3 as const };
  const composed = () => sharp(layout.data, { raw });
  const plan = planOutputs(raw);

  const paths: Composed = {
    compositePath: sessionPaths.composite(id),
    webPath: sessionPaths.web(id),
    thumbPath: sessionPaths.thumb(id),
  };
  await ensureDir(sessionPaths.dir(id));
  try {
    // Turned a quarter first, in a pipeline of its own: sharp's
    // operation order would otherwise resize before it rotates.
    const upright = plan.print.rotate
      ? sharp(await composed().rotate(plan.print.rotate).raw().toBuffer(), {
          raw: { width: raw.height, height: raw.width, channels: 3 },
        })
      : composed();
    await Promise.all([
      upright
        .resize(plan.print.width, plan.print.height, { fit: "cover" })
        .withMetadata({ density: PRINT_DPI })
        .jpeg(PRINT_JPEG)
        .toFile(resolveData(paths.compositePath)),
      composed()
        .resize(plan.web.width, plan.web.height, { fit: "fill" })
        .withIccProfile("srgb")
        .jpeg(WEB_JPEG)
        .toFile(resolveData(paths.webPath)),
      composed()
        .resize(plan.thumb.width, plan.thumb.height, { fit: "fill" })
        .withIccProfile("srgb")
        .jpeg(THUMB_JPEG)
        .toFile(resolveData(paths.thumbPath)),
    ]);
  } catch (err) {
    await Promise.all(Object.values(paths).map((p) => removeData(p).catch(() => undefined)));
    throw err;
  }
  if (!(await setComposite(id, paths))) throw new Error("the session was deleted");
  return paths;
}

/** A shot upright (EXIF orientation applied), in sRGB, three channels. */
async function decode(absPath: string, shot: number): Promise<Frame> {
  try {
    const { data, info } = await sharp(absPath)
      .autoOrient()
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, size: { width: info.width, height: info.height } };
  } catch (err) {
    throw new Error(`photo ${shot} cannot be read: ${err instanceof Error ? err.message : String(err)}`);
  }
}
