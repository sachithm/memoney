// ─── Trading 212 API v0 types ──────────────────────────────
// https://demo.trading212.com/api/v0 / https://live.trading212.com/api/v0
// Auth: HTTP Basic (api_key:api_secret) or raw API key
// Rate limit: 1 req per 5 seconds

// ─── Environment ───────────────────────────────────────────

export type Trading212Env = "demo" | "live";

// ─── Account Summary ───────────────────────────────────────

export interface Trading212Cash {
  availableToTrade: number;
  reservedForOrders: number;
  inPies: number;
}

export interface Trading212Investments {
  currentValue: number;
  totalCost: number;
  realizedProfitLoss: number;
  unrealizedProfitLoss: number;
}

export interface Trading212AccountSummary {
  id: number;
  currency: string;
  totalValue: number;
  cash: Trading212Cash;
  investments: Trading212Investments;
}

// ─── Positions ─────────────────────────────────────────────

export type PositionType = "STOCK" | "ETF";

export interface Trading212PositionInstrument {
  ticker: string;
  isin: string;
  currencyCode: string;
  name: string;
  shortName: string;
}

export interface Trading212Position {
  ticker: string;
  quantity: number;
  averagePricePaid: number;
  currentPrice: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercentage: number;
  instrument?: Trading212PositionInstrument;
}

// ─── History Transactions ──────────────────────────────────

export type HistoryTransactionType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "DEPOSIT"
  | "WITHDRAW"
  | "FEE"
  | "TRANSFER";

export interface Trading212HistoryTransaction {
  type: HistoryTransactionType;
  amount: number;
  currency: string;
  reference: string;
  dateTime: string; // ISO 8601
}

export interface Trading212PaginatedResponse<T> {
  items: T[];
  nextPagePath: string | null;
}

// ─── Dividends ─────────────────────────────────────────────

export interface Trading212DividendTransaction {
  type: "DIVIDEND";
  amount: number;
  currency: string;
  reference: string;
  dateTime: string;
  ticker?: string;
  id?: string;
}

// ─── Orders ────────────────────────────────────────────────

export type OrderStatus =
  | "LOCAL"
  | "UNCONFIRMED"
  | "CONFIRMED"
  | "NEW"
  | "CANCELLING"
  | "CANCELLED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "REJECTED"
  | "REPLACING"
  | "REPLACED";

export interface Trading212OrderItem {
  id: string;
  ticker: string;
  quantity: number;
  price: number;
  currency: string;
  status: OrderStatus;
  createdDateTime: string;
  filledQuantity?: number;
  filledAveragePrice?: number;
  type: "BUY" | "SELL";
}

// ─── Metadata ──────────────────────────────────────────────

export type InstrumentType = "STOCK" | "ETF" | "CRYPTO" | "REIT" | "ADR";

export interface Trading212Instrument {
  ticker: string;
  type: InstrumentType;
  workingScheduleId: number;
  isin: string;
  currencyCode: string;
  name: string;
  shortName: string;
  maxOpenQuantity: number;
  extendedHours: boolean;
  addedOn: string;
}

export interface Trading212Exchange {
  id: number;
  name: string;
  code: string;
  countryCode: string;
  timezone: string;
}
