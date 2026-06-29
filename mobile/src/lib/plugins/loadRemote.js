import { registerRemotes, loadRemote } from "@module-federation/runtime";

// Generic runtime loader for Module Federation remotes advertised by the
// backend (GET /home -> plugins[]). Each plugin descriptor carries the remote
// coordinates the host needs to fetch and mount a feature shipped by another
// Dolibarr module. The host bundle is plugin-agnostic (built by `make pwa`);
// everything here is driven by what the server advertises at runtime.

const registered = new Set();

/**
 * Register (once per scope) and load a remote feature module.
 *
 * @param {{id:string, remoteEntry:string, scope:string, module:string}} plugin
 *        Descriptor from GET /home plugins[]. `remoteEntry` is the absolute URL
 *        (derived server-side via dol_buildpath), `scope` the federation name,
 *        `module` the exposed key (e.g. "./MailFeature").
 * @returns {Promise<object>} the feature surface ({ meta, routes, Component, ... })
 */
export async function loadRemoteFeature(plugin) {
  if (!plugin || !plugin.remoteEntry || !plugin.scope || !plugin.module) {
    throw new Error("invalid plugin descriptor");
  }
  // The backend emits a PWA-relative remoteEntry (served by pwa/plugin.php).
  // Resolve it to an absolute URL against the current document so the MF
  // runtime and the remote's relative chunk imports resolve correctly wherever
  // the PWA is mounted.
  const entry = new URL(plugin.remoteEntry, window.location.href).href;
  if (!registered.has(plugin.scope)) {
    // type:"module" is REQUIRED: @module-federation/vite emits an ESM
    // remoteEntry.js; without it the runtime loads it as a classic <script>
    // and the browser throws "Cannot use import statement outside a module".
    registerRemotes(
      [{ name: plugin.scope, entry, type: "module" }],
      { force: true },
    );
    registered.add(plugin.scope);
  }
  // loadRemote key = "<scope>/<exposed key without leading ./>".
  const exposed = String(plugin.module).replace(/^\.\//, "");
  const mod = await loadRemote(`${plugin.scope}/${exposed}`);
  if (!mod) {
    throw new Error(`remote ${plugin.id || plugin.scope} failed to load`);
  }
  return mod.default ? mod.default : mod;
}
