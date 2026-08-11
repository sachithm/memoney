/**
 * Shared domain types used by the dashboard page, its client component, and
 * the API routes that feed them. Centralising them here avoids the type
 * duplication between `src/app/page.tsx` and `src/components/dashboard-client.tsx`
 * (and keeps a single source of truth as the data shape evolves).
 */

import type { Trading212DashboardData } from "@/lib/trading212";
export type { Trading212DashboardData };

/** Re-exported so callers can `import { prisma }` and the types from one place. */
export { prisma } from "@/lib/prisma";

/** A bank connection as surfaced by the dashboard (dates already serialised). */
export interface Connection {
  id: string;
  providerId: string;
  connectionId: string | null;
  status: string;
  lastAuthorizedAt: string | null;
  scopes: string;
  source: string;
  createdAt: string;
}

/** A connected bank account as surfaced by the dashboard (dates serialised). */
export interface Account {
  id: string;
  connectionId: string;
  type: "ACCOUNT" | "CARD";
  name: string;
  currency: string;
  iban?: string | null;
  sortCode?: string | null;
  balance?: number | null;
  availableBalance?: number | null;
  lastUpdated: string;
}

export interface BalanceSourceSummary {
  totalValue: number;
  cash: number;
  investments: number;
}

export interface BankAccountSummary {
  name: string;
  balance: number;
  currency: string;
  source: string;
}

export interface ManualSummary {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  income: { total: number; savingsRate: number };
  expenses: { total: number };
  monthlySavings: number;
}

/**
 * The combined manual-entry + Trading 212 picture returned by
 * `GET /api/manual/networth`.
 */
export interface ManualData {
  timeSeries: { date: string; netWorth: number }[];
  income: {
    total: number;
    byCategory: { category: string; total: number }[];
  };
  expenses: {
    total: number;
    byCategory: { category: string; total: number }[];
  };
  trading212: BalanceSourceSummary | null;
  bankAccounts: BankAccountSummary[];
  summary: ManualSummary;
}

/** Props handed from the server page to the `DashboardClient`. */
export interface DashboardInitialData {
  connections: Connection[];
  accounts: Account[];
  trading212: Trading212DashboardData;
  manual: ManualData;
}
