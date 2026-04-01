/**
 * Portal configuration interfaces for browser-based connectors.
 *
 * Each government portal has its own configuration defining the base URL,
 * navigation timeout, CSS selectors, and maximum flow steps.
 */

// ── PortalConfig ─────────────────────────────────────────────────────────────

export interface PortalConfig {
  /** Base URL of the government portal */
  baseUrl: string;

  /** Navigation timeout in milliseconds (default: 60 000) */
  navigationTimeoutMs: number;

  /** CSS selectors expected on the portal, keyed by logical name */
  selectors: Record<string, string>;

  /** Maximum number of steps in the multi-step flow */
  maxSteps: number;
}

// ── BrowserConnectorConfig ───────────────────────────────────────────────────

export interface BrowserConnectorConfig extends PortalConfig {
  /** Slug used for rate-limiter keys and logging */
  connectorSlug: string;

  /** Maximum requests per minute allowed by the portal */
  rateLimit: number;
}

// ── CaptchaDetection ─────────────────────────────────────────────────────────

export interface CaptchaDetection {
  type: 'recaptcha_v3' | 'recaptcha_v2' | 'image';
  siteKey?: string;
  pageUrl: string;
}
