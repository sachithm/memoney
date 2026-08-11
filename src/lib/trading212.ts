import {
  Trading212Env,
  Trading212AccountSummary,
  Trading212Position,
  Trading212HistoryTransaction,
  Trading212PaginatedResponse,
  Trading212DividendTransaction,
  Trading212OrderItem,
  Trading212Instrument,
  Trading212Exchange,
} from "./trading212-types";

// ─── Feature flag ──────────────────────────────────────────
// Set TRADING212_ENABLED=false in .env to disable the integration entirely
// (e.g. when the API key is rate-limited / expired and you just want the app
// to load). When disabled, no network calls are made to Trading 212 and the
// client behaves as if it were "not configured".
const TRADING212_ENABLED = process.env.TRADING212_ENABLED !== "false";

// ─── Configuration ─────────────────────────────────────────

function getConfig() {
  const env = (process.env.TRADING212_ENV || "demo") as Trading212Env;
  const apiKey = process.env.TRADING212_API_KEY || "";
  const apiSecret = process.env.TRADING212_API_SECRET || "";

  if (!apiKey) {
    throw new Error(
      "TRADING212_API_KEY is not configured. Add it to your .env file.",
    );
  }

  const apiBase =
    env === "demo"
      ? "https://demo.trading212.com/api/v0"
      : "https://live.trading212.com/api/v0";

  // Trading 212 supports two auth methods:
  //   1. HTTP Basic auth: base64(api_key:api_secret) — preferred, more secure
  //   2. Raw API key in Authorization header — fallback when no secret
  const authHeader = apiSecret
    ? `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`
    : apiKey;

  return { env, apiKey, apiSecret, apiBase, authHeader };
}

// ─── Rate limiter ──────────────────────────────────────────
// Trading 212 free/sandbox API: 1 request per 5 seconds.
// We enforce this client-side to avoid 429s.
//
// The limiter must SERIALIZE concurrent requests — a naive "sleep based on the
// last start time" check is a race condition: two callers can both observe the
// same `lastRequestTime`, both sleep, and then both fire at the same instant,
// triggering 429 Too Many Requests. We instead chain every caller onto a
// single in-flight promise queue so requests proceed strictly one at a time.

const RATE_LIMIT_MS = 5000; // 5 seconds between requests
let lastRequestTime = 0;
let rateLimitQueue: Promise<void> = Promise.resolve();

async function enforceRateLimit(): Promise<void> {
  // Chain onto the tail of the queue. The .then callback runs only after the
  // previous request's "slot" was taken, so concurrent callers can never fire
  // simultaneously.
  const prev = rateLimitQueue;
  const myTurn = prev.then(async () => {
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < RATE_LIMIT_MS) {
      const wait = RATE_LIMIT_MS - elapsed;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastRequestTime = Date.now();
  });
  rateLimitQueue = myTurn;
  await myTurn;
}

// ─── API Request Helper ────────────────────────────────────

export class Trading212APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = "Trading212APIError";
  }
}

