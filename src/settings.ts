import type { MetricId } from "./data/metrics";

/** Units a tile can request. `auto` picks W/kW or Wh/kWh by magnitude. */
export type UnitPref = "auto" | "w" | "kw" | "wh" | "kwh" | "raw";

/** Visual layout of the key image. */
export type DisplayStyle = "detailed" | "compact" | "value_only";

// Local mirror of the SDK's JSON value type so TileSettings structurally
// satisfies `JsonObject` (the SingletonAction settings constraint) without
// depending on an internal import path.
type JsonPrimitive = boolean | number | string | null | undefined;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** Per-key settings, persisted by Stream Deck (never contains upstream secrets). */
export interface TileSettings {
  [key: string]: JsonValue;
  /** Base URL of the local energy-monitoring service, e.g. http://localhost:3000 */
  baseUrl?: string;
  /**
   * Optional Authorization header value for reverse-proxy setups
   * (e.g. "Bearer xyz" or "Basic ..."). Sent verbatim, never logged.
   */
  authHeader?: string;
  /** Which metric this key shows (legacy single-select; still honoured). */
  metric?: MetricId;
  /** Metrics this key cycles through (multi-select). Takes priority over `metric`. */
  metrics?: MetricId[];
  /** Auto-rotate interval (seconds) when multiple metrics are selected. 0 = manual (press) only. */
  cycleSeconds?: number;
  /** Preferred unit. */
  unit?: UnitPref;
  /** Display style. */
  style?: DisplayStyle;
  /** REST poll interval (seconds) used only when SSE is unavailable. */
  pollSeconds?: number;
  /** Age (seconds) after which data is treated as stale/degraded. */
  staleSeconds?: number;
}

export const DEFAULTS = {
  baseUrl: "http://192.168.1.184:3000",
  metric: "solar" as MetricId,
  cycleSeconds: 4,
  unit: "auto" as UnitPref,
  style: "detailed" as DisplayStyle,
  pollSeconds: 5,
  staleSeconds: 20,
} as const;

/**
 * Resolve the ordered list of metrics a key should cycle through, tolerating
 * the legacy single `metric` field and filtering out unknown ids.
 */
export function resolveMetrics(s: TileSettings, isValid: (id: string) => boolean): MetricId[] {
  const raw = Array.isArray(s.metrics) && s.metrics.length ? s.metrics : (s.metric ? [s.metric] : []);
  const seen = new Set<string>();
  const out: MetricId[] = [];
  for (const id of raw) {
    if (typeof id === "string" && isValid(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id as MetricId);
    }
  }
  return out.length ? out : [DEFAULTS.metric];
}

/** Normalise a base URL: trim, drop trailing slash. Returns "" if unusable. */
export function normalizeBaseUrl(raw: string | undefined): string {
  const s = (raw ?? "").trim().replace(/\/+$/, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return s;
  } catch {
    return "";
  }
}
