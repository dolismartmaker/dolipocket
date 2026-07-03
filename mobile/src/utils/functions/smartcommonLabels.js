import { locales } from "@cap-rel/smartcommon";

// smartcommon >= 1.0.366 ships English DEFAULT_LABELS and exports ready-made
// locale bundles under `locales`. The Dolibarr-CAP ecosystem is francophone,
// so fall back to the French bundle whenever a component is rendered without
// project-specific labels. Pass `overrides` to layer app-translated keys on
// top (e.g. from i18next) while keeping the rest in French.
const FALLBACK = locales.fr;

export const labelsWithFallback = (componentName, overrides) => ({
    ...FALLBACK[componentName],
    ...(overrides ?? {}),
});
