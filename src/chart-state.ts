export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
export type ZoomWindow = { startValue: number; endValue: number };
export function zoomForBounds(saved: ZoomWindow | null, min: number, max: number) {
  const start = Math.max(min, saved?.startValue ?? min);
  const end = Math.min(max, saved?.endValue ?? max);
  return start < end ? { startValue: start, endValue: end } : { startValue: min, endValue: max };
}
