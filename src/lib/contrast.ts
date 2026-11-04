// Text colour for a coloured fill: ink or white, whichever has the higher WCAG contrast.
export const INK = "#201C1D";
const WHITE = "#FFFFFF";

/** WCAG relative luminance of a #RRGGBB colour. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two #RRGGBB colours. */
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Ink or white on `fill`, whichever reads better. */
export const inkOn = (fill: string) => (contrast(fill, WHITE) > contrast(fill, INK) ? WHITE : INK);
