import {
  SaltEdgeCountry,
  SaltEdgeProvider,
  SaltEdgeProviderShow,
  SaltEdgeCustomer,
  SaltEdgeConnection,
  SaltEdgeConnectionShow,
  SaltEdgeAccount,
  SaltEdgeTransaction,
  SaltEdgePaginatedResponse,
} from "./saltedge-types";

// ─── Configuration ─────────────────────────────────────────

function getConfig() {
  const appId = process.env.SALTEDGE_APP_ID || "";
  const apiKey = process.env.SALTEDGE_API_KEY || "";
  const apiBase =
    process.env.SALTEDGE_API_BASE || "https://api.saltedge.com/api/v6";

  if (!appId || !apiKey) {
    throw new Error(
      "Salt Edge credentials not configured: set SALTEDGE_APP_ID and SALTEDGE_API_KEY",
    );
  }

  // HTTP Basic auth: base64(app_id:api_key)
  const authHeader = `Basic ${Buffer.from(`${appId}:${apiKey}`).toString("base64")}`;

  return { appId, apiKey, apiBase, authHeader };
}

// ─── API Request Helper ────────────────────────────────────

export class SaltEdgeAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = "SaltEdgeAPIError";
  }
}

// Rate limiter: 10 concurrent requests max, simple in-memory
const MAX_CONCURRENT = 10;
let activeRequests = 0;

