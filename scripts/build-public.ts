import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_PATHS, SITE_JSON_LD, SITE_JSON_LD_HASH, SITE_ORIGIN } from "../src/config/site.ts";
import { DISCOVERY_ENTRIES } from "../src/content/discovery/catalog.ts";
import { PUBLIC_PAGES } from "../src/content/public-pages.ts";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const root = "dist/client";

/** Build-only gate; the editorial source is never imported by a client entry. */
function checkRestrictedAssets(directory: string): void {
  const drafts = DISCOVERY_ENTRIES.filter((entry) => entry.status === "draft");
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkRestrictedAssets(path);
    else if (entry.isFile()) {
      const text = readFileSync(path).toString("utf8");
      if (
        drafts.some((draft) =>
          [draft.id, draft.title, draft.description].some((value) => text.includes(value)),
        )
      )
        throw new Error("Restricted editorial content found in public assets");
    }
  }
}

/**
 * Each entry's own built HTML supplies the hashed stylesheet and module script tags.
 * Interactive pages therefore ship their own application, while static pages reuse the
 * public landing bundle (analytics opt-in only).
 */
function assetsFor(entry: string): { styles: string; scripts: string } {
  const html = readFileSync(entry, "utf8");
  const styles = (html.match(/<link[^>]+rel="stylesheet"[^>]*>/g) ?? []).join("\n");
  const scripts = (
    html.match(/<script[^>]+type="module"[^>]+src="[^"]+"[^>]*><\/script>/g) ?? []
  ).join("\n");
  if (!styles || !scripts) throw new Error(`Public build assets missing in ${entry}`);
  return { styles, scripts };
}

const homeAssets = assetsFor(`${root}/index.html`);
const home = readFileSync(`${root}/index.html`, "utf8");
const hash = `'sha256-${createHash("sha256").update(SITE_JSON_LD).digest("base64")}'`;
if (hash !== SITE_JSON_LD_HASH) throw new Error("Structured-data CSP hash drift");

/** Pages whose body is a Preact application rather than static prose. */
const APP_PAGES: Record<string, { entry: string; fallback: string }> = {
  "/date-night/": {
    entry: `${root}/date-night/index.html`,
    fallback:
      "The Date Night Machine needs JavaScript to compose an evening. No account is needed and nothing is saved.",
  },
  "/recipes/": {
    entry: `${root}/recipes/index.html`,
    fallback: "The cookbook needs JavaScript to browse. No account is needed and nothing is saved.",
  },
};

const NAV_LABELS: Record<string, string> = {
  "/wheel/": "The wheels",
  "/date-night/": "Date Night Machine",
  "/chemistry/": "Chemistry Check",
  "/secret-menu/": "Secret Menu",
  "/recipes/": "Cookbook",
  "/about/": "About",
  "/privacy/": "Privacy",
  "/terms/": "Terms",
};

const navigation = PUBLIC_PAGES.filter((page) => page.path !== "/")
  .map((page) => `<a href="${page.path}">${NAV_LABELS[page.path] ?? page.path}</a>`)
  .join("");

const choice = `<section class="wrap analytics-choice" aria-label="Analytics preferences"><p data-analytics-status>Optional analytics: off. JavaScript is required to opt in.</p><button type="button" data-analytics-allow>Allow analytics</button><button type="button" data-analytics-reject>Keep analytics off</button><a href="/privacy/">How it works</a></section>`;
const footer = `<footer class="wrap site-footer"><a class="wordmark" href="/">cheap<span>seggs</span></a><p>Free guest experiences are live: four wheels, the Date Night Machine and the Romance Cookbook. Accounts are open. Purchases and verified-adult content are not, and nothing here is explicit.</p><a href="/account/">Your account</a><a href="/privacy/">Privacy &amp; discretion</a></footer>${choice}`;

