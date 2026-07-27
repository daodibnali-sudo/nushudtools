import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
