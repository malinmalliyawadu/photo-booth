/**
 * The camera, as the worker sees it.
 *
 * There is one operation that matters: `shoot`. gphoto2 cannot stream
 * liveview and capture a still from two processes, because both need to
 * hold the USB device, so `shoot` stops the preview, fires, downloads
 * and restarts the preview. The kiosk freezes the last preview frame at
 * zero on the countdown, and the gap reads as the flash.
 *
 * The iPad camera is not a `Camera`: in that mode the kiosk captures
 * through getUserMedia and uploads the frame, and the worker's capture
 * job only arms a timeout. See the session state machine.
 */
export type CameraMode = "fake" | "gphoto2" | "ipad";

export interface CameraStatus {
  ok: boolean;
  /** Human sentence for the admin page: "Canon EOS 250D on USB", "No camera found". */
  detail: string;
}

export interface Camera {
  readonly kind: Exclude<CameraMode, "ipad">;
  /** Begin liveview. Idempotent. */
  start(): Promise<void>;
  /** Release the device. Idempotent. */
  stop(): Promise<void>;
  /** Take one still and write it as a JPEG at `destPath`. Throws on failure. */
  shoot(destPath: string): Promise<void>;
  status(): CameraStatus;
}
