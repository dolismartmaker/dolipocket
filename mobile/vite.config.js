import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    appType: 'spa',
    build: isDev ? {
      // Debug build: no minification, with sourcemaps
      minify: false,
      sourcemap: true,
    } : {
      // Production build: max compression, no sourcemaps
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      sourcemap: false,
    },
    optimizeDeps: {
      include: ['prop-types', 'parse-numeric-range', 'boolbase', 'style-to-object', 'debug', 'extend', 'react-signature-canvas'],
    },
    resolve: {
      alias: {
        'src': path.resolve(__dirname, './src'),
        'prop-types': 'prop-types/prop-types.js',
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 3000000,
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
