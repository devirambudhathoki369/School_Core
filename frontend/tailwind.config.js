/** @type {import('tailwindcss').Config} */
const withMT = require("@material-tailwind/react/utils/withMT");

const TARGET = [
  './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
  './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  "./node_modules/@material-tailwind/react/components/**/*.{js,ts,jsx,tsx}",
  "./node_modules/@material-tailwind/react/theme/**/*.{js,ts,jsx,tsx}",
];

module.exports = withMT({
  content: TARGET,
  theme: {
    extend: {
      colors: {
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // `withMT` swaps Tailwind's palette for Material Tailwind's, which has
        // no `rose` — so every `*-rose-*` class silently compiles to nothing and
        // the element renders unstyled. Same reason emerald and sky are here.
        rose: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
        sky: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
      // ---- TYPE SCALE ------------------------------------------------------
      // The app had no scale. A scan of the JSX turns up FIFTEEN distinct
      // arbitrary sizes — 0.65, 0.68, 0.7, 0.72, 0.75, 0.78, 0.8, 0.82, 0.85,
      // 0.87, 0.9, 0.95, 0.99, 1, 1.1rem — chosen one call site at a time, so
      // two labels that mean the same thing are routinely a hundredth of a rem
      // apart and nothing lines up on a shared baseline.
      //
      // These eight steps are where those fifteen actually cluster, named for
      // the ROLE rather than the size so a call site says what it is:
      //
      //   text-caption  0.68  timestamps, row counts, "3 of 12"
      //   text-label    0.72  field labels, badges, chips
      //   text-note     0.75  helper text under a field
      //   text-meta     0.80  secondary column text
      //   text-body     0.85  the app's real body size (most used, 24 hits)
      //   text-copy     0.90  prose that needs to be read, not scanned
      //   text-subhead  0.95  panel titles
      //   text-lead     1.10  section headings
      //
      // NOTHING is migrated onto these yet: the ~150 existing call sites are
      // all visible on Classic, which must not change. Tailwind emits nothing
      // for an unused key, so adding them costs zero bytes. New theme-only
      // components use them, and any future Classic-visible pass has a target
      // to collapse onto instead of inventing a sixteenth value.
      fontSize: {
        caption: ['0.68rem', { lineHeight: '1rem' }],
        label: ['0.72rem', { lineHeight: '1rem' }],
        note: ['0.75rem', { lineHeight: '1.05rem' }],
        meta: ['0.8rem', { lineHeight: '1.15rem' }],
        body: ['0.85rem', { lineHeight: '1.25rem' }],
        copy: ['0.9rem', { lineHeight: '1.4rem' }],
        subhead: ['0.95rem', { lineHeight: '1.4rem' }],
        lead: ['1.1rem', { lineHeight: '1.6rem' }],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      gridTemplateColumns: {
        // for bulk-enrollment; already available upto 12; extending upto 20;
        '13': 'repeat(13, minmax(0, 1fr))',
        '14': 'repeat(14, minmax(0, 1fr))',
        '15': 'repeat(15, minmax(0, 1fr))',
        '16': 'repeat(16, minmax(0, 1fr))',
        '17': 'repeat(17, minmax(0, 1fr))',
        '18': 'repeat(18, minmax(0, 1fr))',
        '19': 'repeat(19, minmax(0, 1fr))',
        '20': 'repeat(20, minmax(0, 1fr))',
      },
      keyframes: {
        'slide-up': {
          '0%':   { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
  safelist: [
    // grid-cols-[1-12]
    ...Array.from({ length: 20 }, (_, i) => i + 1).map(num => `grid-cols-${num}`),
    ...Array.from({ length: 12 }, (_, i) => i + 1).map(num => `sm:col-span-${num}`),
    ...Array.from({ length: 12 }, (_, i) => i + 1).map(num => `col-span-${num}`),
  ]
})
