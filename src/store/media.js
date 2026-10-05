const signature = (data, values, offset = 0) => values.every((v, i) => data[offset + i] === v);
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 20000 || height > 20000 || width * height > 40000000) fail("Use an image with valid dimensions and no more than 40 megapixels.");
  return { width, height };
}
function svgMetadata(data) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(data); }
  catch { fail("Use a valid UTF-8 SVG logo."); }
  text = text.replace(/^\uFEFF/, "").replace(/^<\?xml[^?]*\?>\s*/i, "");
  // Deliberately conservative: reject active content, entities, external
  // resources and CSS instead of trying to repair unsafe XML.
  if (!/^\s*<svg(?:\s|>)/.test(text) || !/<\/svg>\s*$/.test(text) ||
    /<!|<\?|&(?!(?:amp|quot|apos|lt|gt);)|\bon[a-z]+\s*=|\b(?:href|src|style)\s*=|javascript:|data:/i.test(text)) fail("Use a simple SVG without scripts, styles, entities or external resources.");
  const allowed = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "linearGradient", "radialGradient", "stop", "title", "desc", "clipPath"]);
  const attributes = new Set(["xmlns", "width", "height", "viewBox", "id", "d", "fill", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "fill-opacity", "opacity", "transform", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "points", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "clip-path", "clip-rule", "preserveAspectRatio", "version"]);
  const stack = [];
  let count = 0;
  for (const token of text.matchAll(/<[^>]*>/g)) {
    if (++count > 10000) fail("Simplify this SVG logo or upload a PNG.");
    const match = token[0].match(/^<(\/?)([A-Za-z]+)([\s\S]*?)(\/?)>$/);
    if (!match || !allowed.has(match[2])) fail("This SVG contains unsupported or unsafe elements. Upload a PNG instead.");
    if (match[1]) {
      if (match[3].trim() || match[4] || stack.pop() !== match[2]) fail("Use a well-formed SVG logo.");
      continue;
    }
    let remainder = match[3];
    remainder = remainder.replace(/\s+([A-Za-z][A-Za-z0-9-]*)\s*=\s*("[^"]*"|'[^']*')/g, (_, key, quoted) => {
      const value = quoted.slice(1, -1);
      if (!attributes.has(key) || /[<>]/.test(value) ||
        (key === "xmlns" && value !== "http://www.w3.org/2000/svg") ||
        (/url\s*\(/i.test(value) && !/^url\(#[A-Za-z0-9_-]+\)$/.test(value))) fail("This SVG contains unsafe attributes. Upload a PNG instead.");
      return "";
    });
    if (remainder.trim()) fail("Use a well-formed SVG logo.");
    if (!match[4]) stack.push(match[2]);
    if (stack.length > 64) fail("Simplify this SVG logo.");
  }
  if (stack.length) fail("Use a well-formed SVG logo.");
  const root = text.match(/<svg\b([^>]*)>/)[1];
  const attribute = (name) => root.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`))?.[1];
  const viewBox = attribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const width = Math.round(parseFloat(attribute("width")) || viewBox?.[2] || 300);
  const height = Math.round(parseFloat(attribute("height")) || viewBox?.[3] || 150);
  return { ext: "svg", contentType: "image/svg+xml", ...dimensions(width, height) };
}
export function validateUpload(data, type) {
  if (!(data instanceof Uint8Array) || !["logo", "image"].includes(type)) fail("Choose a logo or product image.");
  const limit = type === "logo" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
  if (!data.length || data.length > limit) fail(`Use a ${type === "logo" ? "logo up to 5 MB" : "product image up to 10 MB"}.`);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length >= 24 && signature(data, [137,80,78,71,13,10,26,10]) && signature(data, [73,72,68,82], 12)) {
    return { ext: "png", contentType: "image/png", ...dimensions(view.getUint32(16), view.getUint32(20)) };
  }
  if (data.length >= 12 && signature(data, [255,216,255]) && signature(data, [255,217], data.length - 2)) {
    let i = 2;
    while (i + 4 <= data.length) {
      if (data[i++] !== 255) break;
      while (data[i] === 255) i++;
      const marker = data[i++], size = i + 2 <= data.length ? view.getUint16(i) : 0;
      if (size < 2 || i + size > data.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && size >= 7) {
        return { ext: "jpg", contentType: "image/jpeg", ...dimensions(view.getUint16(i + 5), view.getUint16(i + 3)) };
      }
      i += size;
    }
    fail("Use a JPEG with valid image dimensions.");
  }
  if (data.length >= 30 && signature(data, [82,73,70,70]) && signature(data, [87,69,66,80], 8) && view.getUint32(4, true) + 8 === data.length) {
    const chunk = new TextDecoder().decode(data.slice(12, 16));
    let width, height;
    if (chunk === "VP8X") {
      width = 1 + data[24] + (data[25] << 8) + (data[26] << 16);
      height = 1 + data[27] + (data[28] << 8) + (data[29] << 16);
    } else if (chunk === "VP8L" && data[20] === 47) {
      width = 1 + ((data[21] | data[22] << 8) & 0x3fff);
      height = 1 + ((data[22] >> 6 | data[23] << 2 | data[24] << 10) & 0x3fff);
    } else if (chunk === "VP8 " && signature(data, [157,1,42], 23)) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    }
    return { ext: "webp", contentType: "image/webp", ...dimensions(width, height) };
  }
  if (type === "logo" && (data[0] === 60 || data[0] === 32 || data[0] === 10 || data[0] === 239)) return svgMetadata(data);
  fail(type === "logo" ? "Upload a PNG, JPEG, WebP or safe SVG logo." : "Upload a PNG, JPEG or WebP image.");
}
export const MEDIA_KEY = /^stores\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp|svg)$/;
export const mediaUrl = (key) => MEDIA_KEY.test(key ?? "") ? `https://media.lebrands.store/${key}` : "";
export async function serveMedia(request, env) {
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
  const key = new URL(request.url).pathname.slice(1);
  if (!MEDIA_KEY.test(key)) return new Response("Not found", { status: 404 });
  if (!env.MEDIA) return new Response("Media is temporarily unavailable", { status: 503 });
  let object;
  try { object = request.method === "HEAD" ? await env.MEDIA.head(key) : await env.MEDIA.get(key); }
  catch { return new Response("Media is temporarily unavailable", { status: 503 }); }
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    "etag": object.httpEtag,
    "content-length": String(object.size),
  });
  object.writeHttpMetadata(headers);
  // Do not permit uploaded SVGs to inherit arbitrary object metadata.
  headers.set("content-type", ({ png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" })[key.split(".").at(-1)]);
  if (request.headers.get("if-none-match") === object.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}
