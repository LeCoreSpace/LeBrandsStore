// Pure helpers for the product media editor: limits, validation, 4:5 crop maths and encoding.
export const MEDIA_LIMITS = Object.freeze({
  maxAssets: 8, maxBytes: 10 * 1024 * 1024, maxPixels: 40e6, maxAxis: 20000,
  outW: 1200, outH: 1500, ratio: 4 / 5, maxVideoSeconds: 30,
  imageTypes: ["image/jpeg", "image/png", "image/webp"], videoTypes: ["video/mp4", "video/webm"],
});
export const formatBytes = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
export function classifyFile(file) {
  if (MEDIA_LIMITS.imageTypes.includes(file.type)) return "image";
  if (MEDIA_LIMITS.videoTypes.includes(file.type)) return "video";
  return "";
}
export function validateFile(file) {
  const type = classifyFile(file);
  if (!type) return { ok: false, error: `${file.name} is not supported. Use JPEG, PNG or WebP images, or MP4 or WebM video.` };
  if (file.size > MEDIA_LIMITS.maxBytes) return { ok: false, error: `${file.name} is ${formatBytes(file.size)}. The limit is 10 MB.` };
  if (!file.size) return { ok: false, error: `${file.name} is empty.` };
  return { ok: true, type };
}
export function validateDimensions(w, h) {
  if (!(w > 0 && h > 0)) return "The image has no readable size.";
  if (w > MEDIA_LIMITS.maxAxis || h > MEDIA_LIMITS.maxAxis) return "The image is longer than 20000 pixels on one side.";
  if (w * h > MEDIA_LIMITS.maxPixels) return "The image is over 40 megapixels.";
  return "";
}
// View is the on-screen 4:5 frame (vw x vh). state: {fit, zoom>=1, ox, oy} where ox/oy shift the image in frame pixels.
export function layoutImage(iw, ih, vw, vh, state) {
  const cover = Math.max(vw / iw, vh / ih), contain = Math.min(vw / iw, vh / ih);
  const scale = state.fit ? contain : cover * Math.max(1, state.zoom || 1);
  const dw = iw * scale, dh = ih * scale;
  const mx = Math.max(0, (dw - vw) / 2), my = Math.max(0, (dh - vh) / 2);
  const ox = state.fit ? 0 : Math.min(mx, Math.max(-mx, state.ox || 0));
  const oy = state.fit ? 0 : Math.min(my, Math.max(-my, state.oy || 0));
  return { scale, dw, dh, ox, oy, x: (vw - dw) / 2 + ox, y: (vh - dh) / 2 + oy, mx, my };
}
export function outputSize(iw, ih, vw, vh, state) {
  const l = layoutImage(iw, ih, vw, vh, state);
  const srcW = vw / l.scale; // source pixels spanned by the frame width
  const units = Math.floor(Math.min(MEDIA_LIMITS.outW, srcW) / 4);
  if(units<1)throw new Error("This image is too small at this zoom. Reduce zoom or choose a larger image.");
  return { w: units * 4, h: units * 5 };
}
export function renderCrop(source, iw, ih, vw, vh, state) {
  const l = layoutImage(iw, ih, vw, vh, state), size = outputSize(iw, ih, vw, vh, state);
  const canvas = document.createElement("canvas"); canvas.width = size.w; canvas.height = size.h;
  const ctx = canvas.getContext("2d"), k = size.w / vw;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size.w, size.h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, l.x * k, l.y * k, l.dw * k, l.dh * k);
  return canvas;
}
export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("The browser could not encode this image.")), type, quality));
}
// Tries WebP at falling quality until under the limit. Reports honestly if the browser fell back to PNG.
export async function encodeWebp(canvas) {
  for (const q of [0.86, 0.74, 0.6, 0.46]) {
    const blob = await canvasToBlob(canvas, "image/webp", q);
    if (blob.type !== "image/webp") return { blob, format: blob.type, webp: false };
    if (blob.size <= MEDIA_LIMITS.maxBytes) return { blob, format: "image/webp", webp: true };
  }
  throw new Error("The cropped image is still over 10 MB. Try a smaller image.");
}
export function webmSupport() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(t => MediaRecorder.isTypeSupported(t)) || "";
}
