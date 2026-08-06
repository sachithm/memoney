// ─── TrueLayer Data API v3 shared types ────────────────────

export type TrueLayerEnv = "sandbox" | "production";

export const isTrueLayerEnv = (v: string): v is TrueLayerEnv =>
  v === "sandbox" || v === "production";

export type DataScope = "info" | "accounts" | "transactions";

export interface CreateConnectionRequest {
  scopes: DataScope[];
}

export interface CreateConnectionResponse {
  link_uri: string;
  connection_id: string;
}

export type ConnectionStatusV3 =
  | "authorized"
  | "pending"
  | "failed"
  | "expired"
  | "revoked";

export interface GetConnectionResponse {
  id: string;
  created_at: string;
  expires_at: string;
  link_uri: string;
  provider: {
    id: string;
    name: string;
    logo_url: string;
    coordinates?: {
      country: string;
      joiners?: number;
    };
  };
  status: ConnectionStatusV3;
  scopes: DataScope[];
}

// ─── Accounts ──────────────────────────────────────────────

export interface Provider {
  id: string;
  name: string;
  logo_url: string;
}

export interface Amount {
  amount: number;
  currency: string;
}

export interface AccountMetadata {
  account_type?: "default" | "joint" | "club";
  account_deposit?: "yes" | "no";
  account_capitalization?: "personal" | "business";
}

export interface AccountBase {
  account_id: string;
  account_type: "account" | "card";
  account_name: string;
  account_number?: string;
  sort_code?: string;
  iban?: string;
  pan?: string;
  currency: string;
  provider: Provider;
}

export interface TransactionAccount extends AccountBase {
  account_type: "account";
  balance: Amount;
  available_balance?: Amount;
  effective_balance?: Amount;
  credit_line?: {
    amount: Amount;
    accepted: boolean;
  };
  shifting_bacs?: {
    bacs_reference?: {
      title: string;
      reference: string;
    };
  };
  holder_name?: string;
  bic?: string;
}

export interface CardAccount extends AccountBase {
  account_type: "card";
  balance: Amount;
  available_balance?: Amount;
  card: {
    account_id: string;
    payment_account_id: string;
    pan?: string;
    expiry?: string;
    holder_name?: string;
    provider: Provider;
  };
}

export type AnyAccount = TransactionAccount | CardAccount;

export interface GetAccountsResponse {
  items: AnyAccount[];
  total_count: number;
  has_more: boolean;
}

// ─── Transactions ──────────────────────────────────────────

export type TransactionStatus = "pending" | "posted";

export interface Transaction {
  transaction_id: string;
  account_id: string;
  provider: Provider;
  transaction_type: "transaction";
  transaction_status: TransactionStatus;
  booking_date: string;
  booking_datetime?: string;
  value_date?: string;
  value_datetime?: string;
  transaction_amount: Amount;
  currency: string;
  merchant_name?: string;
  merchant_category_code?: number;
  reference?: string;
  description: string;
  normalized_description?: string;
  category_id?: string;
  category: {
    category_id: string;
    parent_category_id?: string;
    category_name: string;
    parent_category_name?: string;
    category_type: "personal" | "business";
    transaction_type?: "debit" | "credit";
    confidence_level?: "high";
    confidence?: number;
  };
  running_balance?: Amount;
  account_off_balance?: boolean;
  payment_id?: string;
  direct_debit?: {
    reference: string;
  };
  standing_order?: {
    reference: string;
  };
}

export interface RequestTransactionsResponse {
  request_id: string;
  account_id: string;
  status: "pending" | "completed" | "failed";
}

export interface GetTransactionsResponse {
  request_id: string;
  account_id: string;
  status: string;
  results: {
    transactions: Transaction[];
    total_count: number;
    has_more: boolean;
  };
}

// ─── Errors ────────────────────────────────────────────────

export interface TrueLayerError {
  type: string;
  title: string;
  status: number;
  detail: string;
  trace_id: string;
  errors?: Record<string, unknown>;
}
