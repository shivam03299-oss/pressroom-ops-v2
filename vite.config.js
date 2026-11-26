import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Local Cash Command Center API (scripts/cash-dev.mjs) — dev only
  server: process.env.CASH_DEV_API ? { proxy: { "/api/hashway-cash": process.env.CASH_DEV_API } } : undefined,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon-32.png", "favicon-64.png", "apple-touch-icon.png"],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // The app bundle is >2 MiB (single chunk); raise the precache ceiling
        // so the service worker still caches the main JS for offline/instant load.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // The SPA navigation fallback serves index.html for every navigation.
        // Exclude /api/* so server-side redirects/navigations (e.g. Shopify's
        // OAuth callback hitting /api/shopify-oauth-callback) reach the real
        // serverless function instead of the cached app shell — otherwise the
        // token exchange never runs and "Connect Shopify" silently fails.
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: "AVIVA INTERNATIONAL",
        short_name: "Aviva",
        description: "Print-on-demand apparel manufacturing — Aviva International",
        theme_color: "#0F172A",
        background_color: "#0F172A",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      }
    })
  ]
});
