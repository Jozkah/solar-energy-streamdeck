/**
 * Metric catalogue + pure extractors.
 *
 * Every formula here mirrors the upstream dashboard (public/app.js,
 * public/home.js) — the canonical source of truth for how raw state maps to
 * user-facing figures. No field is invented; unavailable integrations yield
 * `available: false` rather than a fabricated value.
 */
import type { EnergyState, StatsPayload } from "./state";

export type MetricGroup = "solar" | "house" | "car" | "grid" | "battery" | "daily";
export type MetricKind = "power" | "energy" | "voltage" | "percent" | "current" | "status";
export type IconName = "sun" | "house" | "bolt" | "gauge" | "car" | "battery" | "grid";

/** Charge-flow / semantic direction, drives colour + arrow. */
export type Direction = "gen" | "load" | "import" | "export" | "charge" | "idle" | "off" | "none";

export type MetricId =
  | "solar"
  | "house"
  | "car_power"
  | "car_status"
  | "car_soc"
  | "car_amps"
  | "grid_power"
  | "grid_voltage"
  | "daily_solar"
  | "daily_import"
  | "daily_export"
  | "daily_used"
  | "daily_car";

/** Result of reading one metric from a snapshot. */
export interface MetricSample {
  kind: MetricKind;
  /** Numeric value in base unit (W, Wh, V, %, A). `null` when unknown. */
  value: number | null;
  /** Categorical label for `status` metrics (e.g. "Charging"). */
  statusText?: string;
  available: boolean;
  direction: Direction;
  /** Short note for degraded/partial reads (e.g. "SolaX offline"). */
  note?: string;
}

export interface MetricDef {
  id: MetricId;
  label: string;
  short: string; // key title
  group: MetricGroup;
  kind: MetricKind;
  icon: IconName;
  /** Source feed: live snapshot or the stats endpoint. */
  source: "live" | "stats";
  extract: (s: EnergyState) => MetricSample;
}

// --- helpers ---------------------------------------------------------------

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const max0 = (n: number): number => (n > 0 ? n : 0);

function meters(s: EnergyState) {
  return s.meters ?? null;
}

/** Live grid import/export (W, unsigned). Prefers meters, falls back to computed. */
function gridFlow(s: EnergyState): { importW: number; exportW: number; signed: number | null } {
  const m = meters(s);
  const signed = num(m?.gridPower) ?? (() => {
    const i = num(s.computed?.importW);
    const e = num(s.computed?.exportW);
    if (i == null && e == null) return null;
    return (i ?? 0) - (e ?? 0);
  })();
  const importW = num(m?.importW) ?? num(s.computed?.importW) ?? (signed != null ? max0(signed) : 0);
  const exportW = num(m?.exportW) ?? num(s.computed?.exportW) ?? (signed != null ? max0(-signed) : 0);
  return { importW, exportW, signed };
}

/** Car charging power (W). computed.chargeW is authoritative; WC/car are fallbacks. */
function chargeW(s: EnergyState): number {
  const c = num(s.computed?.chargeW);
  if (c != null) return max0(c);
  if (s.wc && s.wc.charging) return max0(num(s.wc.power) ?? 0);
  const kw = num(s.car?.chargerPower);
  return kw != null ? max0(kw * 1000) : 0;
}

/**
 * Total solar generation (W). Mirrors solarTotal() in public/app.js:
 *   Growatt clamp (solarPanels2, negative when generating)
 *   + SolaX cloud acpower (when ok)
 *   fallback: floor1 injection (channels.floor1.power, negative = solar in).
 */
function solarW(s: EnergyState): MetricSample {
  const m = meters(s);
  if (!m) return { kind: "power", value: null, available: false, direction: "gen", note: "No meter data" };
  let w = 0;
  const sp2 = num(m.solarPanels2);
  if (sp2 != null && sp2 < 0) w += -sp2;

  let note: string | undefined;
  if (s.solax && s.solax.ok && num(s.solax.acpower) != null) {
    w += max0(num(s.solax.acpower)!);
  } else {
    // SolaX unavailable — use the floor1-injection proxy, and flag it.
    const f1 = num(m.channels?.["floor1"]?.power ?? null);
    if (f1 != null && f1 < 0) w += -f1;
    if (s.solax && s.solax.ok === false) note = "SolaX offline";
  }
  return { kind: "power", value: Math.round(w), available: true, direction: "gen", note };
}

/** Home consumption (W). houseW = max(0, solar + import - export - charge). */
function houseW(s: EnergyState): MetricSample {
  const m = meters(s);
  if (!m) return { kind: "power", value: null, available: false, direction: "load", note: "No meter data" };
  const solar = solarW(s).value ?? 0;
  const { importW, exportW } = gridFlow(s);
  const w = max0(solar + importW - exportW - chargeW(s));
  return { kind: "power", value: Math.round(w), available: true, direction: "load" };
}

/** Canonical car charging state -> semantics. */
function carStatus(s: EnergyState): MetricSample {
  const car = s.car;
  if (!car || car.online === false) {
    return { kind: "status", value: null, statusText: "Unavailable", available: false, direction: "off" };
  }
  const cs = String(car.chargingState ?? "").toLowerCase();
  const w = chargeW(s);
  if (cs === "charging") {
    return { kind: "status", value: w, statusText: "Charging", available: true, direction: "charge" };
  }
  if (cs === "disconnected") {
    return { kind: "status", value: 0, statusText: "Unplugged", available: true, direction: "idle" };
  }
  if (cs === "complete") {
    return { kind: "status", value: 0, statusText: "Complete", available: true, direction: "idle" };
  }
  if (cs === "nopower") {
    return { kind: "status", value: 0, statusText: "No power", available: true, direction: "idle" };
  }
  if (cs === "stopped" || cs === "starting" || car.pluggedIn) {
    return { kind: "status", value: 0, statusText: "Idle", available: true, direction: "idle" };
  }
  if (car.stale) {
    return { kind: "status", value: null, statusText: "Stale", available: false, direction: "off", note: "Stale car data" };
  }
  return { kind: "status", value: 0, statusText: "Idle", available: true, direction: "idle" };
}

