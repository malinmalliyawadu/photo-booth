import type { Camera, CameraMode } from "@booth/core";
import { FakeCamera } from "./fake";

/**
 * The worker's camera for a mode. The iPad mode has no worker camera:
 * the kiosk captures and uploads, so this returns null and the capture
 * handler only logs that it is waiting.
 */
export function cameraFor(mode: CameraMode): Camera | null {
  switch (mode) {
    case "fake":
      return new FakeCamera();
    case "ipad":
      return null;
    case "gphoto2":
      throw new Error("The gphoto2 camera arrives in phase 3; use fake or ipad for now");
  }
}
