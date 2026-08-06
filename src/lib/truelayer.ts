import fs from "node:fs";
import { SignJWT } from "jose";
import { createHmac, createPrivateKey, timingSafeEqual } from "node:crypto";
import {
  CreateConnectionRequest,
  CreateConnectionResponse,
  GetAccountsResponse,
  GetConnectionResponse,
  GetTransactionsResponse,
  RequestTransactionsResponse,
  TrueLayerError,
  TrueLayerEnv,
} from "./truelayer-types";

// ─── Configuration ─────────────────────────────────────────

function getConfig() {
  const env = (process.env.TRUELAYER_ENV || "sandbox") as TrueLayerEnv;
  const clientId = process.env.TRUELAYER_CLIENT_ID || "";
  const signingKeyPath = process.env.TRUELAYER_SIGNING_KEY_PATH || "ec512-private-key.pem";
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET || "";

  const authBase = env === "sandbox"
    ? "https://auth.truelayer-sandbox.com"
    : "https://auth.truelayer.com";

  const apiBase = env === "sandbox"
    ? "https://api.truelayer-sandbox.com"
    : "https://api.truelayer.com";

  return {
    env,
    clientId,
    signingKeyPath,
    clientSecret,
    authBase,
    apiBase,
  };
}

// ─── Token cache ───────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

function getTokenExpiry(expiresIn: number): number {
  // Subtract 60s safety margin from the expiry
  const expiresAt = Date.now() + (expiresIn - 60) * 1000;
  return expiresAt;
}

// ─── JWT client_assertion (ES512 / P-521) ─────────────────

const CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

async function signClientAssertion(clientId: string, authBase: string): Promise<string> {
  const keyPath = getConfig().signingKeyPath;
  const privateKeyPem = fs.readFileSync(keyPath, "utf-8");

  // Parse PEM — Node.js crypto handles both SEC1 ("EC PRIVATE KEY") and PKCS#8 ("PRIVATE KEY")
  const privateKey = createPrivateKey(privateKeyPem);

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES512", typ: "JWT" })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(`${authBase}/connect/token`)
    .setIssuedAt(now)
    .setExpirationTime(now + 300) // 5 min
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  return jwt;
}

