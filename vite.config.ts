import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `BASE_PATH` — ilova sub-papkada joylashganda (masalan Google Sites ichida
 * /anatomy/ papkasida) asset yo'llari to'g'ri ishlashi uchun.
 * Router ham shu qiymatdan basename sifatida foydalanadi.
 */
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
  },
});
