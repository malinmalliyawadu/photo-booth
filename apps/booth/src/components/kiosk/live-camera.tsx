"use client";

import { useEffect, useImperativeHandle, useRef, type Ref, type RefObject } from "react";
import type { PropId, Size } from "@booth/core";
import { MIRROR_TRANSFORM, PropLayer } from "@/components/composite";
import { useTrackedFaces, type FaceFinder } from "./face-finder";

/**
 * The front camera as the guests see it: mirrored, in the look they
 * picked, with their props following their faces. The look, the mirror
 * and the props are all on the screen only; the frame the iPad reads
 * from the video underneath is the camera's own. Fills its parent,
 * which has the frame's aspect ratio (the viewfinder sees to that).
 */
export function LiveCamera({
  stream,
  videoRef,
  frame,
  onFrame,
  finder,
  prop,
  look,
  onPeople,
}: {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The camera frame's size once known; the props wait for it. */
  frame: Size | null;
  onFrame: (frame: Size) => void;
  finder: FaceFinder | null;
  prop: PropId;
  look: string;
  /** Told how many faces are in the frame, for a screen that plans for them; the faces are tracked for it even with no props on. */
  onPeople?: (count: number) => void;
}) {
  const tracked = useTrackedFaces(finder, videoRef, (prop !== "none" || onPeople !== undefined) && stream !== null);
  const people = tracked.length;
  useEffect(() => {
    onPeople?.(people);
  }, [onPeople, people]);
  return (
    <div className="relative h-full w-full" style={{ filter: look, transform: MIRROR_TRANSFORM }} data-testid="viewfinder-look">
      <LiveVideo stream={stream} videoRef={videoRef} onFrame={onFrame} />
      {frame && prop !== "none" && tracked.length > 0 && (
        <PropLayer faces={tracked.map((t) => t.face)} keys={tracked.map((t) => t.id)} prop={prop} frame={frame} />
      )}
    </div>
  );
}

/** The front camera's video. Reports the frame size, which changes when the iPad is rotated. */
function LiveVideo({
  stream,
  videoRef,
  onFrame,
}: {
  stream: MediaStream | null;
  videoRef: Ref<HTMLVideoElement>;
  onFrame: (frame: Size) => void;
}) {
  const own = useRef<HTMLVideoElement>(null);
  useImperativeHandle(videoRef, () => own.current!, []);
  useEffect(() => {
    const v = own.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    const report = () => {
      if (v.videoWidth > 0) onFrame({ width: v.videoWidth, height: v.videoHeight });
    };
    report();
    v.addEventListener("loadedmetadata", report);
    v.addEventListener("resize", report);
    return () => {
      v.removeEventListener("loadedmetadata", report);
      v.removeEventListener("resize", report);
    };
  }, [stream, onFrame]);
  return <video ref={own} autoPlay playsInline muted className="h-full w-full object-cover" data-testid="live-video" />;
}
