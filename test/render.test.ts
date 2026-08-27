import { test } from "node:test";
import assert from "node:assert/strict";

import { renderKey, renderMessage, type KeyView } from "../src/render/svg";

function decode(dataUri: string): string {
  assert.ok(dataUri.startsWith("data:image/svg+xml;base64,"), "must be a base64 svg data URI");
  const b64 = dataUri.slice("data:image/svg+xml;base64,".length);
  return Buffer.from(b64, "base64").toString("utf8");
}

const base: KeyView = {
  icon: "sun",
  accent: "#fbbf24",
  valueText: "2.4",
  unitText: "kW",
  label: "Solar",
  badge: "GEN",
  badgeColor: "#fbbf24",
  health: "live",
  ageText: "2s",
  note: undefined,
};

test("renderKey emits a base64 SVG data URI containing value, unit and label", () => {
  const svg = decode(renderKey(base));
  assert.match(svg, /<svg/);
  assert.match(svg, /2\.4/);
  assert.match(svg, /kW/);
  assert.match(svg, /Solar/);
  assert.match(svg, /GEN/);
});

test("renderKey escapes text so hostile status strings can't break the SVG", () => {
  const svg = decode(renderKey({ ...base, valueText: "<b>&\"'", badge: "" }));
  assert.doesNotMatch(svg, /<b>/);
  assert.match(svg, /&lt;b&gt;/);
});

test("renderKey handles a dash value (unavailable) without throwing", () => {
  assert.doesNotThrow(() => renderKey({ ...base, valueText: "—", unitText: "", health: "offline" }));
});

test("renderMessage emits a titled SVG data URI", () => {
  const svg = decode(renderMessage("Offline", "localhost:3000", "#FF453A"));
  assert.match(svg, /Offline/);
  assert.match(svg, /localhost:3000/);
});
