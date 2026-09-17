import type { CSSProperties } from "react";

export const defaultThemeColor = "#58b7a4";
export const themePresets = [
  { name: "青绿", color: defaultThemeColor },
  { name: "湖蓝", color: "#4285e6" },
  { name: "紫罗兰", color: "#9061d4" },
  { name: "玫瑰", color: "#d95c93" },
  { name: "暖橙", color: "#e58a36" },
  { name: "石墨", color: "#64748b" }
];

export function isThemeColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function createTheme(color: string, dark = false) {
  const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  const mix = (target: number, ratio: number) => `rgb(${rgb.map((value) => Math.round(value * (1 - ratio) + target * ratio)).join(", ")})`;
  const [r, g, b] = rgb.map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const hue = delta === 0 ? 0 : (60 * (max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) + 360) % 360;
  const linear = rgb.map((value) => value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const foreground = luminance > 0.179 ? "#172033" : "#ffffff";
  const strong = dark ? mix(255, 0.55) : mix(0, 0.58);
  const soft = dark ? mix(0, 0.76) : mix(255, 0.9);
  const rgba = (alpha: number) => `rgba(${rgb.join(", ")}, ${alpha})`;
  // Keep task bars visible even when the selected panel color is near white or black.
  const palette = [0, 48, 190, 95, 255, 315].map((offset) => `hsl(${(hue + offset) % 360}, ${delta < 0.05 ? 12 : 55}%, ${dark ? 62 : 42}%)`);
  const style = {
    "--theme-accent": color,
    "--theme-foreground": foreground,
    "--theme-strong": strong,
    "--theme-soft": soft,
    "--theme-border": dark ? mix(0, 0.48) : mix(255, 0.68),
    "--theme-glow": rgba(0.16),
    "--theme-background": dark ? mix(0, 0.90) : mix(255, 0.95),
    "--theme-surface": dark ? mix(0, 0.85) : mix(255, 0.98)
  } as CSSProperties;
  return { dark, text: dark ? "#e8edf5" : "#343a45", muted: dark ? "#b3bdce" : "#646a73", border: dark ? "#485262" : "#d7e1ee", grid: dark ? "#323a48" : "#edf3f9", surface: dark ? "#202630" : "#ffffff", color, strong, soft, rgba, palette, style };
}

export type PanelTheme = ReturnType<typeof createTheme>;
