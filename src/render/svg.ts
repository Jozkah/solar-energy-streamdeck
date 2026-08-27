/**
 * Key-image renderer: composes a high-contrast SVG and returns a data URI for
 * `action.setImage`. No native canvas dependency.
 *
 * Icons reuse the upstream dashboard's iOS/Tesla-style stroked SVG set
 * (viewBox 24, stroke-width 1.8); car/battery/grid are drawn in the same style.
 * Layout is tuned for the 144x144 Stream Deck key raster and a dark key face.
 */
import { COLORS, type FeedHealth } from "../data/status";
import type { IconName } from "../data/metrics";

interface IconDef {
  path: string;
  fill?: boolean;
}

const ICONS: Record<IconName, IconDef> = {
  // Verbatim from public/home.js / public/app.js:
  sun: { path: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>' },
  bolt: { path: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', fill: true },
  house: { path: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>' },
  gauge: { path: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 13l4-3"/><circle cx="12" cy="18" r="1.1"/>' },
  // Same stroked family, drawn to match:
  car: { path: '<path d="M3 13l1.8-5.2A2 2 0 0 1 6.7 6.5h10.6a2 2 0 0 1 1.9 1.3L21 13"/><path d="M3 13h18v4H3z"/><circle cx="7" cy="17.5" r="1.4"/><circle cx="17" cy="17.5" r="1.4"/>' },
  battery: { path: '<rect x="3" y="8" width="15" height="9" rx="1.6"/><path d="M21 11v3"/><path d="M6 11v3"/>' },
  grid: { path: '<path d="M12 3v4M8 7l-3 4M16 7l3 4M6 11h12l-1.5 9h-9z"/><path d="M10 15h4"/>' },
};

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function iconSvg(name: IconName, color: string, x: number, y: number, size: number): string {
  const def = ICONS[name] ?? ICONS.sun;
  const scale = size / 24;
  const stroke = def.fill ? "none" : color;
  const fill = def.fill ? color : "none";
  return (
    `<g transform="translate(${x},${y}) scale(${scale.toFixed(4)})" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="1.8" ` +
    `stroke-linecap="round" stroke-linejoin="round">${def.path}</g>`
  );
}

function toDataUri(svg: string): string {
  const b64 = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}

/** Auto-shrink long value strings so they fit the key width. */
function valueFontSize(text: string): number {
  const n = text.length;
  if (n <= 4) return 46;
  if (n <= 6) return 38;
  if (n <= 8) return 30;
  return 24;
}

export interface KeyView {
  icon: IconName;
  accent: string;
  valueText: string;
  unitText: string;
  label: string;
  badge: string;
  badgeColor: string;
  health: FeedHealth;
  ageText: string;
  note?: string;
}

const WRAP_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">';
const WRAP_CLOSE = "</svg>";
const BG = `<rect width="144" height="144" rx="18" fill="${COLORS.bg}"/>`;

function healthDotColor(h: FeedHealth): string {
  switch (h) {
    case "live": return COLORS.live;
    case "stale": return COLORS.warn;
    case "offline": return COLORS.off;
    case "error": return COLORS.import;
  }
}

/** Render a normal metric key. */
export function renderKey(v: KeyView): string {
  const dimmed = v.health === "offline" || v.health === "error";
  const valueColor = dimmed ? COLORS.subtext : v.accent;
  const vFont = valueFontSize(v.valueText + (v.unitText ? ` ${v.unitText}` : ""));

  const badge = v.badge
    ? `<text x="136" y="24" text-anchor="end" font-family="Helvetica,Arial,sans-serif" ` +
      `font-size="12" font-weight="700" fill="${v.badgeColor}">${esc(v.badge)}</text>`
    : "";

  // Freshness dot + age, bottom-right.
  const dot =
    `<circle cx="14" cy="132" r="4" fill="${healthDotColor(v.health)}"/>` +
    `<text x="24" y="136" font-family="Helvetica,Arial,sans-serif" font-size="12" ` +
    `fill="${COLORS.subtext}">${esc(v.ageText)}</text>`;

  const note = v.note
    ? `<text x="136" y="136" text-anchor="end" font-family="Helvetica,Arial,sans-serif" ` +
      `font-size="11" fill="${COLORS.warn}">${esc(v.note)}</text>`
    : "";

  const unit = v.unitText
    ? `<text x="72" y="103" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" ` +
      `font-size="15" font-weight="600" fill="${COLORS.subtext}">${esc(v.unitText)}</text>`
    : "";

  const svg =
    WRAP_OPEN + BG +
    iconSvg(v.icon, dimmed ? COLORS.off : v.accent, 10, 10, 26) +
    badge +
    // metric label
    `<text x="72" y="52" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" ` +
    `font-size="14" font-weight="600" fill="${COLORS.text}">${esc(v.label)}</text>` +
    // big value
    `<text x="72" y="86" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" ` +
    `font-size="${vFont}" font-weight="800" fill="${valueColor}">${esc(v.valueText)}</text>` +
    unit + dot + note +
    WRAP_CLOSE;
  return toDataUri(svg);
}

/** Render a full-key message state (needs config, offline, error). */
export function renderMessage(title: string, subtitle: string, color: string): string {
  const svg =
    WRAP_OPEN + BG +
    `<text x="72" y="60" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" ` +
    `font-size="20" font-weight="800" fill="${color}">${esc(title)}</text>` +
    `<text x="72" y="88" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" ` +
    `font-size="13" fill="${COLORS.subtext}">${esc(subtitle)}</text>` +
    WRAP_CLOSE;
  return toDataUri(svg);
}
