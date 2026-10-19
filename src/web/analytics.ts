/**
 * Google Analytics (gtag.js) for the single-page app.
 *
 * The app is a single page whose URL the app itself keeps in step with what
 * is on screen (see routes.ts), without full page loads. So the automatic
 * page view is disabled and the app reports each URL change as a page view
 * instead, plus an event for the inflation toggle.
 *
 * Nothing is loaded on localhost, so development sessions never reach GA.
 */

const MEASUREMENT_ID = "G-V8YQZQ9679";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type GtagParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let enabled = false;

/** Loads gtag.js and configures the property. Safe to call more than once. */
export function initAnalytics(): void {
  if (enabled || typeof window === "undefined") return;
  if (LOCAL_HOSTS.has(window.location.hostname)) return;

  window.dataLayer = window.dataLayer ?? [];
  // gtag.js expects the raw `arguments` object on the data layer, not an array.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);
  enabled = true;
}

/** Reports a page, e.g. "/utgifter/6/3?year=2024". */
export function trackPageView(path: string, title: string): void {
  if (!enabled) return;
  window.gtag!("event", "page_view", {
    page_path: path,
    page_title: title,
    page_location: window.location.origin + path,
  });
}

/** Reports an interaction that does not change the virtual page. */
export function trackEvent(name: string, params?: GtagParams): void {
  if (!enabled) return;
  window.gtag!("event", name, params);
}
