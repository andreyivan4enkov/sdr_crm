import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@sdr-crm/api-client": resolve(__dirname, "packages/api-client/src/index.ts"),
      "@sdr-crm/blueprint-core": resolve(__dirname, "packages/blueprint-core/src/index.ts"),
      "@sdr-crm/site-core": resolve(__dirname, "packages/site-core/src/index.ts"),
      "@sdr-crm/sdr-core": resolve(__dirname, "packages/sdr-core/src/index.ts"),
      "@sdr-crm/edo-core": resolve(__dirname, "packages/edo-core/src/index.ts"),
      "@sdr-crm/i18n/react": resolve(__dirname, "packages/i18n/src/react.tsx"),
      "@sdr-crm/i18n": resolve(__dirname, "packages/i18n/src/index.ts"),
      "@sdr-crm/aiboard-core": resolve(__dirname, "packages/aiboard-core/src/index.ts"),
      "@sdr-crm/reactor-core": resolve(__dirname, "packages/reactor-core/src/index.ts"),
      "@sdr-crm/integration-core": resolve(__dirname, "packages/integration-core/src/index.ts"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
  },
});
