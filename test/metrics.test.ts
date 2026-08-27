import { test } from "node:test";
import assert from "node:assert/strict";

import { METRICS, isMetricId, type MetricId } from "../src/data/metrics";
import { resolveMetrics } from "../src/settings";
import type { EnergyState } from "../src/data/state";

test("resolveMetrics: multi-select wins, dedupes, drops unknown ids", () => {
  assert.deepEqual(resolveMetrics({ metrics: ["solar", "house", "solar", "bogus"] as unknown as MetricId[] }, isMetricId), ["solar", "house"]);
});

test("resolveMetrics: falls back to legacy single metric, then default", () => {
  assert.deepEqual(resolveMetrics({ metric: "grid_power" }, isMetricId), ["grid_power"]);
  assert.deepEqual(resolveMetrics({}, isMetricId), ["solar"]);
  assert.deepEqual(resolveMetrics({ metrics: [] }, isMetricId), ["solar"]);
});

/** A representative healthy snapshot: solar 2.4kW, importing 2.2kW, car charging 3kW. */
function healthy(): EnergyState {
  return {
    ts: Date.now(),
    meters: {
      solarPanels2: -1500, // Growatt generating 1500 W
      gridPower: 2200, // importing
      importW: 2200,
      exportW: 0,
      voltage: 231,
      channels: { floor1: { power: -200 } },
    },
    solax: { ok: true, acpower: 900 }, // SolaX cloud 900 W
    computed: { chargeW: 3000, importW: 2200, exportW: 0, voltage: 231, actualAmps: 13 },
    car: { online: true, chargingState: "Charging", batteryLevel: 64, chargerActualCurrent: 13, chargerVoltage: 230 },
    __stats: {
      home: { solarGeneratedWh: 12000, importedWh: 3400, exportedWh: 8100, usedWh: 9000 },
      car: { energyWh: 5200 },
    },
  } as EnergyState;
}

test("solar generation = Growatt clamp + SolaX cloud", () => {
  const s = METRICS.solar.extract(healthy());
  assert.equal(s.available, true);
  assert.equal(s.value, 2400); // 1500 + 900
  assert.equal(s.direction, "gen");
});

test("solar falls back to floor1 injection and flags SolaX offline", () => {
  const st = healthy();
  st.solax = { ok: false };
  const s = METRICS.solar.extract(st);
  assert.equal(s.value, 1700); // 1500 Growatt + 200 floor1 proxy
  assert.equal(s.note, "SolaX offline");
});

test("home consumption = solar + import - export - charge (clamped >= 0)", () => {
  const s = METRICS.house.extract(healthy());
  assert.equal(s.value, 1600); // 2400 + 2200 - 0 - 3000
  assert.equal(s.direction, "load");
});

test("home consumption never goes negative", () => {
  const st = healthy();
  st.computed = { ...st.computed, chargeW: 9000 };
  const s = METRICS.house.extract(st);
  assert.equal(s.value, 0);
});

test("grid power classifies import vs export by magnitude", () => {
  const imp = METRICS.grid_power.extract(healthy());
  assert.equal(imp.direction, "import");
  assert.equal(imp.value, 2200);

  const st = healthy();
  st.meters = { ...st.meters, gridPower: -1800, importW: 0, exportW: 1800 };
  const exp = METRICS.grid_power.extract(st);
  assert.equal(exp.direction, "export");
  assert.equal(exp.value, 1800);
});

test("car status maps charging state and power", () => {
  const s = METRICS.car_status.extract(healthy());
  assert.equal(s.statusText, "Charging");
  assert.equal(s.direction, "charge");
  assert.equal(s.available, true);
});

test("car status/power fall back to the Wall Connector when car is null", () => {
  const st = healthy();
  st.car = null;
  st.wc = { connected: true, charging: true, currentA: 13.7, voltage: 242, power: 3317 };
  st.computed = { ...st.computed, chargeW: 3317 };
  const status = METRICS.car_status.extract(st);
  assert.equal(status.available, true);
  assert.equal(status.statusText, "Charging");
  assert.equal(status.direction, "charge");
  const power = METRICS.car_power.extract(st);
  assert.equal(power.available, true);
  assert.equal(power.value, 3317);
});

test("car status is Idle via WC when connected but not charging", () => {
  const st = healthy();
  st.car = null;
  st.wc = { connected: true, charging: false, power: 0 };
  st.computed = { ...st.computed, chargeW: 0 };
  assert.equal(METRICS.car_status.extract(st).statusText, "Idle");
});

test("car metrics are unavailable only when car, WC and computed are all absent", () => {
  const st = healthy();
  st.car = null;
  st.wc = null;
  st.computed = null;
  assert.equal(METRICS.car_status.extract(st).available, false);
  assert.equal(METRICS.car_status.extract(st).statusText, "Unavailable");
  assert.equal(METRICS.car_power.extract(st).available, false);
  assert.equal(METRICS.car_soc.extract(st).available, false); // SoC needs the Tesla API
});

test("car SoC and voltage read straight through", () => {
  assert.equal(METRICS.car_soc.extract(healthy()).value, 64);
  assert.equal(METRICS.grid_voltage.extract(healthy()).value, 231);
});

test("daily totals come from the stats feed", () => {
  assert.equal(METRICS.daily_solar.extract(healthy()).value, 12000);
  assert.equal(METRICS.daily_export.extract(healthy()).value, 8100);
  assert.equal(METRICS.daily_car.extract(healthy()).value, 5200);
});

test("malformed / empty state degrades without throwing", () => {
  const empty = {} as EnergyState;
  for (const id of Object.keys(METRICS) as (keyof typeof METRICS)[]) {
    const s = METRICS[id].extract(empty);
    assert.equal(typeof s.available, "boolean");
    assert.equal(s.available, false);
  }
});

test("garbage field types do not crash extractors", () => {
  const junk = {
    meters: { solarPanels2: "oops", gridPower: null, voltage: NaN, channels: null },
    car: { batteryLevel: "x", chargingState: 42 },
    computed: { chargeW: undefined },
  } as unknown as EnergyState;
  assert.doesNotThrow(() => METRICS.solar.extract(junk));
  assert.equal(METRICS.solar.extract(junk).value, 0);
  assert.equal(METRICS.car_soc.extract(junk).available, false);
});
