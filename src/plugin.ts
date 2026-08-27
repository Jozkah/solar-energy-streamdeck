import streamDeck from "@elgato/streamdeck";

import { EnergyMetricAction } from "./actions/energy-metric";

// Secrets (auth headers, tokens) are never passed to the logger anywhere in
// this plugin. Default log level is used; adjust in the manifest if needed.
streamDeck.actions.registerAction(new EnergyMetricAction());

streamDeck.connect();
