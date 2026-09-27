// Convert the generated line drawing into transparent, theme-colored ink.
// AI returns JPEG, so asking the model for transparency alone cannot provide it.
export async function transparentSketch(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const darkness = 255 - Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
      const alpha = Math.min(255, Math.max(0, (darkness - 32) * 2.5));
      pixels.data[i] = 75; pixels.data[i + 1] = 172; pixels.data[i + 2] = 157; pixels.data[i + 3] = alpha;
      if (alpha > 40) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    ctx.putImageData(pixels, 0, 0);
    if (right > left && bottom > top) {
      const crop = document.createElement("canvas");
      const padding = Math.ceil(Math.max(right - left, bottom - top) * .08);
      crop.width = right - left + 1 + padding * 2;
      crop.height = bottom - top + 1 + padding * 2;
      crop.getContext("2d")!.drawImage(canvas, left, top, right - left + 1, bottom - top + 1, padding, padding, right - left + 1, bottom - top + 1);
      return await new Promise<Blob>((resolve, reject) => crop.toBlob(value => value ? resolve(value) : reject(new Error("Image conversion failed")), "image/png"));
    }
    throw new Error("Empty illustration");
  } finally { bitmap.close(); }
}
