import { useEffect, useState } from "react";
import { Route } from "react-router-dom";
import { useApi, useViewport } from "@cap-rel/smartcommon";

import { RequirePermission } from "src/lib/permissions/RequirePermission";
import { useMenu } from "src/lib/permissions/useMenu";

import { loadRemoteFeature } from "./loadRemote";

// Capabilities the host injects into every federated remote. The remote calls
// these (host.useApi()) instead of importing smartcommon itself -- they run
// against the host's shared React, so they read the host's real contexts.
// Sharing only react/react-dom (not smartcommon) is what keeps the prod build
// boot race-free (see docs/CAPMAIL_INTEGRATION.md section 8).
const hostCapabilities = { useApi, useViewport };

// Mounts one federated remote route: lazily loads the remote bundle on first
// visit, then renders the component declared for `routePath` with the injected
// host capabilities. Loading / error states are explicit (no silent failure).
function RemoteFeatureMount({ plugin, routePath }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const feature = await loadRemoteFeature(plugin);
        if (alive) {
          setState({ status: "ready", feature });
        }
      } catch (err) {
        console.error("DPK remote load failed", plugin?.id, err);
        if (alive) {
          setState({ status: "error", error: err && err.message ? err.message : String(err) });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [plugin]);

  if (state.status === "loading") {
    return (
      <div data-testid="plugin-loading" style={{ padding: 16, color: "#64748b" }}>
        Chargement du module {plugin?.id ?? ""}...
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div data-testid="plugin-error" style={{ padding: 16, color: "#b91c1c" }}>
        Module {plugin?.id ?? ""} indisponible : {state.error}
      </div>
    );
  }

  const feature = state.feature;
  const routeDef =
    feature && Array.isArray(feature.routes)
      ? feature.routes.find((r) => r.path === routePath)
      : null;
  const RemoteComponent =
    (routeDef && routeDef.element) || (feature && feature.Component) || null;

  if (!RemoteComponent) {
    return (
      <div data-testid="plugin-error" style={{ padding: 16, color: "#b91c1c" }}>
        Le module {plugin?.id ?? ""} n&apos;expose pas de composant pour {routePath}.
      </div>
    );
  }

  return <RemoteComponent host={hostCapabilities} />;
}

// Returns the <Route> elements for every route advertised by every discovered
// plugin (GET /home -> plugins[]). Paths are known synchronously from /home, so
// the routes register without a flash; the remote bundle loads lazily on visit.
// Each route is gated by its declared permission.
export function usePluginRoutes() {
  const { plugins } = useMenu();

  if (!Array.isArray(plugins) || plugins.length === 0) {
    return [];
  }

  const routes = [];
  for (const plugin of plugins) {
    const pluginRoutes = Array.isArray(plugin.routes) ? plugin.routes : [];
    for (const r of pluginRoutes) {
      if (!r || !r.path) {
        continue;
      }
      routes.push(
        <Route key={`${plugin.id}:${r.path}`} element={<RequirePermission perm={r.perm} />}>
          <Route path={r.path} element={<RemoteFeatureMount plugin={plugin} routePath={r.path} />} />
        </Route>,
      );
    }
  }
  return routes;
}
