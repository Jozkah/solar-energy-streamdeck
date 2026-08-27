/**
 * Typed shape of the energy-monitoring service state, mirroring exactly the
 * fields produced by the upstream server (`GET /api/state`, `GET /api/stream`).
 *
 * Sources (do NOT invent fields beyond these):
 *  - server/controller.js  -> `state` object + `getState()`
 *  - server/shelly.js      -> `meters`
 *  - server/tesla.js       -> `car` (normalize())
 *  - server/wallconnector.js -> `wc`
 *  - server/solax.js       -> `solax`
 *  - server/stats.js       -> `GET /api/stats` payload
 *
 * Every nested object may be `null` when its integration is unavailable, so all
 * are declared optional/nullable and must be read defensively.
 */

/** A single Shelly EM channel (server/shelly.js). */
export interface ShellyChannel {
  key?: string;
  label?: string;
  role?: "grid" | "solar" | "load" | "load_with_solar" | string;
  power?: number | null; // W, signed
  voltage?: number | null;
  current?: number | null;
  [k: string]: unknown;
}

/** Shelly meters aggregate (server/shelly.js readMeters()). */
export interface Meters {
  ts?: number;
  channels?: Record<string, ShellyChannel>;
  grid?: ShellyChannel;
  gridPower?: number | null; // signed: + import, - export
  exportW?: number | null; // >= 0
  importW?: number | null; // >= 0
  solarPanels2?: number | null; // signed; generation is negative
  voltage?: number | null;
  errors?: unknown;
}

/** Tesla vehicle data (server/tesla.js normalize()). */
export interface Car {
  online?: boolean;
  chargingState?: "Charging" | "Stopped" | "Complete" | "Disconnected" | "NoPower" | "Starting" | string | null;
  pluggedIn?: boolean;
  chargeAmps?: number | null;
  chargerActualCurrent?: number | null;
  chargeCurrentRequest?: number | null;
  chargeCurrentRequestMax?: number | null;
  chargerVoltage?: number | null;
  chargerPower?: number | null; // kW
  batteryLevel?: number | null; // % SoC
  chargeLimitSoc?: number | null; // %
  timeToFullCharge?: number | null;
  estRangeKm?: number | null;
  chargeRateKmh?: number | null;
  stale?: boolean; // set by controller when a fresh read failed
  [k: string]: unknown;
}

/** Tesla Wall Connector vitals (server/wallconnector.js). */
export interface WallConnector {
  connected?: boolean;
  charging?: boolean;
  currentA?: number | null;
  voltage?: number | null;
  power?: number | null; // W
  evseState?: unknown;
  error?: string;
}

/** SolaX cloud generation (server/solax.js). */
export interface Solax {
  ok?: boolean;
  acpower?: number | null; // live AC generation, W
  yieldToday?: number | null; // kWh
  error?: string;
  ts?: number;
}

/** Derived control figures (server/controller.js setComputed()). */
export interface Computed {
  exportW?: number | null;
  importW?: number | null;
  chargeW?: number | null; // car charging power, W
  surplusW?: number | null;
  voltage?: number | null;
  targetAmps?: number | null;
  actualAmps?: number | null;
  potentialAmps?: number | null;
  enoughToCharge?: boolean;
  insufficientSolar?: boolean;
  standbyW?: number | null;
  [k: string]: unknown;
}

/** Full snapshot from `GET /api/state` / SSE `GET /api/stream`. */
export interface EnergyState {
  ts?: number; // server stamp (ms) — always present on getState()
  liveAt?: number; // last live-loop tick
  lastCycleAt?: number;
  mode?: "auto" | "pause" | string;
  lastAction?: string;
  lastError?: string | null;
  charging?: boolean;
  teslaConfigured?: boolean;
  meters?: Meters | null;
  car?: Car | null;
  wc?: WallConnector | null;
  solax?: Solax | null;
  computed?: Computed | null;
  [k: string]: unknown;
}

/** `GET /api/stats` payload (server/stats.js getStats()). */
export interface StatsPayload {
  range?: string;
  cost?: unknown;
  car?: {
    energyWh?: number | null;
    solarWh?: number | null;
    gridWh?: number | null;
    solarPct?: number | null;
  } | null;
  home?: {
    solarGeneratedWh?: number | null;
    growattWh?: number | null;
    solaxWh?: number | null;
    exportedWh?: number | null;
    importedWh?: number | null;
    usedWh?: number | null;
  } | null;
  [k: string]: unknown;
}
