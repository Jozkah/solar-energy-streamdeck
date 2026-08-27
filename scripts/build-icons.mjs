// Rasterise the source SVG icons to the PNG sizes Stream Deck requires
// (base + @2x). Run: `npm run icons`. Offline, no system dependencies.
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const SRC = "icons-src";
const OUT = "com.solartesla.energy.sdPlugin/imgs";

/** [sourceSvg, outputBasePath, baseWidthPx] — @2x is 2x baseWidth. */
const JOBS = [
  [`${SRC}/plugin/marketplace.svg`, `${OUT}/plugin/marketplace`, 256],
  [`${SRC}/category.svg`, `${OUT}/category`, 28],
  [`${SRC}/actions/metric/icon.svg`, `${OUT}/actions/metric/icon`, 20],
  [`${SRC}/actions/metric/key.svg`, `${OUT}/actions/metric/key`, 72],
];

function render(svg, width) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width }, background: "rgba(0,0,0,0)" });
  return r.render().asPng();
}

for (const [src, outBase, w] of JOBS) {
  const svg = readFileSync(src, "utf8");
  writeFileSync(`${outBase}.png`, render(svg, w));
  writeFileSync(`${outBase}@2x.png`, render(svg, w * 2));
  console.log(`✓ ${outBase}.png (${w}) + @2x (${w * 2})`);
}
