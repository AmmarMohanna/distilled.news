// Map the white-backed JPEG into violet ink without flattening its pencil pressure.
export function violetStrokeAlpha(red: number, green: number, blue?: number, paper: readonly number[] = [255, 255, 255]): number {
  if (blue !== undefined) {
    const pigment = blue - Math.min(red, green) - (paper[2] - Math.min(paper[0], paper[1]));
    if (pigment <= 3) return 0;
    return Math.min(255, Math.round(pigment * 255 / 138));
  }
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
    // Estimate paper color from the outer border, ignoring isolated drawing marks.
    const channels: number[][] = [[], [], []];
    for (let y = 0; y < canvas.height; y += 4) for (let x = 0; x < canvas.width; x += 4) {
      if (x > 8 && x < canvas.width - 9 && y > 8 && y < canvas.height - 9) continue;
      const offset = (y * canvas.width + x) * 4;
      for (let channel = 0; channel < 3; channel++) channels[channel].push(pixels.data[offset + channel]);
    }
    const paper = channels.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 255);
    let hasDrawing = false;
    for (let i = 0; i < pixels.data.length; i += 4) {
      const alpha = violetStrokeAlpha(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2], paper);
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
