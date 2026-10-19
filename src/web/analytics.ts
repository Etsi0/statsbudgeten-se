/**
 * Google Analytics (gtag.js) for the single-page app.
 *
 * The app has no router: what the user is looking at is React state (tab,
 * year, drilled area, Övriga). So the automatic page view is disabled and the
 * app reports each of those states as a virtual page view instead, plus a few
 * events for interactions that don't change the "page".
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

/** Reports a virtual page, e.g. "/utgifter/2026/uo6". */
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
