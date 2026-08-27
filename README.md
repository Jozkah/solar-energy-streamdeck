# Solar Energy Monitor — Stream Deck plugin

Real-time home energy monitoring on an Elgato Stream Deck, driven by your local
[energy-monitoring service](../energy-monitoring-home) (the same server that
powers the web dashboard). Each key shows one live metric — solar generation,
home consumption, car charging, grid import/export, voltage, battery SoC, or a
daily total — with clear, colour-blind-friendly semantics and a freshness
indicator.

Built with the official [`@elgato/streamdeck`](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started)
Node.js SDK (v2). Live data arrives over the service's **SSE** stream
(`/api/stream`); no hand-rolled WebSocket, no polling storm.

---

## Metrics

Pick a metric per key in the Property Inspector:

| Metric | Source field(s) | Notes |
| --- | --- | --- |
| **Solar generation** | `meters.solarPanels2` + `solax.acpower` (fallback: `channels.floor1.power`) | Growatt clamp + SolaX cloud, W |
| **Home consumption** | derived | `max(0, solar + import − export − charge)`, W |
| **Car charging power** | `computed.chargeW` | W; `—` when the car is unavailable |
| **Car status** | `car.chargingState` | Charging / Idle / Complete / Unplugged / Unavailable |
| **Car charge current** | `car.chargerActualCurrent` (fallback WC / computed) | A |
| **Grid power** | `meters.gridPower` (signed) | Import (red) vs Export (green), W |
| **Grid voltage** | `meters.voltage` / `computed.voltage` | V |
| **Car battery (SoC)** | `car.batteryLevel` | %. The only battery in the data — there is no home battery |
| **Today: solar / used / import / export / car** | `GET /api/stats?range=today` | kWh |

Semantics are reinforced three ways (colour **and** icon **and** a text badge)
so meaning never depends on colour alone:

- Solar generation → amber, sun, `GEN`
- Grid export → green, `EXPORT`
- Grid import → red, `IMPORT`
- Car charging → blue, `CHARGING`
- Home consumption → cyan, `USING`
- Idle / unavailable → grey, `IDLE` / `N/A`

Each key also shows a freshness dot + age (`2s`, `1m`, …): **green = live**,
**amber = stale**, **grey = offline**, **red = error**. Offline / malformed /
missing-integration states degrade to a clear message or `—`, never a crash.

---

## Requirements

- **Stream Deck app 6.5+** (Windows 10+ or macOS 12+)
- **Node.js 20+** (bundled with the Stream Deck app at runtime; needed locally to build)
- A running energy-monitoring service reachable from this PC (default `http://localhost:3000`)

The service exposes `/api/state`, `/api/stream` (SSE) and `/api/stats` with **no
auth** by default — the plugin needs only the base URL. An optional
`Authorization` header field is provided for reverse-proxy setups; it is stored
in Stream Deck settings and **never logged**.

---

## Install (from source)

```bash
# 1. Install dependencies
npm install

# 2. Build the plugin bundle (-> com.solartesla.energy.sdPlugin/bin/plugin.js)
npm run build

# 3. Install the Elgato CLI (once) and link the plugin into Stream Deck
npm i -g @elgato/cli        # provides the `streamdeck` command
streamdeck link com.solartesla.energy.sdPlugin
streamdeck restart com.solartesla.energy
```

Then in the Stream Deck app: drag **Energy Monitor → Energy Metric** onto a key,
open its settings, set the **Service URL** and choose a **Metric**. Repeat for
each key — every key is independent and keys sharing a URL share one connection.

To produce a distributable `.streamDeckPlugin`:

```bash
npm run package        # streamdeck pack com.solartesla.energy.sdPlugin
```

---

## Development

```bash
npm run watch        # rebuild on change + restart the plugin
npm run typecheck    # tsc --noEmit
npm test             # node --test (data normalization, status/colour, rendering)
npm run lint         # eslint
```

Watch live logs from the Stream Deck app:

```bash
streamdeck dev        # enable developer mode
# logs: com.solartesla.energy.sdPlugin/logs/
```

### Configuration

All runtime config lives in **Stream Deck settings** (per key), not in files:

- **Service URL** — e.g. `http://localhost:3000` or `http://192.168.1.x:3000`
- **Auth header** — optional, e.g. `Bearer …` (reverse-proxy only)
- **Metric**, **Unit** (auto/W/kW/Wh/kWh), **Display style** (detailed/compact/value-only)
- **Refresh (s)** — REST fallback interval, used only when SSE is down (default 5, min 2)
- **Stale after (s)** — age at which a key shows the stale state (default 20)

See [`.env.example`](.env.example) — it documents the single optional dev value
(the service URL). No secrets are read from the environment; upstream tokens
(Tesla / SolaX / Shelly cloud / Tapo) belong to the energy-monitoring service,
not this plugin. Never commit a real `.env`.

---

## Architecture

```
src/
├─ plugin.ts                 register the action, connect to Stream Deck
├─ actions/energy-metric.ts  the one configurable action (per-key binding + 1s UI refresh)
├─ client/
│  ├─ energy-client.ts       ONE shared client per (URL+auth): SSE + REST fallback + stats poll, ref-counted
│  └─ sse.ts                 tiny fetch-based Server-Sent Events reader
├─ data/
│  ├─ state.ts               typed shapes mirroring the service (no invented fields)
│  ├─ metrics.ts             metric catalogue + pure extractors (formulas match the dashboard)
│  └─ status.ts              freshness classification, colour/label, value formatting
├─ render/svg.ts             SVG → data-URI key renderer (reuses the dashboard icon set)
└─ settings.ts               typed per-key settings + URL normalisation
test/                        metrics / status / render unit tests
```

**One connection, many keys.** The first key pointing at a URL opens the SSE
stream; every other key on that URL subscribes to the same cached snapshot. When
the last key for a URL disappears, the connection is torn down. If SSE drops, a
REST `/api/state` fallback poll keeps tiles fresh until it reconnects (with
exponential backoff). `/api/stats` is polled slowly and only when a daily-total
key is present.

Metric formulas are copied from the upstream dashboard (`public/app.js`,
`public/home.js`) — the canonical source of truth — so the numbers on your keys
match the web UI exactly. Unavailable integrations yield `available: false`
(shown as `—`) rather than a fabricated value.

---

## Compatibility

Works against either monitoring project — `energy-monitoring-home` (superset,
adds cameras/kasa/weather) or `energy monitoring` (charger-only). Both expose
the same `/api/state`, `/api/stream` and `/api/stats`; superset-only fields are
read defensively, so the plugin functions against either running service.
