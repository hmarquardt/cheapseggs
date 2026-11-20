import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/client",
    rollupOptions: {
      input: {
        home: resolve("index.html"),
        play: resolve("play/index.html"),
        account: resolve("account/index.html"),
        privacy: resolve("privacy/index.html"),
        "date-night": resolve("date-night/index.html"),
        recipes: resolve("recipes/index.html"),
      },
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
