import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { federation } from "@module-federation/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    appType: 'spa',
    build: isDev ? {
      // Module Federation host entry uses top-level await -> modern target.
      target: 'esnext',
      // Module Federation: Vite's <link rel="modulepreload"> would EXECUTE the
      // shared chunks (react/smartcommon/...) before the MF runtime populates
      // its shared scope, crashing with "__mf_NNN is not a function" at boot
      // (deterministic in the minified prod build). Disabling modulePreload
      // forces the chunks to load through the MF runtime's ordered graph.
      modulePreload: false,
      // Debug build: no minification, with sourcemaps
      minify: false,
      sourcemap: true,
    } : {
      target: 'esnext',
      modulePreload: false,
      // Production build: esbuild minifier (NOT terser). terser's aggressive
      // mangling intermittently breaks the Module Federation runtime glue
      // ("__mf_NNN is not a function" at boot, ~half the loads). esbuild keeps
      // MF stable. Console/debugger drop is done via the top-level `esbuild`
      // option below.
      minify: 'esbuild',
      sourcemap: false,
    },
    // Drop console/debugger in prod (esbuild minifier; replaces the previous
    // terserOptions.compress.drop_console).
    esbuild: isDev ? {} : { drop: ['console', 'debugger'] },
    optimizeDeps: {
      include: ['prop-types', 'parse-numeric-range', 'boolbase', 'style-to-object', 'debug', 'extend', 'react-signature-canvas'],
    },
    resolve: {
      alias: {
        'src': path.resolve(__dirname, './src'),
        'prop-types': 'prop-types/prop-types.js',
      },
      // @cap-rel/smartcommon is consumed via a `file:` symlink; its dist also
      // imports react / react-router-dom / redux / i18next. Without dedupe these
      // would resolve to smartcommon's own node_modules (a second copy),
      // breaking React context and the router. Force a single shared copy.
      dedupe: [
        'react', 'react-dom', 'react-router-dom', '@reduxjs/toolkit',
        'react-redux', 'i18next', 'react-i18next', 'react-hot-toast',
        'framer-motion', 'react-helmet',
      ],
    },
    plugins: [
      react(),
      // Module Federation HOST. We declare no static remotes: capmail's remote
      // is registered at runtime (its URL is only known from GET /home in prod,
      // or injected by the POC harness). The `shared` block MUST list every lib
      // the remote also uses, as singletons, so a capmail-built component
      // resolves react / smartcommon / router to the HOST instances (single
      // React tree, single auth context). These mirror resolve.dedupe below
      // plus @cap-rel/smartcommon.
      federation({
        name: 'dolipocket_host',
        remotes: {},
        // Share ONLY react + react-dom -- the bare minimum for a single React
        // tree (so the remote's hooks run against the host's React + contexts).
        // We deliberately do NOT share @cap-rel/smartcommon / redux / i18next:
        // those are used at top-level module-eval time across the host graph,
        // and a shared *lazy* shim there crashes the prod build at boot with
        // "__mf_NNN is not a function". Bundled normally, they are synchronous
        // and race-free. The remote does not import smartcommon either: the
        // host INJECTS the capabilities it needs (useApi, useViewport, t) at
        // mount, which also decouples the remote from smartcommon's version.
        shared: {
          react: { singleton: true, eager: true, requiredVersion: '^19.2.0' },
          'react-dom': { singleton: true, eager: true, requiredVersion: '^19.2.0' },
        },
        dts: false,
      }),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          cleanupOutdatedCaches: true,
          // The debug build (mode=development) is NOT minified, so its main
          // chunk is several MB and would exceed the precache limit. Give it
          // generous headroom; keep the production limit tight (the minified
          // bundle stays well under it).
          maximumFileSizeToCacheInBytes: isDev ? 12000000 : 3000000,
          skipWaiting: true,
          clientsClaim: true,
          // Runtime caching for API endpoints
          runtimeCaching: [
            {
              // Cache API responses for home, profile ...
              urlPattern: /\/api\/(home|profile)/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
                networkTimeoutSeconds: 10,
              },
            },
            {
              // Cache images with CacheFirst strategy
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
          ],
        },
        injectRegister: "auto",
        includeAssets: ["favicon.ico", "assets/*", "favicon.png", "apple-touch-icon.png"],
        // Manifest served dynamically by SmartAuth PwaController
        // Configuration via Dolibarr constants: {MODULE}_PWA_NAME, {MODULE}_PWA_THEME_COLOR, etc.
        manifest: false,
      }),
    ]
  };
});
