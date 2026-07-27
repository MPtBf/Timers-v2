export const WINDOW_WIDTH = 320;
export const WINDOW_HEIGHT = 260;
export const WINDOW_MIN_WIDTH = 280;
export const WINDOW_MIN_HEIGHT = 220;

export const COLORS = {
  bg: "#1a1a1a",
  bgWidget: "#1f1f1f",
  textPrimary: "#e0e0e0",
  textSecondary: "#888888",
  accentStopped: "#4a9eff",
  accentRunning: "#4caf50",
  accentPaused: "#ff9800",
  overtime: "#f44336",
  ringBg: "#2a2a2a",
  ringStopped: "#4a9eff",
  ringRunning: "#4caf50",
  ringPaused: "#ff9800",
  ringOvertime: "#f44336",
  ringWidth: 6,
  btnBg: "#2a2a2a",
  btnBgHover: "#333333",
  btnText: "#e0e0e0",
  dragStrip: "#333333",
} as const;

export const FONTS = {
  display: "ui-monospace, Consolas, monospace",
  ui: "system-ui, 'Segoe UI', Roboto, sans-serif",
} as const;

export const TIMER = {
  tickIntervalMs: 33,
  overtimeBeepIntervalMs: 1000,
  overtimeBeepDurationMs: 50,
  overtimeBeepFreq: 800,
  flashIntervalMs: 5000,
} as const;

export const DRAG_STRIP = {
  height: 6,
} as const;

export const LAYERS = {
  zWindow: 100,
} as const;
