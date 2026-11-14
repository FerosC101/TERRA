/**
 * Chart colours for the light surface. The categorical order is fixed and was
 * checked for lightness band, colour-vision separation and contrast on white.
 * By convention across TERRA: green = field measurement, blue = satellite or
 * rainfall, violet = model output, amber = a second comparison series.
 * Status colours are reserved for state and never used as "series 4".
 */
export const SERIES = {
  green: "#2F7D46",
  blue: "#2F6FB2",
  amber: "#B7791F",
  violet: "#7A5AC2",
} as const;

export const CATEGORICAL = [SERIES.green, SERIES.blue, SERIES.amber, SERIES.violet];

export const STATUS = {
  good: "#37864A",
  warning: "#9A6410",
  critical: "#B0463A",
  neutral: "#93A097",
} as const;

export const CHART = {
  grid: "#ECEFEA",
  axis: "#68766D",
  reference: "#93A097",
  ink: "#183B2A",
  surface: "#FFFFFF",
};