for (const page of PUBLIC_PAGES) {
  const canonical = `${SITE_ORIGIN}${page.path}`;
  const image = `${SITE_ORIGIN}/assets/social/${page.image}-v1.png`;
  const description = escapeHtml(page.description);
  const title = escapeHtml(page.title);
  const app = APP_PAGES[page.path];
  const assets = app ? assetsFor(app.entry) : homeAssets;
  const metadata = `<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title><meta name="description" content="${description}"/><link rel="canonical" href="${canonical}"/>
<meta name="robots" content="index, follow"/><meta name="theme-color" content="#240d19"/>
<meta property="og:title" content="${title}"/><meta property="og:description" content="${description}"/><meta property="og:type" content="website"/><meta property="og:url" content="${canonical}"/><meta property="og:site_name" content="CheapSeggs"/>
<meta property="og:image" content="${image}"/><meta property="og:image:secure_url" content="${image}"/><meta property="og:image:type" content="image/png"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta property="og:image:alt" content="CheapSeggs retro casino sign. ${escapeHtml(page.path === "/" ? "Good Chemistry. Bad Decisions. Mutual Consent." : (page.title.split(" — ")[0] ?? "Public preview"))}"/>
<meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${title}"/><meta name="twitter:description" content="${description}"/><meta name="twitter:image" content="${image}"/><meta name="twitter:image:alt" content="CheapSeggs public preview — retro burgundy and champagne sign"/>
<link rel="icon" href="/assets/cherry.svg" type="image/svg+xml"/>${assets.styles}${assets.scripts}
${page.path === "/" ? `<script type="application/ld+json">${SITE_JSON_LD}</script>` : ""}`;

  let body: string;
  if (page.path === "/") {
    body = home
      .replace(/^[\s\S]*?<body>/, "")
      .replace(/<\/body>[\s\S]*$/, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")
      .replace(/<footer[\s\S]*?<\/footer>/, footer)
      .replace(
        "</main>",
        `<nav class="wrap public-nav" aria-label="Explore CheapSeggs">${navigation}</nav></main>`,
      );
  } else if (app) {
    body = `<a class="skip" href="#main">Skip to content</a><div id="app"></div><noscript><main id="main" class="wrap prose"><p class="eyebrow">CHEAPSEGGS · FOR CONSENTING ADULTS</p><h1>${page.heading}</h1><p>${app.fallback}</p><p><a href="/play/">Spin a wheel</a> · <a href="/privacy/">Privacy</a> · <a href="/">Home</a></p></main></noscript>`;
  } else {
    body = `<a class="skip" href="#main">Skip to content</a><header class="site-header wrap"><a class="wordmark" href="/">cheap<span>seggs</span></a><a class="button button-small button-outline" href="/play/">The lounge</a></header><main id="main" class="wrap prose"><p class="eyebrow">CHEAPSEGGS · FOR CONSENTING ADULTS</p><h1>${page.heading}</h1>${page.body}<nav class="public-nav" aria-label="Explore CheapSeggs">${navigation}</nav></main>${footer}`;
  }
  const destination = page.path === "/" ? root : `${root}${page.path.slice(0, -1)}`;
  mkdirSync(destination, { recursive: true });
  writeFileSync(
    `${destination}/index.html`,
    `<!doctype html><html lang="en"><head>${metadata}</head><body>${body}</body></html>`,
  );
}

writeFileSync(
  `${root}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${PUBLIC_PATHS.map((path) => `<url><loc>${SITE_ORIGIN}${path}</loc></url>`).join("")}</urlset>`,
);
writeFileSync(
  `${root}/404.html`,
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex, nofollow"/><title>Not found — CheapSeggs</title>${homeAssets.styles}</head><body><main class="wrap prose"><p class="eyebrow">404</p><h1>Nothing on this table.</h1><p>That page does not exist. The <a href="/play/">wheels</a>, the <a href="/date-night/">Date Night Machine</a> and the <a href="/recipes/">cookbook</a> all still work.</p><p><a class="button button-outline" href="/">Back to CheapSeggs</a></p></main></body></html>`,
);
checkRestrictedAssets(root);
console.log(
  `Built ${PUBLIC_PAGES.length} public pages, ${Object.keys(APP_PAGES).length} applications, sitemap and 404.`,
);
