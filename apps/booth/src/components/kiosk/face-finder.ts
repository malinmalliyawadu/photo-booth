"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { FaceDetector } from "@mediapipe/tasks-vision";
import { facesFromDetections, trackFaces, type Face, type TrackedFace } from "@booth/core";

/** MediaPipe's runtime and the model, served by the booth itself (scripts/mediapipe.mjs). */
const WASM = "/mediapipe/wasm";
const MODEL = "/mediapipe/blaze_face_full_range.tflite";
/**
 * The detector is given a copy of the frame this wide. Its model looks
 * at 192 × 192 whatever it is given, so a bigger copy finds nothing
 * more and costs a full-size readback of a 12-megapixel frame; this
 * one takes about 10 ms.
 */
const DETECT_WIDTH = 640;
const MIN_CONFIDENCE = 0.5;
/** How often the live preview looks again: smooth enough for a crown, light enough to leave the iPad cool. */
const TRACK_EVERY_MS = 50;
const RETRY_MS = 10_000;

/** Finds the faces in a picture: the camera's video, or a frame drawn on a canvas. */
export interface FaceFinder {
  find(source: HTMLVideoElement | HTMLCanvasElement, width: number, height: number): Face[];
}

export type FinderStatus = "off" | "loading" | "ready" | "error";

/**
 * MediaPipe's face detector, loaded once for the page from the booth
 * and shared by the live preview and the capture, which take turns on
 * it: detection is synchronous, so they cannot overlap.
 */
export function useFaceFinder(enabled: boolean): { finder: FaceFinder | null; status: FinderStatus } {
  const [finder, setFinder] = useState<FaceFinder | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      loadFinder().then(
        (f) => {
          if (disposed) return;
          setFinder(f);
          setFailed(false);
        },
        (err: unknown) => {
          if (disposed) return;
          console.warn("The face detector would not load; props are off until it does", err);
          setFailed(true);
          retry = setTimeout(load, RETRY_MS);
        },
      );
    };
    load();
    return () => {
      disposed = true;
      clearTimeout(retry);
    };
  }, [enabled]);
  if (!enabled) return { finder: null, status: "off" };
  return { finder, status: finder ? "ready" : failed ? "error" : "loading" };
}

let loading: Promise<FaceFinder> | null = null;

function loadFinder(): Promise<FaceFinder> {
  loading ??= (async () => {
    const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const detector = await quietly(() =>
      FaceDetector.createFromOptions(fileset, {
        // The CPU: Safari's WebGL path in MediaPipe is the less reliable,
        // and at this size the CPU is quick enough.
        baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: MIN_CONFIDENCE,
      }),
    );
    return finderFor(detector);
  })();
  // A failed load is tried again from scratch.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * MediaPipe's runtime writes its start-up chatter ("INFO: Created
 * TensorFlow Lite XNNPACK delegate for CPU.") to stderr, which the
 * browser shows as an error, and Next's dev overlay counts. While it
 * loads, its INFO lines go to console.info instead; anything else is
 * still an error.
 */
async function quietly<T>(load: () => Promise<T>): Promise<T> {
  const error = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) console.info(...args);
    else error(...args);
  };
  try {
    return await load();
  } finally {
    console.error = error;
  }
}

function finderFor(detector: FaceDetector): FaceFinder {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return {
    find(source, width, height) {
      if (!ctx || width <= 0 || height <= 0) return [];
      const scale = Math.min(1, DETECT_WIDTH / width);
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(source, 0, 0, w, h);
      return facesFromDetections(detector.detect(canvas).detections, { width: w, height: h });
    },
  };
}

/**
 * The faces in the live preview, followed from frame to frame
 * (`trackFaces`), for drawing props on as the guests move. Runs only
 * while `enabled`, so the iPad is not detecting faces nobody sees.
 */
export function useTrackedFaces(
  finder: FaceFinder | null,
  video: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): TrackedFace[] {
  const [tracked, setTracked] = useState<TrackedFace[]>([]);
  const followed = useRef<TrackedFace[]>([]);
  useEffect(() => {
    if (!finder || !enabled) return;
    let frame = 0;
    let last = 0;
    let id = 0;
    const nextId = () => ++id;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < TRACK_EVERY_MS) return;
      last = now;
      const v = video.current;
      if (!v || v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || v.videoWidth === 0) return;
      let faces: Face[];
      try {
        faces = finder.find(v, v.videoWidth, v.videoHeight);
      } catch (err) {
        console.warn("Face detection failed on the live preview", err);
        return;
      }
      const next = trackFaces(followed.current, faces, now, nextId);
      // Nothing to draw before and after: no render.
      if (next.length === 0 && followed.current.length === 0) return;
      followed.current = next;
      setTracked(next);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      followed.current = [];
      setTracked([]);
    };
  }, [finder, video, enabled]);
  return tracked;
}
