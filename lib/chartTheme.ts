/**
 * Chart colours. The categorical order is fixed and validated for the dark
 * surface (lightness band, colour-vision separation, contrast). Status colours
 * are reserved for state and never used as "series 4".
 */
export const SERIES = {
  green: "#2EA043",
  blue: "#4493F8",
  amber: "#B8850E",
  violet: "#A371F7",
} as const;

export const CATEGORICAL = [SERIES.green, SERIES.blue, SERIES.amber, SERIES.violet];

export const STATUS = {
  good: "#39D353",
  warning: "#E3B341",
  critical: "#F47067",
  neutral: "#8B9490",
} as const;

export const CHART = {
  grid: "rgba(139,148,144,0.16)",
  axis: "#8B9490",
  reference: "#8B9490",
};
