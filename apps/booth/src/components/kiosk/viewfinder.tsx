import type { ReactNode } from "react";
import { viewfinderCrop, type Slot } from "@booth/core";

/**
 * The live preview, cropped to what the layout will keep of this shot.
 * The box takes the crop's shape and is as large as the screen allows;
 * the child (the video, the liveview, the fake) is drawn at the camera
 * frame's full size and shifted so only the crop shows. The child must
 * fill its parent; its aspect ratio already matches the frame's.
 */
export function Viewfinder({
  frame,
  slots,
  shot,
  children,
}: {
  /** The camera frame's size in pixels, or its aspect ratio as a stand-in until it is known. */
  frame: { width: number; height: number };
  slots: readonly Slot[];
  shot: number;
  children: ReactNode;
}) {
  const crop = viewfinderCrop(frame, slots, shot);
  const ratio = (crop.width * frame.width) / (crop.height * frame.height);
  return (
    <div className="flex h-full w-full items-center justify-center bg-night [container-type:size]" data-testid="viewfinder">
      <div
        className="relative overflow-hidden"
        style={{ aspectRatio: `${ratio}`, width: `min(100cqw, calc(100cqh * ${ratio}))` }}
        data-testid="viewfinder-crop"
      >
        <div
          className="absolute"
          style={{
            left: `${(-crop.x / crop.width) * 100}%`,
            top: `${(-crop.y / crop.height) * 100}%`,
            width: `${100 / crop.width}%`,
            height: `${100 / crop.height}%`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
