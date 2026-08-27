/**
 * The single configurable "Energy Metric" action. Each key independently picks
 * a metric/unit/style via the Property Inspector and shares the endpoint's
 * client with every other key pointing at the same service.
 */
import streamDeck, {
  action,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent,
} from "@elgato/streamdeck";

import { DEFAULTS, normalizeBaseUrl, type TileSettings } from "../settings";
import { getClient, releaseClientIfIdle, type EnergyClient } from "../client/energy-client";
import { getMetric, metricNeedsStats } from "../data/metrics";
import {
  directionPresentation,
  feedHealth,
  formatAge,
  formatValue,
} from "../data/status";
import { renderKey, renderMessage, type KeyView } from "../render/svg";

type KeyAction = WillAppearEvent<TileSettings>["action"];

interface Binding {
  action: KeyAction;
  settings: TileSettings;
  baseUrl: string;
  authHeader?: string;
  client?: EnergyClient;
  unsub?: () => void;
}

@action({ UUID: "com.solartesla.energy.metric" })
export class EnergyMetricAction extends SingletonAction<TileSettings> {
  private bindings = new Map<string, Binding>();
  private uiTimer?: ReturnType<typeof setInterval>;

  override onWillAppear(ev: WillAppearEvent<TileSettings>): void {
    this.bind(ev.action, ev.payload.settings ?? {});
    this.ensureUiTimer();
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<TileSettings>): void {
    this.bind(ev.action, ev.payload.settings ?? {});
  }

  override onWillDisappear(ev: WillDisappearEvent<TileSettings>): void {
    this.teardown(ev.action.id);
    if (this.bindings.size === 0 && this.uiTimer) {
      clearInterval(this.uiTimer);
      this.uiTimer = undefined;
    }
  }

  /** Pressing the key forces an immediate re-render (useful for a manual poke). */
  override onKeyDown(): void {
    for (const b of this.bindings.values()) this.render(b);
  }

  private ensureUiTimer(): void {
    // Re-render once a second so the "age" readout advances and stale/offline
    // states surface even when no new data arrives.
    if (this.uiTimer) return;
    this.uiTimer = setInterval(() => {
      for (const b of this.bindings.values()) this.render(b);
    }, 1000);
  }

  private teardown(id: string): void {
    const prev = this.bindings.get(id);
    if (prev) {
      prev.unsub?.();
      this.bindings.delete(id);
      if (prev.baseUrl) releaseClientIfIdle(prev.baseUrl, prev.authHeader);
    }
  }

  private bind(action: KeyAction, raw: TileSettings): void {
    const settings: TileSettings = {
      baseUrl: raw.baseUrl ?? DEFAULTS.baseUrl,
      authHeader: raw.authHeader?.trim() || undefined,
      metric: raw.metric ?? DEFAULTS.metric,
      unit: raw.unit ?? DEFAULTS.unit,
      style: raw.style ?? DEFAULTS.style,
      pollSeconds: raw.pollSeconds ?? DEFAULTS.pollSeconds,
      staleSeconds: raw.staleSeconds ?? DEFAULTS.staleSeconds,
    };
    const baseUrl = normalizeBaseUrl(settings.baseUrl);

    // Rebind cleanly (endpoint or metric may have changed).
    this.teardown(action.id);

    const binding: Binding = { action, settings, baseUrl, authHeader: settings.authHeader };
    this.bindings.set(action.id, binding);

    if (!baseUrl) {
      this.render(binding); // shows "Set URL"
      return;
    }

    const client = getClient(baseUrl, settings.authHeader);
    client.setPollSeconds(settings.pollSeconds ?? DEFAULTS.pollSeconds);
    binding.client = client;
    binding.unsub = client.subscribe(() => this.render(binding), metricNeedsStats(settings.metric));
    this.render(binding);
  }

  private render(b: Binding): void {
    try {
      const image = this.buildImage(b);
      void b.action.setImage(image);
    } catch (err) {
      streamDeck.logger.error("render failed", err);
    }
  }

  private buildImage(b: Binding): string {
    const { settings, baseUrl } = b;
    if (!baseUrl) {
      return renderMessage("Set URL", "Open settings", "#FFD60A");
    }
    const def = getMetric(settings.metric);
    const snap = b.client?.getSnapshot();

    const ageMs = snap?.receivedAt != null ? Date.now() - snap.receivedAt : null;
    const health = feedHealth(ageMs, settings.staleSeconds ?? DEFAULTS.staleSeconds, snap?.connError ?? true);

    if (!snap || !snap.state) {
      const host = hostOf(baseUrl);
      return renderMessage(health === "error" ? "Error" : "Offline", host, "#FF453A");
    }

    const sample = def.extract(snap.state);
    const fmt = formatValue(sample, def.kind, settings.unit ?? DEFAULTS.unit);
    const pres = directionPresentation(sample.direction);

    const style = settings.style ?? DEFAULTS.style;
    const showLabel = style !== "value_only";
    const showBadge = style === "detailed";
    const showAge = style !== "value_only";

    const valueText = def.kind === "status"
      ? (sample.statusText ?? "—")
      : (sample.available ? fmt.value : "—");

    const view: KeyView = {
      icon: def.icon,
      accent: pres.accent,
      valueText,
      unitText: def.kind === "status" ? "" : (sample.available ? fmt.unit : ""),
      label: showLabel ? def.short : "",
      badge: showBadge ? pres.badge : "",
      badgeColor: pres.badgeColor,
      health,
      ageText: showAge ? formatAge(ageMs) : "",
      note: sample.note,
    };
    return renderKey(view);
  }
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}
