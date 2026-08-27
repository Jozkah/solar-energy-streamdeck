/**
 * Freshness classification, colour/label selection, and value formatting.
 *
 * Colour choices are colour-blind-friendly: hues are widely separated AND every
 * state is reinforced with a distinct icon and a text badge, so meaning never
 * relies on colour alone. Palette reuses the upstream dashboard tokens.
 */
import type { Direction, MetricKind, MetricSample } from "./metrics";
import type { UnitPref } from "../settings";

export type FeedHealth = "live" | "stale" | "offline" | "error";

/** Reused dashboard palette. */
export const COLORS = {
  solar: "#fbbf24", // amber  (generation)
  export: "#34d399", // green  (export)
  import: "#FF453A", // red    (import)
  charge: "#0A84FF", // blue   (car charging) — distinct from export green
  house: "#64d2ff", // cyan   (consumption)
  idle: "#8e8e93", // gray
  off: "#5b6472", // dim gray (unavailable)
  live: "#30D158", // green dot
  warn: "#FFD60A", // amber   (stale)
  text: "#f2f2f7",
  subtext: "#aeb4c0",
  bg: "#0a0f1c",
} as const;

export interface Presentation {
  accent: string; // main colour for value + icon
  badge: string; // short semantic tag, e.g. "IMPORT"
  badgeColor: string;
}

export function directionPresentation(dir: Direction): Presentation {
  switch (dir) {
    case "gen": return { accent: COLORS.solar, badge: "GEN", badgeColor: COLORS.solar };
    case "export": return { accent: COLORS.export, badge: "EXPORT", badgeColor: COLORS.export };
    case "import": return { accent: COLORS.import, badge: "IMPORT", badgeColor: COLORS.import };
    case "charge": return { accent: COLORS.charge, badge: "CHARGING", badgeColor: COLORS.charge };
    case "load": return { accent: COLORS.house, badge: "USING", badgeColor: COLORS.house };
    case "idle": return { accent: COLORS.idle, badge: "IDLE", badgeColor: COLORS.idle };
    case "off": return { accent: COLORS.off, badge: "N/A", badgeColor: COLORS.off };
    case "none":
    default: return { accent: COLORS.text, badge: "", badgeColor: COLORS.subtext };
  }
}

/**
 * Classify feed freshness.
 * @param ageMs  now - snapshot timestamp (ms); null when no snapshot yet.
 * @param staleSeconds  threshold beyond which live data is "stale".
 * @param connError  true when the transport reported an error / disconnect.
 */
export function feedHealth(
  ageMs: number | null,
  staleSeconds: number,
  connError: boolean,
): FeedHealth {
  if (ageMs == null) return connError ? "error" : "offline";
  if (connError && ageMs > staleSeconds * 1000) return "error";
  if (ageMs > staleSeconds * 1000) return "stale";
  return "live";
}

export function healthColor(h: FeedHealth): string {
  switch (h) {
    case "live": return COLORS.live;
    case "stale": return COLORS.warn;
    case "offline": return COLORS.off;
    case "error": return COLORS.import;
  }
}

/** Human age like "3s", "2m", "1h". */
export function formatAge(ageMs: number | null): string {
  if (ageMs == null) return "—";
  const s = Math.max(0, Math.round(ageMs / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

export interface FormattedValue {
  value: string;
  unit: string;
}

function fmtNum(n: number, dp: number): string {
  const r = Number(n.toFixed(dp));
  return r.toLocaleString("en-US", { maximumFractionDigits: dp });
}

/** Format a sample's numeric value honouring the unit preference. */
export function formatValue(sample: MetricSample, kind: MetricKind, unit: UnitPref): FormattedValue {
  if (sample.value == null) return { value: "—", unit: "" };
  const v = sample.value;
  switch (kind) {
    case "power": {
      if (unit === "kw") return { value: fmtNum(v / 1000, 2), unit: "kW" };
      if (unit === "w") return { value: fmtNum(v, 0), unit: "W" };
      // auto
      return Math.abs(v) >= 1000
        ? { value: fmtNum(v / 1000, 2), unit: "kW" }
        : { value: fmtNum(v, 0), unit: "W" };
    }
    case "energy": {
      if (unit === "wh") return { value: fmtNum(v, 0), unit: "Wh" };
      if (unit === "kwh") return { value: fmtNum(v / 1000, 2), unit: "kWh" };
      return Math.abs(v) >= 1000
        ? { value: fmtNum(v / 1000, 2), unit: "kWh" }
        : { value: fmtNum(v, 0), unit: "Wh" };
    }
    case "voltage": return { value: fmtNum(v, 0), unit: "V" };
    case "percent": return { value: fmtNum(v, 0), unit: "%" };
    case "current": return { value: fmtNum(v, 1), unit: "A" };
    case "status": return { value: sample.statusText ?? "—", unit: "" };
  }
}
