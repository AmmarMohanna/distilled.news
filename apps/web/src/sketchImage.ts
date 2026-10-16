// Map the white-backed JPEG into violet ink without flattening its pencil pressure.
export function violetStrokeAlpha(red: number, green: number): number {
  const ink = 255 - Math.min(red, green);
  // Ignore near-white JPEG noise, but retain faint construction strokes.
  if (ink <= 4) return 0;
  return Math.min(255, Math.round(ink * 255 / 163));
}

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
    let hasDrawing = false;
    for (let i = 0; i < pixels.data.length; i += 4) {
      const alpha = violetStrokeAlpha(pixels.data[i], pixels.data[i + 1]);
      pixels.data[i] = 94;
      pixels.data[i + 1] = 92;
      pixels.data[i + 2] = 230;
      pixels.data[i + 3] = alpha;
      if (alpha > 12) hasDrawing = true;
    }
    if (!hasDrawing) throw new Error("Empty illustration");
    ctx.putImageData(pixels, 0, 0);
    // Preserve the model's square composition and whitespace instead of
    // tightly cropping and enlarging delicate marks.
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("Image conversion failed")), "image/png"));
  } finally { bitmap.close(); }
}
