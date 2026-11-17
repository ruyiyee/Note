// Shrinks photos before upload to save storage: longest side at most 2000 px,
// re-encoded at high quality. GIFs, SVGs and images that would not get smaller
// are uploaded unchanged. Runs entirely in the browser.
export const MAX_SIDE = 2000;
const QUALITY = 0.85;

const SKIP = new Set(['image/gif', 'image/svg+xml']);

export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || SKIP.has(file.type)) return file;
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions); }
  catch { return file; } // format the browser cannot decode (e.g. HEIC on some browsers)
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bmp.close(); return file; }
  // PNG/WebP may have transparency: keep it with WebP (falls back to PNG where WebP encoding is unsupported).
  const alpha = file.type === 'image/png' || file.type === 'image/webp';
  if (!alpha) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const type = alpha ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, QUALITY));
  if (!blob || blob.size >= file.size) return file;
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
  return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
}
