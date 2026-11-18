/** @type {import('tailwindcss').Config} */

/**
 * Ranglar CSS o'zgaruvchilaridan olinadi (src/index.css → :root / .dark).
 * Shu bilan `bg-cream`, `text-ink/60`, `ring-ink/10`, `bg-forest-800` kabi
 * mavjud klasslar dark rejimda avtomatik to'g'ri rang oladi.
 */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        display: ["Fraunces", "Georgia", "serif"],
      },
      colors: {
        forest: {
          50: v("forest-50"),
          100: v("forest-100"),
          200: v("forest-200"),
          300: v("forest-300"),
          400: v("forest-400"),
          500: v("forest-500"),
          600: v("forest-600"),
          700: v("forest-700"),
          800: v("forest-800"),
          900: v("forest-900"),
          950: v("forest-950"),
        },
        sage: {
          50: v("sage-50"),
          100: v("sage-100"),
          200: v("sage-200"),
          300: v("sage-300"),
          400: v("sage-400"),
          500: v("sage-500"),
        },
        cream: v("cream"),
        sand: v("sand"),
        ink: v("ink"),
        surface: v("surface"),
        surface2: v("surface-2"),
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(0,0,0,0.18)",
        lift: "0 2px 4px rgba(0,0,0,0.04), 0 18px 40px -18px rgba(0,0,0,0.35)",
        ring: "0 0 0 1px rgba(0,0,0,0.06)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fadeUp .45s cubic-bezier(.22,1,.36,1) both",
        "fade-in": "fadeIn .35s ease both",
        float: "float 9s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};
