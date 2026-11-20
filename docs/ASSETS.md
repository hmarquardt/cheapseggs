# Asset boundaries

`public/assets/` contains only public, original, non-explicit brand assets. Do not put private uploads,
premium downloads, personal exports, invite tokens, or intimate content here. Vite copies it verbatim.

Future R2 public bucket: versioned, licensed theme art and sanitized preview images, cache immutable.
Future R2 private bucket: paid files, served through authenticated Worker authorization on every request.
No public R2 domain or r2.dev for private files. Do not put entitlement, preference, or relationship data in R2.

No generated photography or external font/CDN calls are needed for this foundation. The wheel is CSS.

Social artwork is original SVG with checked-in 1200×630 PNG exports under `public/assets/social/`. Rebuild with `npm run assets:social`; review typography before committing generated changes. Public-page image mapping lives in `src/content/public-pages.ts`. Source SVGs and raster exports are public; no R2 bucket is required.
