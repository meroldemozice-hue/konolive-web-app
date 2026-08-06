import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

// Déployé sur GitHub Pages
export default defineConfig({
  base: "/konolive-web-app/",
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Raise warning threshold — chunks are lazy-loaded pages, size is expected
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // rolldown-vite requires manualChunks as a function (not plain object)
        manualChunks(id: string) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router-dom")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }
          if (id.includes("node_modules/date-fns")) {
            return "vendor-date";
          }
          if (id.includes("node_modules/@radix-ui") || id.includes("node_modules/lucide-react") || id.includes("node_modules/sonner")) {
            return "vendor-ui";
          }
        },
      },
    },
  },
});
