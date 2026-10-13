/**
 * renewal-client.ts — shared client for subscription status and renewal.
 *
 * WHY THIS IS IN THE SDK
 * Web, desktop and mobile all need to ask the same two questions — what
 * does this shop owe, and start a payment — and all three must agree. When
 * each app calls the API itself they drift: desktop and mobile previously
 * hand-rolled the same operation against two different providers and
 * diverged on payload shape, phone normalisation and error handling.
 *
 * So the client lives here and every app calls it. The provider credential
 * never does: this talks only to our API, which holds the Tuma key and
 * resolves the amount from the shop's assigned plan.
 *
 * The amount is deliberately NOT a parameter. A caller cannot ask a shop to
 * pay a different figure than the one their salesperson agreed.
 */

export interface SubscriptionStatus {
  shopId: string;
  /** active | pending_payment | awaiting_payment | expired | past_due | none */
  status: string;
  planName: string;
  /** Whole KES, or null when no plan is assigned. */
  monthlyAmount: number | null;
  currency: 'KES';
  billingCycle: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextPaymentDate: string | null;
  /** Whole days to the next payment; 0 on the due date, null when unknown. */
  daysRemaining: number | null;
  isOverdue: boolean;
  deviceLimit: number | null;
  salespersonId: string | null;
}

export interface RenewResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  customerMessage: string;
  amount: number;
  currency: string;
  planName: string;
}

export type RenewalErrorCode =
  | 'OFFLINE'
  | 'NO_SESSION'
  | 'NO_PLAN'
  | 'INVALID_PHONE'
  | 'PAYMENT_UNAVAILABLE'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'REQUEST_FAILED'
  | 'UNKNOWN';

export class SubscriptionClientError extends Error {
  readonly code: RenewalErrorCode;
  /** True when retrying the same request could succeed. */
  readonly retryable: boolean;

  constructor(code: RenewalErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'SubscriptionClientError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface SubscriptionClientOptions {
  /** Present as a cookie in the browser, sent as a Bearer token by desktop/mobile. */
  token?: string | null;
  /** Overridable for tests and for self-hosted deployments. */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://www.soostori.co.ke';

export class SubscriptionClient {
  private readonly token: string | null;
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: SubscriptionClientOptions = {}) {
    this.token = options.token ?? null;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Browsers attach the session cookie automatically. Desktop and mobile
    // have no cookie jar, so they pass the token as a Bearer.
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.doFetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: T;
        error?: { code?: string; message?: string; retryable?: boolean };
      };
      if (!res.ok || !body?.ok) {
        const code = (body?.error?.code ?? 'REQUEST_FAILED') as RenewalErrorCode;
        throw new SubscriptionClientError(
          code,
          body?.error?.message ?? `Request failed (${res.status})`,
          Boolean(body?.error?.retryable),
        );
      }
      return body.data as T;
    } catch (err) {
      if (err instanceof SubscriptionClientError) throw err;
      // Network drop, DNS failure, timeout. A renewal has no offline path:
      // the caller's correct response is to keep the user informed, not to
      // assume the payment went through.
      throw new SubscriptionClientError(
        'OFFLINE',
        'No connection to Soostori. Reconnect and try again — a renewal cannot complete offline.',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Current plan, monthly amount and days remaining. */
  async getStatus(): Promise<SubscriptionStatus> {
    return this.request<SubscriptionStatus>('/api/subscription/status');
  }

  /**
   * Prompt the customer's phone for the monthly payment.
   *
   * Only a phone number is sent. The amount is resolved server-side from the
   * shop's assigned plan so it cannot be tampered with on the client.
   */
  async renew(phone: string): Promise<RenewResult> {
    const trimmed = phone.trim();
    if (!trimmed) {
      throw new SubscriptionClientError('INVALID_PHONE', 'Enter the phone number to charge.');
    }
    return this.request<RenewResult>('/api/subscription/renew', {
      method: 'POST',
      body: JSON.stringify({ phone: trimmed }),
    });
  }
}

export function createSubscriptionClient(options?: SubscriptionClientOptions): SubscriptionClient {
  return new SubscriptionClient(options);
}