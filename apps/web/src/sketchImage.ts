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

export async function transparentSketch(blob: Blob, centered = false): Promise<Blob> {
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
    let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
    for (let i = 0; i < pixels.data.length; i += 4) {
      const alpha = violetStrokeAlpha(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2], paper);
      pixels.data[i] = 94;
      pixels.data[i + 1] = 92;
      pixels.data[i + 2] = 230;
      pixels.data[i + 3] = alpha;
      if (alpha > 12) hasDrawing = true;
      if (centered && alpha > 0) {
        const x = (i / 4) % canvas.width;
        const y = Math.floor(i / 4 / canvas.width);
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (!hasDrawing) throw new Error("Empty illustration");
    ctx.putImageData(pixels, 0, 0);
    let output = canvas;
    if (centered) {
      const width = right - left + 1;
      const height = bottom - top + 1;
      const size = Math.max(canvas.width, canvas.height);
      const fit = size * 0.88 / Math.max(width, height);
      const drawWidth = width * fit;
      const drawHeight = height * fit;
      output = document.createElement("canvas");
      output.width = output.height = size;
      const drawing = output.getContext("2d");
      if (!drawing) throw new Error("Canvas unavailable");
      drawing.imageSmoothingQuality = "high";
      drawing.drawImage(canvas, left, top, width, height, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
    }
    return await new Promise<Blob>((resolve, reject) =>
      output.toBlob(value => value ? resolve(value) : reject(new Error("Image conversion failed")), "image/png"));
  } finally { bitmap.close(); }
}