async function t212Request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.apiBase}${path}`;

  await enforceRateLimit();

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: cfg.authHeader,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail: unknown;
    try {
      detail = JSON.parse(text);
    } catch {
      detail = text;
    }
    throw new Trading212APIError(
      `Trading 212 API request failed: ${res.status} ${res.statusText}`,
      res.status,
      detail,
    );
  }

  // 204 No Content or empty body
  const body = await res.text();
  if (!body || body === "[]") {
    return (body === "[]" ? [] : null) as T;
  }

  return JSON.parse(body) as T;
}

// ─── Server-side cache ─────────────────────────────────────
// Cache each endpoint's response for a short period to avoid hitting the
// 1 req/5s rate limit on repeated fetches.

const CACHE_TTL_MS = 300_000; // 5 minutes — keep the dashboard responsive
const responseCache = new Map<string, { data: unknown; expiresAt: number }>();
// De-duplicate concurrent cache misses for the same key: when two callers
// request the same endpoint at once (e.g. page.tsx fetches both
// /api/trading212/data and /api/manual/networth, which both call this
// client), the second caller awaits the first's in-flight request instead of
// firing a duplicate call that would race into a 429.
const inFlight = new Map<string, Promise<unknown>>();

async function cachedRequest<T>(cacheKey: string, path: string): Promise<T> {
  const cached = responseCache.get(cacheKey);

  // Serve from cache if still valid
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  // Another caller is already fetching this key — await its result
  const existing = inFlight.get(cacheKey);
  if (existing) {
    return existing as T;
  }

  // Cache miss or expired — attempt a fresh API call
  const promise = (async () => {
    try {
      const data = await t212Request<T>(path);
      responseCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return data;
    } catch (e) {
      // API call failed — fall back to stale cached data if available
      if (cached) {
        console.warn(
          `T212 API request failed for ${cacheKey}, serving stale cached data:`,
          (e as Error).message,
        );
        return cached.data as T;
      }
      // No cache to fall back on — rethrow
      throw e;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise as T;
}

// ─── Public API ────────────────────────────────────────────

export interface Trading212Client {
  getAccountSummary: () => Promise<Trading212AccountSummary>;
  getPositions: () => Promise<Trading212Position[]>;
  getHistoryTransactions: (cursor?: string) => Promise<Trading212PaginatedResponse<Trading212HistoryTransaction>>;
  getDividends: (cursor?: string) => Promise<Trading212PaginatedResponse<Trading212DividendTransaction>>;
  getOrders: (cursor?: string) => Promise<Trading212PaginatedResponse<Trading212OrderItem>>;
  getInstruments: (ticker?: string) => Promise<Trading212Instrument[]>;
  getExchanges: () => Promise<Trading212Exchange[]>;
  isConfigured: () => boolean;
}

export function createTrading212Client(): Trading212Client {
  return {
    isConfigured: () => {
      if (!TRADING212_ENABLED) return false;
      try {
        getConfig();
        return true;
      } catch {
        return false;
      }
    },

    getAccountSummary: async () => {
      return cachedRequest<Trading212AccountSummary>("t212:account", "/equity/account/summary");
    },

    getPositions: async () => {
      return cachedRequest<Trading212Position[]>("t212:positions", "/equity/positions");
    },

    getHistoryTransactions: async (cursor?: string) => {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return cachedRequest<Trading212PaginatedResponse<Trading212HistoryTransaction>>(
        `t212:transactions:${cursor || "first"}`,
        `/equity/history/transactions${qs}`,
      );
    },

    getDividends: async (cursor?: string) => {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return cachedRequest<Trading212PaginatedResponse<Trading212DividendTransaction>>(
        `t212:dividends:${cursor || "first"}`,
        `/equity/history/dividends${qs}`,
      );
    },

    getOrders: async (cursor?: string) => {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return t212Request<Trading212PaginatedResponse<Trading212OrderItem>>(
        `/equity/orders${qs}`,
      );
    },

    getInstruments: async (ticker?: string) => {
      const qs = ticker ? `?ticker=${encodeURIComponent(ticker)}` : "";
      return t212Request<Trading212Instrument[]>(
        `/equity/metadata/instruments${qs}`,
      );
    },

    getExchanges: async () => {
      return t212Request<Trading212Exchange[]>("/equity/metadata/exchanges");
    },
  };
}

// ─── Convenience: fetch all Trading 212 data ────────────────

export interface Trading212DashboardData {
  account: Trading212AccountSummary | null;
  positions: Trading212Position[];
  transactions: Trading212HistoryTransaction[];
  dividends: Trading212DividendTransaction[];
  error?: string;
}

export async function getTrading212DashboardData(): Promise<Trading212DashboardData> {
  const client = createTrading212Client();

  // Integration explicitly disabled via TRADING212_ENABLED=false — return the
  // empty shape with no error so the dashboard shows the friendly "not
  // configured" hint instead of a red error box.
  if (!TRADING212_ENABLED) {
    return {
      account: null,
      positions: [],
      transactions: [],
      dividends: [],
    };
  }

  if (!client.isConfigured()) {
    return {
      account: null,
      positions: [],
      transactions: [],
      dividends: [],
      error: "Trading 212 API key not configured",
    };
  }

  try {
    // Sequential requests due to T212 rate limit (1 req / 5s)
    let account: Trading212AccountSummary | null = null;
    let positions: Trading212Position[] = [];
    let transactions: Trading212HistoryTransaction[] = [];
    let dividends: Trading212DividendTransaction[] = [];

    account = await client
      .getAccountSummary()
      .catch((e) => {
        console.error("T212 account summary error:", e);
        return null;
      });

    positions = await client.getPositions().catch((e) => {
      console.error("T212 positions error:", e);
      return [];
    });

    transactions = await client
      .getHistoryTransactions()
      .then((r) => r.items)
      .catch((e) => {
        console.error("T212 transactions error:", e);
        return [];
      });

    dividends = await client
      .getDividends()
      .then((r) => r.items)
      .catch((e) => {
        console.error("T212 dividends error:", e);
        return [];
      });

    return { account, positions, transactions, dividends };
  } catch (e) {
    console.error("Trading 212 fetch error:", e);
    return {
      account: null,
      positions: [],
      transactions: [],
      dividends: [],
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
