// ─── Salt Edge API v6 types ─────────────────────────────────
// https://api.saltedge.com/api/v6/
// Auth: HTTP Basic (app_id:api_key)
// Docs: https://docs.saltedge.com/v6/api_reference

// ─── Countries ─────────────────────────────────────────────

export interface SaltEdgeCountry {
  id: number;
  code: string;
  name: string;
  enabled: boolean;
}

// ─── Providers (banks) ─────────────────────────────────────

export type ProviderType =
  | "bank"
  | "business"
  | "e_wallet"
  | "card"
  | "investment"
  | "preselected";

export interface SaltEdgeProvider {
  id: number;
  code: string;
  name: string;
  type: ProviderType;
  customer_notified_support: boolean;
  customer_notified_activation: boolean;
  link: string | null;
  holder_info: string[] | null;
  image: string;
  countryCode: string;
  countryName: string;
  description: string;
  createdAt: string;
  updatedOn: string;
  balance_types: {
    cards: string[];
    accounts: string[];
    loans: string[] | null;
    credit_cards: string[];
    e_accounts: string[];
  };
  languages: string[];
  locations: string[] | null;
  openbanking_xb_uk_authorisation_model: boolean;
  regulatory_availability: string;
  consent_levels: string[];
  max_consents: number | null;
  ssl_standard: string | null;
  max_account_verification: number | null;
  max_consents_per_user: number | null;
  supported_iframe_embedding: boolean;
  has_favorite_bank: boolean;
  has_favorite_bank_support: boolean;
  instant_auth_supported: boolean;
  payment_templates: string | null;
  auto_update_enabled: boolean;
  auto_update_default: string | null;
  status: "inaccessible" | "accessible" | "active" | null;
}

export interface SaltEdgeProviderShow extends SaltEdgeProvider {
  fields: {
    generated: Record<string, unknown>[];
    not_available: Record<string, unknown>[];
  };
  required_fields: Array<{
    name: string;
    label?: string;
    optional?: boolean;
    field_options?: Record<string, unknown>;
    html_flag?: "input" | "select" | "hidden";
    position?: number;
  }>;
  oAuth: boolean;
  identify_mfa: boolean;
}

// ─── Customers ─────────────────────────────────────────────

export interface SaltEdgeCustomer {
  id: number;
  customer_id: string;
  identifier: string;
  created_at: string;
  updated_at: string;
  status: "active" | "blocked" | "deleted";
  locale: string;
}

// ─── Connections ────────────────────────────────────────────

export type ConnectionStatus =
  | "initiated"
  | "logging_in"
  | "selecting_psd2_subapp"
  | "requesting_scopes"
  | "obtaining_auth_method_token"
  | "requesting_auth_method"
  | "preselected_psd2_subapp"
  | "preselected_authorization_method"
  | "authenticating"
  | "granting_access"
  | "choosing_account"
  | "entered_legal_terms"
  | "created_at"
  | "end_user_update"
  | "active"
  | "inactive"
  | "inactive_due_to_consent_expired"
  | "revoked"
  | "deleted";

export interface SaltEdgeConnection {
  id: number;
  status: ConnectionStatus;
  connection_id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  customer_id: number;
  provider_code: string;
  provider: SaltEdgeProvider | null;
  next_refresh_at: string | null;
  save_consent: boolean;
  show_consent_confirmation: boolean;
  last_consent_id: string | null;
  last_attempt: {
    id: number;
    message: string;
    message_attributes: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    status: string;
    redirects: {
      entry: string | null;
      exit: string | null;
    };
    window: {
      id: number;
      timeout: boolean;
      started_at: string;
      continues_at: string | null;
    };
  } | null;
  keep_connection: boolean;
  psd2_scopes: string[] | null;
  consent_id: string | null;
}

export interface SaltEdgeConnectionCreate {
  connection_id: string;
  redirect_url: string;
}

export interface SaltEdgeConnectionShow extends SaltEdgeConnection {
  redirect_url?: string;
  credentials: Record<string, string> | null;
  consent: {
    consent_id: string;
    consent_url: string;
    accounts: boolean;
    scope: string;
    validity: {
      start: string;
      end: string;
    };
    data: {
      accounts: string[];
      transactions: string[];
    };
    revoke: boolean;
    from_scratch: boolean;
    received_at: string;
    customer_notified: boolean;
  } | null;
}

// ─── Accounts ─────────────────────────────────────────────

export interface SaltEdgeAccount {
  id: number;
  account_id: string;
  connection_id: number;
  customer_id: number;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
  mode: "normal" | "pool" | "bonus" | "anonymous" | "cash";
  type: string;
  name: string;
  balance: number;
  currency: string;
  cashback: {
    total: number;
    received: number;
    posted: number;
  } | null;
  debit_transactions: number;
  credit_transactions: number;
  transaction_count: number;
  transaction_daily_count: number;
  transaction_daily_ratio: number;
  starting_balance: number | null;
  balance_types: string[];
  status: "normal" | "inactive" | "deleted" | "frozen";
  subcategory: string;
  extra: {
    client_name: string | null;
    matured_date: string | null;
    maturity_date: string | null;
    charge_bearer: string | null;
    collateral_amount: number | null;
    investment_amount: number | null;
    investment_period: string | null;
    investment_date: string | null;
    interest_amount: number | null;
    interest_rate: number | null;
    interest_type: string | null;
    capital_amount: number | null;
    next_payment_date: string | null;
    next_withholding_date: string | null;
    payment_due_date: string | null;
    payment_method: string | null;
    final_interest_date: string | null;
    end_to_end_reference: string | null;
    original_amount: number | null;
    original_currency: string | null;
    exchange_rate: number | null;
    compounding_frequency: string | null;
    deposit_amount: number | null;
  } | null;
  IBAN: string | null;
  BBAN: string | null;
  BIC: string | null;
  bank_code: string | null;
  transit_number: string | null;
  bank_ifsc_code: string | null;
  nick_name: string | null;
  categories: string[];
  generated_at: string;
}

// ─── Transactions ──────────────────────────────────────────

export interface SaltEdgeTransaction {
  id: number;
  transaction_id: string;
  account_id: number;
  connection_id: number;
  customer_id: number;
  created_at: string;
  updated_at: string;
  status: "posted" | "pending";
  extra: {
    client_name: string | null;
    category: string | null;
    category_guid: string | null;
    client_category: string | null;
    client_category_guid: string | null;
    original_balance: number | null;
    original_currency_code: string | null;
    original_amount: number | null;
    remaining_balance: number | null;
    posting_date: string | null;
  };
  bank_date: string;
  posted_at: string;
  transaction_type: string;
  description: string;
  amount: number;
  currency: string;
  bank_reference: string | null;
  transfer_account_id: number | null;
}

// ─── Callbacks ─────────────────────────────────────────────

export interface SaltEdgeCallback {
  customer_id: number;
  connection_id: number;
  status: string;
  classification: string;
  created_at: string;
}

// ─── Generic paginated response ───────────────────────────

export interface SaltEdgePaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      current: number;
      next: number | null;
      prev: number | null;
      count: number;
      per_page: number;
      total: {
        count: number;
      };
    };
  };
}
