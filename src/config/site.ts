export const SITE_ORIGIN = "https://cheapseggs.com";
export const SITE_NAME = "CheapSeggs";
export const ANALYTICS_ENDPOINT = "https://analytics.aismallbizguru.com/collect";
export const ANALYTICS_SITE_ID = "as_v3ng10kbDYMLWnFWOsf52W";

export const PUBLIC_PATHS = [
  "/",
  "/wheel/",
  "/date-night/",
  "/chemistry/",
  "/secret-menu/",
  "/recipes/",
  "/about/",
  "/privacy/",
  "/terms/",
] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];

export const SITE_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: `${SITE_ORIGIN}/`,
  description:
    "Playful discovery for consenting adults. Public preview; games and private accounts are in development.",
});

export const SITE_JSON_LD_HASH = "'sha256-ucTIH5Cy7Re8fZeYfSvDI4eGBlGD37pRutrAVS9eIH4='";
