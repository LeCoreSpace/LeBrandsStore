// New optional theme uploads only. Existing merchant photos are never replaced.
export async function prepareAuraPhoto(file) {
  if(!["image/png","image/jpeg","image/webp","image/avif"].includes(file.type))throw new Error("Choose a PNG, JPEG, WebP or AVIF photo.");
  if(file.size>10*1024*1024)throw new Error("Choose a photo no larger than 10 MB.");
  let bitmap;
  try{bitmap=await createImageBitmap(file);}
  catch{throw new Error("This photo could not be opened. Choose a valid image.");}
  try{
    if(bitmap.width*bitmap.height>40000000)throw new Error("Choose a photo no larger than 40 megapixels.");
    const ratio=Math.min(1,2000/bitmap.width,20000/bitmap.height);
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",0.9));
    if(!blob||blob.type!=="image/webp")throw new Error("This browser cannot prepare WebP photos. Try a current browser.");
    return new File([blob],`${file.name.replace(/\.[^/.]+$/,"")}.webp`,{type:"image/webp"});
  }finally{bitmap.close();}
}

export const RENDITION_WIDTHS = [480, 768, 1200, 1600];
/** Pure: which widths to build. Never above the primary width, never a duplicate of it. */
export function renditionWidths(primaryWidth, widths = RENDITION_WIDTHS) {
  return widths.filter(width => Number.isInteger(primaryWidth) && width < primaryWidth);
}
/** Pure: sizes preserving aspect ratio. */
export function scaledSize(width, height, targetWidth) {
  return { width: targetWidth, height: Math.max(1, Math.round(height * targetWidth / width)) };
}
/** Pure: media DTO with sources (smallest first, primary last) built from uploaded records. */
export function mediaWithSources(primary, renditions, alt) {
  const dto = { url: primary.url, alt: String(alt ?? primary.alt ?? "").trim() };
  for (const key of ["width", "height"]) if (Number.isInteger(primary[key]) && primary[key] > 0) dto[key] = primary[key];
  const sources = [...(renditions || []), ...(Array.isArray(primary.sources) ? primary.sources : [])]
    .filter(item => item?.url && Number.isInteger(item.width) && Number.isInteger(item.height) && (!dto.width || item.width < dto.width))
    .map(item => ({ url: item.url, width: item.width, height: item.height }));
  const seen = new Set();
  const unique = sources.filter(item => !seen.has(item.url) && seen.add(item.url)).sort((a, b) => a.width - b.width);
  if (unique.length) dto.sources = unique;
  return dto;
}
/** Browser only. Returns { primary: File, renditions: [{ file, width, height }] } (all WebP). */
export async function prepareAuraRenditions(file) {
  const primary = await prepareAuraPhoto(file);
  const bitmap = await createImageBitmap(primary);
  const renditions = [];
  try {
    for (const target of renditionWidths(bitmap.width)) {
      const size = scaledSize(bitmap.width, bitmap.height, target);
      const canvas = document.createElement("canvas");
      canvas.width = size.width; canvas.height = size.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.85));
      if (!blob || blob.type !== "image/webp" || blob.size >= primary.size) continue;
      renditions.push({ file: new File([blob], primary.name.replace(/\.webp$/, `-${target}.webp`), { type: "image/webp" }), ...size });
    }
  } finally { bitmap.close(); }
  return { primary, renditions };
}
/**
 * Upload primary then each rendition once, then persist the link. Renditions are optional:
 * if they fail the primary still stands and `warning` explains.
 * api(path, options) must throw on failure. Returns { media, warning }.
 */
export async function uploadAuraImage(file, { api, base, alt }) {
  const { primary, renditions } = await prepareAuraRenditions(file);
  const send = async upload => {
    const form = new FormData(); form.append("file", upload); form.append("type", "image"); form.append("alt", alt);
    const result = await api(`${base}/media`, { method: "POST", body: form });
    if (!result.media?.url) throw new Error("The upload did not return media details.");
    return result.media;
  };
  const main = await send(primary);
  const done = [];
  let warning = "";
  try {
    for (const item of renditions) { const record = await send(item.file); done.push({ record, ...{ width: record.width || item.width, height: record.height || item.height } }); }
    if (done.length && main.id) await api(`${base}/media/${encodeURIComponent(main.id)}`, { method: "PATCH", body: JSON.stringify({ rendition_ids: done.map(item => item.record.id).filter(Boolean) }) });
    else if (done.length) throw new Error("no media id");
  } catch { warning = "Smaller sizes could not be saved. The photo was added at full size."; done.length = 0; }
  const media = mediaWithSources(main, done.map(item => ({ url: item.record.url, width: item.width, height: item.height })), alt);
  return { media, warning };
}
