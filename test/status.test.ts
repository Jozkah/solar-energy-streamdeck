import { test } from "node:test";
import assert from "node:assert/strict";

import { feedHealth, formatValue, directionPresentation, formatAge, COLORS } from "../src/data/status";
import type { MetricSample } from "../src/data/metrics";

test("feedHealth: no snapshot => offline, or error when transport errored", () => {
  assert.equal(feedHealth(null, 20, false), "offline");
  assert.equal(feedHealth(null, 20, true), "error");
});

test("feedHealth: fresh => live, old => stale, old+error => error", () => {
  assert.equal(feedHealth(3_000, 20, false), "live");
  assert.equal(feedHealth(25_000, 20, false), "stale");
  assert.equal(feedHealth(25_000, 20, true), "error");
});

test("formatValue: power auto switches W <-> kW", () => {
  const p = (v: number): MetricSample => ({ kind: "power", value: v, available: true, direction: "gen" });
  assert.deepEqual(formatValue(p(800), "power", "auto"), { value: "800", unit: "W" });
  assert.deepEqual(formatValue(p(2400), "power", "auto"), { value: "2.4", unit: "kW" });
  assert.deepEqual(formatValue(p(2400), "power", "w"), { value: "2,400", unit: "W" });
});

test("formatValue: energy, percent, voltage, current", () => {
  assert.deepEqual(formatValue({ kind: "energy", value: 12000, available: true, direction: "gen" }, "energy", "auto"), { value: "12", unit: "kWh" });
  assert.deepEqual(formatValue({ kind: "percent", value: 64, available: true, direction: "none" }, "percent", "auto"), { value: "64", unit: "%" });
  assert.deepEqual(formatValue({ kind: "voltage", value: 231, available: true, direction: "none" }, "voltage", "auto"), { value: "231", unit: "V" });
  assert.deepEqual(formatValue({ kind: "current", value: 13, available: true, direction: "charge" }, "current", "auto"), { value: "13", unit: "A" });
});

test("formatValue: null value renders a dash", () => {
  assert.deepEqual(formatValue({ kind: "power", value: null, available: false, direction: "off" }, "power", "auto"), { value: "—", unit: "" });
});

test("formatValue: status uses its statusText", () => {
  const s: MetricSample = { kind: "status", value: 0, statusText: "Idle", available: true, direction: "idle" };
  assert.deepEqual(formatValue(s, "status", "auto"), { value: "Idle", unit: "" });
});

test("directionPresentation: import is red, export green, charging blue, gen amber", () => {
  assert.equal(directionPresentation("import").accent, COLORS.import);
  assert.equal(directionPresentation("import").badge, "IMPORT");
  assert.equal(directionPresentation("export").accent, COLORS.export);
  assert.equal(directionPresentation("charge").accent, COLORS.charge);
  assert.equal(directionPresentation("gen").accent, COLORS.solar);
});

test("formatAge is human readable", () => {
  assert.equal(formatAge(null), "—");
  assert.equal(formatAge(3000), "3s");
  assert.equal(formatAge(90_000), "2m");
});
