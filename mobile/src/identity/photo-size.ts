// Specify both dimensions: the web manipulator treats a null dimension as zero.
export function photoSize(width: number, height: number, maxEdge = 1800) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error("Fotografia nu are dimensiuni valide. Încearcă din nou.");
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
