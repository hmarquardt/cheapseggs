import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PUBLIC_PATHS, SITE_JSON_LD, SITE_JSON_LD_HASH, SITE_ORIGIN } from "../src/config/site.ts";
import { PUBLIC_PAGES } from "../src/content/public-pages.ts";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const root = "dist/client";
const home = readFileSync(`${root}/index.html`, "utf8");
const styleTags = (home.match(/<link[^>]+rel="stylesheet"[^>]*>/g) ?? []).join("\n");
const scriptTags = (
  home.match(/<script[^>]+type="module"[^>]+src="[^"]+"[^>]*><\/script>/g) ?? []
).join("\n");
if (!styleTags || !scriptTags) throw new Error("Public build assets missing");
const hash = `'sha256-${createHash("sha256").update(SITE_JSON_LD).digest("base64")}'`;
if (hash !== SITE_JSON_LD_HASH) throw new Error("Structured-data CSP hash drift");

const navigation = PUBLIC_PAGES.filter((page) => page.path !== "/")
  .map(
    (page) =>
      `<a href="${page.path}">${{ "/": "Home", "/wheel/": "The Wheel", "/date-night/": "Date Night", "/chemistry/": "Chemistry Check", "/secret-menu/": "Secret Menu", "/recipes/": "Cookbook", "/about/": "About", "/privacy/": "Privacy", "/terms/": "Terms" }[page.path]}</a>`,
  )
  .join("");
const choice = `<section class="wrap analytics-choice" aria-label="Analytics preferences"><p data-analytics-status>Optional analytics: off. JavaScript is required to opt in.</p><button type="button" data-analytics-allow>Allow analytics</button><button type="button" data-analytics-reject>Keep analytics off</button><a href="/privacy/">How it works</a></section>`;
const footer = `<footer class="wrap site-footer"><a class="wordmark" href="/">cheap<span>seggs</span></a><p>Early public preview. The guest wheel is live. Account availability is shown on the account page. Purchases are in development.</p><a href="/account/">Your account</a><a href="/privacy/">Privacy &amp; discretion</a></footer>${choice}`;

for (const page of PUBLIC_PAGES) {
  const canonical = `${SITE_ORIGIN}${page.path}`;
  const image = `${SITE_ORIGIN}/assets/social/${page.image}-v1.png`;
  const description = escapeHtml(page.description);
  const title = escapeHtml(page.title);
  const metadata = `<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title><meta name="description" content="${description}"/><link rel="canonical" href="${canonical}"/>
<meta name="robots" content="index, follow"/><meta name="theme-color" content="#240d19"/>
<meta property="og:title" content="${title}"/><meta property="og:description" content="${description}"/>
<meta property="og:type" content="website"/><meta property="og:url" content="${canonical}"/><meta property="og:site_name" content="CheapSeggs"/>
<meta property="og:image" content="${image}"/><meta property="og:image:secure_url" content="${image}"/><meta property="og:image:type" content="image/png"/>
<meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta property="og:image:alt" content="CheapSeggs retro casino sign. ${escapeHtml(page.path === "/" ? "Good Chemistry. Bad Decisions. Mutual Consent." : (page.title.split(" — ")[0] ?? "Public preview"))}"/>
<meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${title}"/><meta name="twitter:description" content="${description}"/><meta name="twitter:image" content="${image}"/><meta name="twitter:image:alt" content="CheapSeggs public preview — retro burgundy and champagne sign"/>
<link rel="icon" href="/assets/cherry.svg" type="image/svg+xml"/>${styleTags}${scriptTags}
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
  } else {
    body = `<a class="skip" href="#main">Skip to content</a><header class="site-header wrap"><a class="wordmark" href="/">cheap<span>seggs</span></a><a class="button button-small button-outline" href="/play/">The lounge preview</a></header><main id="main" class="wrap prose"><p class="eyebrow">CHEAPSEGGS · FOR CONSENTING ADULTS</p><h1>${page.heading}</h1>${page.body}<nav class="public-nav" aria-label="Explore CheapSeggs">${navigation}</nav></main>${footer}`;
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
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/><title>Nothing on the menu — CheapSeggs</title>${styleTags}</head><body><main class="wrap prose"><p class="eyebrow">CHEAPSEGGS · 404</p><h1>Nothing on<br/><em>the menu here.</em></h1><p>That page is not available. Private features are still in development.</p><a class="button" href="/">Back to CheapSeggs</a></main></body></html>`,
);
console.log(
  `Built ${PUBLIC_PAGES.length} useful public pages, initial-HTML metadata and canonical sitemap.`,
);