function statsHome(s: EnergyState): StatsPayload["home"] | null {
  // Stats are attached to the snapshot by the client under `__stats`.
  const stats = (s as { __stats?: StatsPayload }).__stats;
  return stats?.home ?? null;
}
function statsCar(s: EnergyState): StatsPayload["car"] | null {
  return (s as { __stats?: StatsPayload }).__stats?.car ?? null;
}
function energySample(wh: number | null | undefined, dir: Direction): MetricSample {
  const v = num(wh);
  return { kind: "energy", value: v, available: v != null, direction: dir };
}

// --- catalogue -------------------------------------------------------------

export const METRICS: Record<MetricId, MetricDef> = {
  solar: {
    id: "solar", label: "Solar generation", short: "Solar", group: "solar",
    kind: "power", icon: "sun", source: "live", extract: solarW,
  },
  house: {
    id: "house", label: "Home consumption", short: "House", group: "house",
    kind: "power", icon: "house", source: "live", extract: houseW,
  },
  car_power: {
    id: "car_power", label: "Car charging power", short: "Car", group: "car",
    kind: "power", icon: "car", source: "live",
    extract: (s) => {
      const st = carStatus(s);
      if (!st.available) return { kind: "power", value: null, available: false, direction: "off", note: st.note };
      return { kind: "power", value: Math.round(chargeW(s)), available: true, direction: st.direction };
    },
  },
  car_status: {
    id: "car_status", label: "Car status", short: "Car", group: "car",
    kind: "status", icon: "car", source: "live", extract: carStatus,
  },
  car_soc: {
    id: "car_soc", label: "Car battery (SoC)", short: "SoC", group: "battery",
    kind: "percent", icon: "battery", source: "live",
    extract: (s) => {
      const v = num(s.car?.batteryLevel);
      if (v == null) return { kind: "percent", value: null, available: false, direction: "none", note: s.car ? undefined : "Car unavailable" };
      return { kind: "percent", value: v, available: true, direction: "none" };
    },
  },
  car_amps: {
    id: "car_amps", label: "Car charge current", short: "Amps", group: "car",
    kind: "current", icon: "bolt", source: "live",
    extract: (s) => {
      const a = num(s.car?.chargerActualCurrent) ?? num(s.wc?.currentA) ?? num(s.computed?.actualAmps);
      if (a == null) return { kind: "current", value: null, available: false, direction: "off" };
      return { kind: "current", value: a, available: true, direction: a > 0 ? "charge" : "idle" };
    },
  },
  grid_power: {
    id: "grid_power", label: "Grid power (import/export)", short: "Grid", group: "grid",
    kind: "power", icon: "grid", source: "live",
    extract: (s) => {
      if (!meters(s)) return { kind: "power", value: null, available: false, direction: "none", note: "No meter data" };
      const { importW, exportW, signed } = gridFlow(s);
      if (signed == null) return { kind: "power", value: null, available: false, direction: "none" };
      if (exportW >= importW) return { kind: "power", value: Math.round(exportW), available: true, direction: "export" };
      return { kind: "power", value: Math.round(importW), available: true, direction: "import" };
    },
  },
  grid_voltage: {
    id: "grid_voltage", label: "Grid voltage", short: "Volt", group: "grid",
    kind: "voltage", icon: "gauge", source: "live",
    extract: (s) => {
      const v = num(s.meters?.voltage) ?? num(s.computed?.voltage);
      if (v == null) return { kind: "voltage", value: null, available: false, direction: "none" };
      return { kind: "voltage", value: v, available: true, direction: "none" };
    },
  },
  daily_solar: {
    id: "daily_solar", label: "Today: solar generated", short: "Solar☀", group: "daily",
    kind: "energy", icon: "sun", source: "stats",
    extract: (s) => energySample(statsHome(s)?.solarGeneratedWh, "gen"),
  },
  daily_import: {
    id: "daily_import", label: "Today: grid imported", short: "Import", group: "daily",
    kind: "energy", icon: "grid", source: "stats",
    extract: (s) => energySample(statsHome(s)?.importedWh, "import"),
  },
  daily_export: {
    id: "daily_export", label: "Today: grid exported", short: "Export", group: "daily",
    kind: "energy", icon: "grid", source: "stats",
    extract: (s) => energySample(statsHome(s)?.exportedWh, "export"),
  },
  daily_used: {
    id: "daily_used", label: "Today: home used", short: "Used", group: "daily",
    kind: "energy", icon: "house", source: "stats",
    extract: (s) => energySample(statsHome(s)?.usedWh, "load"),
  },
  daily_car: {
    id: "daily_car", label: "Today: car charged", short: "Car kWh", group: "daily",
    kind: "energy", icon: "car", source: "stats",
    extract: (s) => energySample(statsCar(s)?.energyWh, "charge"),
  },
};

export function getMetric(id: string | undefined): MetricDef {
  return METRICS[(id as MetricId)] ?? METRICS.solar;
}

/** Does any configured tile need the /api/stats feed? */
export function metricNeedsStats(id: string | undefined): boolean {
  return getMetric(id).source === "stats";
}
