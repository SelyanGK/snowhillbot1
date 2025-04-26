import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}', './server/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/typography')],
} satisfies Config