/**
 * BaseRealConnector — abstract base class for all real portal connectors.
 *
 * Encapsulates common concerns:
 *   • HTTP client (Axios) with configurable baseURL, timeout, and User-Agent
 *   • Rate limiting via RateLimiter (token-bucket in Redis)
 *   • Anomaly detection (CAPTCHA / structure changes) that throws CircuitBreakerError
 *
 * Subclasses (Extranjería, DGT, AEAT, …) only implement the portal-specific
 * abstract methods: fetching pages, parsing HTML, and submitting forms.
 */

import axios from 'axios';
import type { AxiosInstance } from 'axios';
import {
  IConnector,
  ConnectorMetadata,
  TimeSlot,
  BookingResult,
} from '../connector.interface';
import { RateLimiter } from '../rate-limiter';
import { logger } from '../../../lib/logger';

// ── Config ───────────────────────────────────────────────────────────────────

export interface RealConnectorConfig {
  /** Slug used for rate-limiter keys and logging */
  connectorSlug: string;
  /** Base URL of the government portal (must be HTTPS) */
  baseUrl: string;
  /** HTTP request timeout in milliseconds (default: 30 000) */
  timeoutMs?: number;
  /** Max requests per minute allowed by the portal */
  rateLimit: number;
}

// ── CircuitBreakerError ──────────────────────────────────────────────────────

export type CircuitBreakerReason = 'CAPTCHA_DETECTED' | 'STRUCTURE_CHANGED';

export class CircuitBreakerError extends Error {
  readonly reason: CircuitBreakerReason;

  constructor(message: string, reason: CircuitBreakerReason) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.reason = reason;
  }
}

// ── BaseRealConnector ────────────────────────────────────────────────────────

export abstract class BaseRealConnector implements IConnector {
  abstract readonly metadata: ConnectorMetadata;

  protected readonly httpClient: AxiosInstance;
  protected readonly rateLimiter: RateLimiter;

  constructor(protected readonly config: RealConnectorConfig) {
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeoutMs ?? 15_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      maxRedirects: 5,
    });

    this.rateLimiter = new RateLimiter(
      config.connectorSlug,
      config.rateLimit,
    );
  }

  // ── Concrete IConnector methods ──────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    await this.rateLimiter.acquire();
    try {
      const res = await this.httpClient.get(this.getHealthEndpoint(), {
        // Accept redirects as healthy — many gov portals redirect to login/form pages
        validateStatus: (status) => status >= 200 && status < 400,
      });
      return true;
    } catch (err: unknown) {
      // Only log a short summary — Axios errors contain huge binary TLS data
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as any)?.response?.status;
      logger.warn(
        `BaseRealConnector(${this.config.connectorSlug}): healthCheck failed — ${msg}${status ? ` (HTTP ${status})` : ''}`,
      );
      return false;
    }
  }

  async getAvailability(
    procedureId: string,
    fromDate: string,
    toDate: string,
  ): Promise<TimeSlot[]> {
    await this.rateLimiter.acquire();
    const raw = await this.fetchAvailabilityPage(procedureId, fromDate, toDate);
    this.detectAnomalies(raw);
    return this.parseAvailability(raw);
  }

  async book(bookingData: Record<string, unknown>): Promise<BookingResult> {
    await this.rateLimiter.acquire();
    const raw = await this.submitBookingForm(bookingData);
    this.detectAnomalies(raw);
    return this.parseBookingResult(raw);
  }

  async cancel(confirmationCode: string): Promise<boolean> {
    await this.rateLimiter.acquire();
    return this.submitCancellation(confirmationCode);
  }

  // ── Anomaly detection ────────────────────────────────────────────────────

  protected detectAnomalies(response: unknown): void {
    if (this.hasCaptcha(response)) {
      throw new CircuitBreakerError(
        'CAPTCHA detectado en el portal',
        'CAPTCHA_DETECTED',
      );
    }
    if (!this.hasExpectedStructure(response)) {
      throw new CircuitBreakerError(
        'Estructura del portal cambió inesperadamente',
        'STRUCTURE_CHANGED',
      );
    }
  }

  // ── Abstract methods — subclasses must implement ─────────────────────────

  /** URL path used by healthCheck (e.g. "/" or "/cita-previa") */
  protected abstract getHealthEndpoint(): string;

  /** Raw HTTP call to fetch the availability page from the portal */
  protected abstract fetchAvailabilityPage(
    procedureId: string,
    fromDate: string,
    toDate: string,
  ): Promise<unknown>;

  /** Parse the raw portal response into normalised TimeSlot[] */
  protected abstract parseAvailability(rawResponse: unknown): TimeSlot[];

  /** Raw HTTP call to submit the booking form to the portal */
  protected abstract submitBookingForm(
    data: Record<string, unknown>,
  ): Promise<unknown>;

  /** Parse the raw portal response into a BookingResult */
  protected abstract parseBookingResult(rawResponse: unknown): BookingResult;

  /** Submit a cancellation request to the portal */
  protected abstract submitCancellation(
    confirmationCode: string,
  ): Promise<boolean>;

  /** Return true if the portal response contains a CAPTCHA challenge */
  protected abstract hasCaptcha(response: unknown): boolean;

  /** Return true if the portal response has the expected HTML structure */
  protected abstract hasExpectedStructure(response: unknown): boolean;
}
