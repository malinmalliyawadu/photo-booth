/**
 * Copies MediaPipe's WebAssembly runtime out of node_modules into
 * public/, where the kiosk's face detector loads it from the booth
 * itself rather than a CDN: the booth's internet is never in a guest's
 * way. Run before every dev and build, so the runtime always matches
 * the installed @mediapipe/tasks-vision. The model it runs
 * (blaze_face_full_range.tflite) is not on npm and is checked in beside.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const out = path.resolve(import.meta.dirname, "../public/mediapipe/wasm");

await mkdir(out, { recursive: true });
// The SIMD build is what Safari since 16.4 runs; the other is the fallback FilesetResolver picks without SIMD.
for (const name of ["vision_wasm_internal", "vision_wasm_nosimd_internal"]) {
  for (const ext of [".js", ".wasm"]) {
    await copyFile(require.resolve(`@mediapipe/tasks-vision/${name}${ext}`), path.join(out, name + ext));
  }
}
