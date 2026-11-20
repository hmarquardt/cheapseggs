import {
  ANALYTICS_ENDPOINT,
  ANALYTICS_SITE_ID,
  PUBLIC_PATHS,
  type PublicPath,
} from "../config/site";

/** No arbitrary properties, identifiers, URLs or questionnaire input in this contract. */
export const PRODUCT_EVENTS = [
  "game_started",
  "wheel_spun",
  "recipe_generated",
  "chemistry_check_started",
  "chemistry_check_completed",
  "partner_invitation_initiated",
  "partner_invitation_accepted",
  "purchase_flow_initiated",
] as const;
export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

export function publicPath(value: string): PublicPath | null {
  return (PUBLIC_PATHS as readonly string[]).includes(value) ? (value as PublicPath) : null;
}

export function collectionAllowed(input: {
  consent: string | null;
  doNotTrack: string | null;
  globalPrivacyControl: boolean;
  hostname: string;
  pathname: string;
}): boolean {
  return (
    input.consent === "granted" &&
    input.doNotTrack !== "1" &&
    !input.globalPrivacyControl &&
    input.hostname === "cheapseggs.com" &&
    publicPath(input.pathname) !== null
  );
}

export function analyticsPayload(path: PublicPath, kind: "pageview" | "event", name: string) {
  if (
    !publicPath(path) ||
    (kind === "event" && !(PRODUCT_EVENTS as readonly string[]).includes(name))
  ) {
    throw new Error("Unsupported analytics event");
  }
  return {
    site: ANALYTICS_SITE_ID,
    kind,
    name: kind === "pageview" ? "pageview" : name,
    path,
    event_uid: `e_${crypto.randomUUID().replaceAll("-", "")}`,
  };
}

const CONSENT_KEY = "cheapseggs.analytics.consent";
let memoryConsent: string | null = null;
let pageviewSent = false;

function consent(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return memoryConsent;
  }
}

function allowed(): boolean {
  return collectionAllowed({
    consent: consent(),
    doNotTrack: navigator.doNotTrack,
    globalPrivacyControl:
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true,
    hostname: location.hostname,
    pathname: location.pathname,
  });
}

function send(kind: "pageview" | "event", name: string): void {
  const path = publicPath(location.pathname);
  if (!path || !allowed()) return;
  void fetch(ANALYTICS_ENDPOINT, {
    method: "POST",
    credentials: "omit",
    mode: "cors",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(analyticsPayload(path, kind, name)),
    keepalive: true,
  }).catch(() => {
    /* Optional analytics never blocks the site. */
  });
}

export function trackPageview(): void {
  if (pageviewSent || !allowed()) return;
  pageviewSent = true;
  send("pageview", "pageview");
}

/** Reserved for real future successful workflows; nothing in the preview emits these. */
export function trackProductEvent(name: ProductEvent): void {
  send("event", name);
}

export function initializeAnalytics(): void {
  const status = document.querySelector<HTMLElement>("[data-analytics-status]");
  const allow = document.querySelector<HTMLButtonElement>("[data-analytics-allow]");
  const reject = document.querySelector<HTMLButtonElement>("[data-analytics-reject]");
  const refresh = () => {
    const privacySignal =
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
    if (status)
      status.textContent = privacySignal
        ? "Optional analytics: blocked by your privacy signal."
        : consent() === "granted"
          ? "Optional analytics: allowed. No answers or private activity are recorded."
          : "Optional analytics: off. Allow public-page counts with no visitor identifier.";
    if (allow) allow.disabled = privacySignal || consent() === "granted";
    if (reject)
      reject.textContent = consent() === "granted" ? "Turn analytics off" : "Keep analytics off";
  };
  const save = (value: "granted" | "denied") => {
    memoryConsent = value;
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      /* Choice lasts for this page only. */
    }
    refresh();
    if (value === "granted") trackPageview();
  };
  allow?.addEventListener("click", () => save("granted"));
  reject?.addEventListener("click", () => save("denied"));
  refresh();
  trackPageview();
}
