# Bundled Geist fonts

The unmodified variable WOFF2 files come from the official
[Geist font repository](https://github.com/vercel/geist-font/tree/main/fonts)
(downloaded 2026-10-20): `Geist/webfonts/Geist[wght].woff2` and
`GeistMono/webfonts/GeistMono[wght].woff2`. They are distributed under the
[SIL Open Font License 1.1](./OFL.txt).

`app/layout.tsx` uses `next/font/local` so builds and browsers need no Google
Fonts connection. Both families preserve the 100–900 weight range and the
existing CSS variables. A Chrome canvas comparison against the previously
built Google Fonts assets found identical pixels and text widths for a French
sample at weights 400, 500, 600 and 700 in both families.