// ─── Token ─────────────────────────────────────────────────

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const cfg = getConfig();

  const params: Record<string, string> = {
    grant_type: "client_credentials",
    scope: "info accounts transactions connections:create",
  };

  if (cfg.clientSecret) {
    // Standard OAuth2 client_credentials — confirmed by TrueLayer OpenAPI spec
    params.client_id = cfg.clientId;
    params.client_secret = cfg.clientSecret;
  } else if (fs.existsSync(cfg.signingKeyPath)) {
    // Fallback: ES512 JWT client_assertion (not currently supported by
    // sandbox auth server, but kept for production/enterprise accounts
    // that register a signing key in Console)
    params.client_assertion_type = CLIENT_ASSERTION_TYPE;
    params.client_assertion = await signClientAssertion(cfg.clientId, cfg.authBase);
  } else {
    throw new Error(
      "No TrueLayer authentication configured: set TRUELAYER_CLIENT_SECRET or TRUELAYER_SIGNING_KEY_PATH",
    );
  }

  const res = await fetch(`${cfg.authBase}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Partial<TrueLayerError>;
    throw new TrueLayerAPIError(
      `Token request failed: ${res.status} ${res.statusText}`,
      res.status,
      err,
    );
  }

  const data = await res.json() as {
    access_token: string;
    expires_in: number;
    token_type: string;
    scope?: string;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: getTokenExpiry(data.expires_in),
  };

  return data.access_token;
}

export function clearTokenCache() {
  cachedToken = null;
}

// ─── API helpers ───────────────────────────────────────────

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  connectionId?: string,
): Promise<T> {
  const token = await getAccessToken();
  const cfg = getConfig();

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");

  if (connectionId) {
    headers.set("Connection-Id", connectionId);
  }

  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Partial<TrueLayerError>;
    throw new TrueLayerAPIError(
      `API request failed: ${res.status} ${res.statusText}`,
      res.status,
      err,
    );
  }

  // Some responses may be empty
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }

  return (await res.json()) as T;
}

// ─── Data API v3 endpoints ─────────────────────────────────

/**
 * Step 1 — Authentication: get a bearer token (cached ~1h).
 * @see getAccessToken
 */

/**
 * Step 2 — Create a data connection → returns link_uri + connection_id.
 */
export async function createConnection(
  scopes: ("info" | "accounts" | "transactions")[],
  providerId?: string,
): Promise<CreateConnectionResponse> {
  const body: CreateConnectionRequest & { provider_id?: string } = { scopes };
  if (providerId) body.provider_id = providerId;

  return apiRequest<CreateConnectionResponse>("/v3/data-connections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Step 3 — Check connection status.
 */
export async function getConnectionStatus(connectionId: string): Promise<GetConnectionResponse> {
  return apiRequest<GetConnectionResponse>(
    `/v3/data-connections/${connectionId}`,
  );
}

/**
 * Step 4 — Fetch connected accounts + balances.
 */
export async function getConnectedAccounts(
  connectionId: string,
  options?: {
    type?: "account" | "card";
    cursor?: string;
  },
): Promise<GetAccountsResponse> {
  const params = new URLSearchParams();
  if (options?.type) params.set("type", options.type);
  if (options?.cursor) params.set("cursor", options.cursor);

  const query = params.toString() ? `?${params.toString()}` : "";

  return apiRequest<GetAccountsResponse>(
    `/v3/connected-accounts${query}`,
    {},
    connectionId,
  );
}

/**
 * Step 5a — Request transactions (async). Returns request_id.
 * A `transactions_request_completed` webhook fires when ready.
 */
export async function requestTransactions(
  connectionId: string,
  accountId: string,
  options?: {
    startDate?: string; // ISO date
    endDate?: string;   // ISO date
  },
): Promise<RequestTransactionsResponse> {
  const body: Record<string, string> = {};
  if (options?.startDate) body.start_date = options.startDate;
  if (options?.endDate) body.end_date = options.endDate;

  return apiRequest<RequestTransactionsResponse>(
    `/v3/connected-accounts/${accountId}/transactions/requests`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    connectionId,
  );
}

/**
 * Step 5b — Fetch transactions result (after webhook fires).
 */
export async function getTransactions(
  connectionId: string,
  accountId: string,
  requestId: string,
): Promise<GetTransactionsResponse> {
  return apiRequest<GetTransactionsResponse>(
    `/v3/connected-accounts/${accountId}/transactions/requests/${requestId}`,
    {},
    connectionId,
  );
}

// ─── Webhook verification ─────────────────────────────────

/**
 * Verify a TrueLayer webhook signature.
 *
 * TrueLayer signs webhooks with HMAC-SHA256 using the webhook secret
 * configured in TrueLayer Console. The signature is sent in the
 * `Webhook-Signature` header.
 */
export function verifyWebhookSignature(
  body: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  const data = encoder.encode(body);

  // Use crypto.timingSafeEqual for constant-time comparison
  const expected = createHmac("sha256", key).update(data).digest("hex");

  if (expected.length !== signature.length) return false;

  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature),
  );
}

/**
 * Alternative: verify using the `Signed-Signature` header format
 * (t=<timestamp>,v1=<signature>) similar to Stripe-style signatures.
 * TrueLayer may use this format depending on the webhook type.
 */
export function verifyWebhookSignatureWithTimestamp(
  body: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const encoder = new TextEncoder();
  const key = encoder.encode(secret);

  // Parse "t=...,v1=..." format
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signature = parts.find((p) => p.startsWith("v1="))?.slice(3);

  if (!timestamp || !signature) {
    // Fall back to simple HMAC verification
    return verifyWebhookSignature(body, signatureHeader, secret);
  }

  const payload = `${timestamp}.${body}`;
  const data = encoder.encode(payload);
  const expected = createHmac("sha256", key).update(data).digest("hex");

  if (expected.length !== signature.length) return false;

  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature),
  );
}

// ─── Error class ───────────────────────────────────────────

export class TrueLayerAPIError extends Error {
  public readonly status: number;
  public readonly trueLayerError?: Partial<TrueLayerError>;

  constructor(
    message: string,
    status: number,
    error?: Partial<TrueLayerError>,
  ) {
    super(message);
    this.name = "TrueLayerAPIError";
    this.status = status;
    this.trueLayerError = error;
  }
}
