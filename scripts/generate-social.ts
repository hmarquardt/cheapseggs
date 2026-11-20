import { mkdirSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const directory = "public/assets/social";
mkdirSync(directory, { recursive: true });
const cards = [
  ["default", "Good Chemistry.", "Bad Decisions. Mutual Consent."],
  ["wheel", "The Wheel of Misfortune", "Spin responsibly. Misbehave consensually."],
  ["date-night", "Date Night Machine", "Tonight's special: whatever you both want."],
  ["chemistry", "Chemistry Check", "A little less guessing before the first date."],
  ["recipes", "Romance Cookbook", "A recipe for a much more interesting evening."],
  ["secret-menu", "The Secret Menu", "Private curiosity. Mutually approved possibilities."],
] as const;

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

for (const [key, title, subtitle] of cards) {
  const lights = Array.from({ length: 28 }, (_, index) => {
    const angle = (index / 28) * Math.PI * 2;
    return `<circle cx="${(980 + Math.cos(angle) * 169).toFixed(2)}" cy="${(315 + Math.sin(angle) * 169).toFixed(2)}" r="3.8" fill="#fff2dc"/>`;
  }).join("");
  const wedges = Array.from({ length: 8 }, (_, index) => {
    const a = ((index * 45 - 112.5) / 180) * Math.PI;
    const b = (((index + 1) * 45 - 112.5) / 180) * Math.PI;
    const palette = ["#bd2850", "#552243", "#eaa184", "#641932"];
    return `<path d="M 980 315 L ${(980 + Math.cos(a) * 148).toFixed(2)} ${(315 + Math.sin(a) * 148).toFixed(2)} A 148 148 0 0 1 ${(980 + Math.cos(b) * 148).toFixed(2)} ${(315 + Math.sin(b) * 148).toFixed(2)} Z" fill="${palette[index % 4]}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
<title id="title">CheapSeggs — ${escapeXml(title)}</title><desc id="desc">Retro burgundy and champagne casino sign with a pink wheel. ${escapeXml(subtitle)} Public preview.</desc>
<defs><radialGradient id="velvet"><stop stop-color="#641932"/><stop offset="1" stop-color="#240d19"/></radialGradient><linearGradient id="gold" x2="1" y2="1"><stop stop-color="#fff2dc"/><stop offset=".5" stop-color="#e9bc7b"/><stop offset="1" stop-color="#bb7f53"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#velvet)"/>
<rect x="25" y="25" width="1150" height="580" rx="24" fill="none" stroke="url(#gold)" stroke-width="2"/>
<rect x="37" y="37" width="1126" height="556" rx="18" fill="none" stroke="#e9bc7b" stroke-opacity=".3"/>
<path d="M72 122 H740 M72 458 H740" stroke="#e9bc7b" stroke-opacity=".5"/>
<text x="74" y="99" fill="#e9bc7b" font-family="Arial, sans-serif" font-size="17" letter-spacing="4">FOR CONSENTING ADULTS · 18+</text>
<text x="67" y="268" fill="#fff2dc" font-family="Georgia, serif" font-size="85" font-weight="bold" letter-spacing="-4">CHEAP<tspan fill="#ff8ead">SEGGS</tspan></text>
<text x="73" y="349" fill="#ff8ead" font-family="Georgia, serif" font-size="${key === "default" ? 45 : 36}" font-style="italic">${escapeXml(title)}</text>
<text x="74" y="402" fill="#fff2dc" font-family="Arial, sans-serif" font-size="24">${escapeXml(subtitle)}</text>
<text x="74" y="505" fill="#e9bc7b" font-family="Arial, sans-serif" font-size="16" letter-spacing="3">PUBLIC PREVIEW · CHEAPSEGGS.COM</text>
<circle cx="980" cy="315" r="178" fill="#3c152a" stroke="#e9bc7b" stroke-width="2"/>${lights}
<circle cx="980" cy="315" r="155" fill="#e9bc7b"/>${wedges}
<circle cx="980" cy="315" r="49" fill="#240d19" stroke="#e9bc7b" stroke-width="3"/>
<text x="980" y="329" text-anchor="middle" fill="#e9bc7b" font-family="Georgia, serif" font-size="36" font-style="italic">CS</text>
<path d="M968 139 L992 139 L980 169 Z" fill="#fff2dc"/>
<text x="980" y="222" text-anchor="middle" fill="#fff2dc" font-family="Georgia, serif" font-size="32">♥</text>
<text x="980" y="435" text-anchor="middle" fill="#fff2dc" font-family="Georgia, serif" font-size="32">♥</text>
<text x="865" y="326" text-anchor="middle" fill="#fff2dc" font-family="Georgia, serif" font-size="32">✦</text>
<text x="1095" y="326" text-anchor="middle" fill="#fff2dc" font-family="Georgia, serif" font-size="32">✦</text>
</svg>`;
  writeFileSync(`${directory}/${key}-v1.svg`, svg);
  const rendered = new Resvg(svg, {
    font: { loadSystemFonts: true, defaultFontFamily: "Georgia" },
  });
  writeFileSync(`${directory}/${key}-v1.png`, rendered.render().asPng());
}
console.log(`Created ${cards.length} original SVG and 1200×630 PNG social cards.`);
