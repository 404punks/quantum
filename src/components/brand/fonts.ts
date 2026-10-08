/** Brand font files in /public/fonts, under fixed family names so PNG exports can embed them. */
export const FONT_FILES = [
  { family: "PQC Serif", url: "/fonts/libre-baskerville-700.woff2", weight: 700, style: "normal" },
  { family: "PQC Serif", url: "/fonts/libre-baskerville-700-italic.woff2", weight: 700, style: "italic" },
  { family: "PQC Sans", url: "/fonts/geist-sans-400.woff2", weight: 400, style: "normal" },
  { family: "PQC Sans", url: "/fonts/geist-sans-600.woff2", weight: 600, style: "normal" },
  { family: "PQC Mono", url: "/fonts/geist-mono-400.woff2", weight: 400, style: "normal" },
  { family: "PQC Mono", url: "/fonts/geist-mono-500.woff2", weight: 500, style: "normal" },
] as const;

export const SERIF = "'PQC Serif', Georgia, serif";
export const SANS = "'PQC Sans', ui-sans-serif, system-ui, sans-serif";
export const MONO = "'PQC Mono', ui-monospace, monospace";
