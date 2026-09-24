import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8"));
const BUILD_TIME = new Date().toISOString();
const BUILD_ID = `${pkg.version}-${BUILD_TIME.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const VERSION_INFO = { version: pkg.version as string, buildId: BUILD_ID, buildTime: BUILD_TIME };

/** Emits /version.json at build time and serves it in dev. */
function versionFile(): Plugin {
  return {
    name: "app-version-file",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/version.json")) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(VERSION_INFO));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify(VERSION_INFO) });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(VERSION_INFO.version),
    __BUILD_ID__: JSON.stringify(VERSION_INFO.buildId),
    __BUILD_TIME__: JSON.stringify(VERSION_INFO.buildTime),
  },
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
    versionFile(),
    VitePWA({
      strategies: "generateSW",
      registerType: "prompt",
      injectRegister: null,
      filename: "sw.js",
      manifest: false,
      devOptions: { enabled: false },
      workbox: {
        // New worker takes over immediately; old caches are purged.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // index.html and version.json are never precached -> always fresh from network.
        globPatterns: ["**/*.{js,css,png,svg,woff2}"],
        globIgnores: ["**/version.json", "**/index.html", "**/sw.js"],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === "/version.json",
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html", networkTimeoutSeconds: 4 },
          },
          {
            urlPattern: ({ url, request }) =>
              url.origin === self.location.origin &&
              ["script", "style", "font", "image"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "assets",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      // Server builds use a lean backend client without development-environment helpers.
      ...(process.env.FP_PRODUCTION_CLIENT === "1"
        ? [{ find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(import.meta.dirname, "./src/lib/backendClient.ts") }]
        : []),
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
    ],
  },
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "::",
    port: 8080,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
