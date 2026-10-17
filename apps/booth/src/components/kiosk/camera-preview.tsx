"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState, type RefObject } from "react";
import { Camera } from "lucide-react";
import type { CameraMode, PropId, Size, Slot } from "@booth/core";
import type { FaceFinder } from "./face-finder";
import { LiveCamera } from "./live-camera";
import type { IpadCamera } from "./use-ipad-camera";
import { Viewfinder } from "./viewfinder";

const PREVIEW_STREAM_URL = "/preview/stream";

/** Stand-ins for the camera frame's shape until the camera reports it. */
export const IPAD_FRAME = { width: 4, height: 3 };
const DSLR_FRAME = { width: 3, height: 2 };

/**
 * The booth's camera as the guests see it, in the viewfinder's crop for
 * one shot of a layout: the iPad's front camera, the DSLR's liveview, or
 * the fake camera's stand-in. One component for every screen that shows
 * the mirror (the pose ideas, the props, the countdown), so they agree.
 */
export function CameraPreview({
  cameraMode,
  camera,
  finder,
  slots,
  shot,
  prop,
  look,
  videoRef,
  onPeople,
}: {
  cameraMode: CameraMode;
  camera: IpadCamera;
  /** Finds the faces for the props and the head count; null until it loads. */
  finder: FaceFinder | null;
  slots: readonly Slot[];
  shot: number;
  prop: PropId;
  look: string;
  /** The iPad's video element, for a screen that reads frames from it. */
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Told how many faces the iPad sees, for a screen that plans for them. */
  onPeople?: (count: number) => void;
}) {
  const own = useRef<HTMLVideoElement>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  const ipad = cameraMode === "ipad";
  return (
    <Viewfinder frame={frame ?? (ipad ? IPAD_FRAME : DSLR_FRAME)} slots={slots} shot={shot}>
      {ipad ? (
        <LiveCamera
          stream={camera.stream}
          videoRef={videoRef ?? own}
          frame={frame}
          onFrame={setFrame}
          finder={finder}
          prop={prop}
          look={look}
          onPeople={onPeople}
        />
      ) : (
        <div className="h-full w-full" style={{ filter: look }} data-testid="viewfinder-look">
          {cameraMode === "gphoto2" ? (
            <img
              src={PREVIEW_STREAM_URL}
              alt=""
              className="h-full w-full object-cover"
              onLoad={(e) => setFrame({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            />
          ) : (
            <FakeViewfinder />
          )}
        </div>
      )}
    </Viewfinder>
  );
}

/** Stands in for the live preview when the fake camera is in use. */
function FakeViewfinder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_50%_35%,#3a2d3f_0%,#1a1320_55%,#0d0a0f_100%)]">
      <div className="flex flex-col items-center gap-3 opacity-50">
        <Camera className="h-20 w-20 text-ivory-faint" strokeWidth={1.1} />
        <p className="eyebrow eyebrow-dim">Fake camera</p>
      </div>
    </div>
  );
}