async function saltedgeRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: Record<string, unknown>,
): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.apiBase}${path}`;

  // Simple concurrency limiter
  while (activeRequests >= MAX_CONCURRENT) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  activeRequests++;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: cfg.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      throw new SaltEdgeAPIError(
        `Salt Edge API request failed: ${res.status} ${res.statusText}`,
        res.status,
        data,
      );
    }

    // Handle both wrapped and unwrapped responses
    // Salt Edge wraps responses: { data: [...], meta: {...} }
    // or { data: {...} }
    if (data && typeof data === "object" && "data" in data) {
      return (data as { data: T }).data as T;
    }
    return data as T;
  } finally {
    activeRequests--;
  }
}

// ─── Customer Management ───────────────────────────────────

export async function createCustomer(
  identifier: string,
): Promise<SaltEdgeCustomer> {
  return saltedgeRequest<SaltEdgeCustomer>("/customers", "POST", {
    customer_id: identifier,
  });
}

export async function listCustomers(
  page = 1,
  perPage = 100,
): Promise<SaltEdgePaginatedResponse<SaltEdgeCustomer>> {
  return saltedgeRequest<SaltEdgePaginatedResponse<SaltEdgeCustomer>>(
    `/customers?page=${page}&per_page=${perPage}`,
  );
}

export async function getCustomer(id: number): Promise<SaltEdgeCustomer> {
  return saltedgeRequest<SaltEdgeCustomer>(`/customers/${id}`);
}

// ─── Provider (Bank) Discovery ─────────────────────────────

export async function listCountries(): Promise<SaltEdgeCountry[]> {
  return saltedgeRequest<SaltEdgeCountry[]>("/countries");
}

export async function listProviders(
  country?: string,
  page = 1,
  perPage = 100,
): Promise<SaltEdgePaginatedResponse<SaltEdgeProvider>> {
  const qs = new URLSearchParams({
    page: page.toString(),
    per_page: perPage.toString(),
    ...(country ? { country } : {}),
  });
  return saltedgeRequest<SaltEdgePaginatedResponse<SaltEdgeProvider>>(
    `/providers?${qs.toString()}`,
  );
}

export async function getProvider(code: string): Promise<SaltEdgeProviderShow> {
  return saltedgeRequest<SaltEdgeProviderShow>(`/providers/${encodeURIComponent(code)}`);
}

// ─── Connections ───────────────────────────────────────────

export async function createConnection(params: {
  customerId: number;
  providerCode: string;
  consent?: {
    accounts: boolean;
    scope: string;
    data: { accounts: string[]; transactions: string[] };
  };
  credentials?: Record<string, string>;
}): Promise<{ connection_id: string; redirect_url: string }> {
  return saltedgeRequest<{ connection_id: string; redirect_url: string }>(
    "/connections",
    "POST",
    {
      customer_id: params.customerId,
      provider_code: params.providerCode,
      ...(params.consent ? { consent: params.consent } : {}),
      ...(params.credentials ? { credentials: params.credentials } : {}),
    },
  );
}

export async function listConnections(
  customerId: number,
  page = 1,
  perPage = 100,
): Promise<SaltEdgePaginatedResponse<SaltEdgeConnection>> {
  return saltedgeRequest<SaltEdgePaginatedResponse<SaltEdgeConnection>>(
    `/connections?page=${page}&per_page=${perPage}&customer_id=${customerId}`,
  );
}

export async function getConnection(
  connectionId: number,
): Promise<SaltEdgeConnectionShow> {
  return saltedgeRequest<SaltEdgeConnectionShow>(
    `/connections/${connectionId}`,
  );
}

export async function reconnectConnection(
  connectionId: number,
  credentials?: Record<string, string>,
): Promise<{ connection_id: string }> {
  return saltedgeRequest<{ connection_id: string }>(
    `/connections/${connectionId}/reconnect`,
    "POST",
    credentials ? { credentials } : undefined,
  );
}

export async function refreshConnection(
  connectionId: number,
): Promise<{ connection_id: string }> {
  return saltedgeRequest<{ connection_id: string }>(
    `/connections/${connectionId}/refresh`,
    "POST",
  );
}

// ─── Accounts ──────────────────────────────────────────────

export interface ListAccountsParams {
  connectionId: number;
  customerId?: number;
  page?: number;
  perPage?: number;
}

export async function listAccounts(
  params: ListAccountsParams,
): Promise<SaltEdgePaginatedResponse<SaltEdgeAccount>> {
  const qs = new URLSearchParams({
    connection_id: params.connectionId.toString(),
    page: (params.page || 1).toString(),
    per_page: (params.perPage || 100).toString(),
    ...(params.customerId
      ? { customer_id: params.customerId.toString() }
      : {}),
  });
  return saltedgeRequest<SaltEdgePaginatedResponse<SaltEdgeAccount>>(
    `/accounts?${qs.toString()}`,
  );
}

export async function getAccount(
  accountId: number,
): Promise<SaltEdgeAccount> {
  return saltedgeRequest<SaltEdgeAccount>(`/accounts/${accountId}`);
}

// ─── Transactions ──────────────────────────────────────────

export interface ListTransactionsParams {
  connectionId?: number;
  accountId?: number;
  customerId?: number;
  dateStart?: string;
  dateEnd?: string;
  page?: number;
  perPage?: number;
}

export async function listTransactions(
  params: ListTransactionsParams,
): Promise<SaltEdgePaginatedResponse<SaltEdgeTransaction>> {
  const qs = new URLSearchParams({
    page: (params.page || 1).toString(),
    per_page: (params.perPage || 100).toString(),
    ...(params.connectionId
      ? { connection_id: params.connectionId.toString() }
      : {}),
    ...(params.accountId
      ? { account_id: params.accountId.toString() }
      : {}),
    ...(params.customerId
      ? { customer_id: params.customerId.toString() }
      : {}),
    ...(params.dateStart ? { date_start: params.dateStart } : {}),
    ...(params.dateEnd ? { date_end: params.dateEnd } : {}),
  });
  return saltedgeRequest<SaltEdgePaginatedResponse<SaltEdgeTransaction>>(
    `/transactions?${qs.toString()}`,
  );
}

// ─── Consents ──────────────────────────────────────────────

export async function revokeConsent(consentId: string): Promise<void> {
  await saltedgeRequest(`/consents/${encodeURIComponent(consentId)}`, "DELETE");
}
