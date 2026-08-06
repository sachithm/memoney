import { prisma } from "@/lib/prisma";
import DashboardClient from "@/components/dashboard-client";
import { Trading212DashboardData } from "@/lib/trading212";

interface Connection {
  id: string;
  providerId: string;
  connectionId: string | null;
  status: string;
  lastAuthorizedAt: string | null;
  scopes: string;
  source: string;
  createdAt: string;
}

interface Account {
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

interface ManualData {
  timeSeries: { date: string; netWorth: number }[];
  income: {
    total: number;
    byCategory: { category: string; total: number }[];
  };
  expenses: {
    total: number;
    byCategory: { category: string; total: number }[];
  };
  trading212: {
    totalValue: number;
    cash: number;
    investments: number;
  } | null;
  bankAccounts: { name: string; balance: number; currency: string; source: string }[];
  summary: {
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
    income: { total: number; savingsRate: number };
    expenses: { total: number };
    monthlySavings: number;
  };
}

async function getInitialData(): Promise<{
  connections: Connection[];
  accounts: Account[];
  trading212: Trading212DashboardData;
  manual: ManualData;
}> {
  try {
    const [connections, accounts, trading212Res, manualRes] =
      await Promise.all([
        prisma.connection.findMany({
          orderBy: { createdAt: "desc" },
        }),
        prisma.account.findMany({
          where: {
            connection: {
              status: "AUTHORIZED",
            },
          },
          orderBy: { lastUpdated: "desc" },
        }),
        // Use Next.js route cache (shared across server components + API routes)
        // with 30s revalidation to avoid hitting T212's 1 req/5s rate limit
        fetch(
          `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/trading212/data`,
          {
            next: { revalidate: 30 },
          },
        ),
        fetch(
          `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/manual/networth`,
          { next: { revalidate: 0 } },
        ),
      ]);

    const trading212: Trading212DashboardData = await trading212Res.json();
    const manual: ManualData = await manualRes.json();

    return {
      connections: connections.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        lastAuthorizedAt: c.lastAuthorizedAt?.toISOString() ?? null,
      })),
      accounts: accounts.map((a) => ({
        ...a,
        lastUpdated: a.lastUpdated.toISOString(),
      })),
      trading212,
      manual,
    };
  } catch (error) {
    console.error("Failed to fetch initial data:", error);
    return {
      connections: [],
      accounts: [],
      trading212: {
        account: null,
        positions: [],
        transactions: [],
        dividends: [],
      },
      manual: {
        timeSeries: [],
        income: { total: 0, byCategory: [] },
        expenses: { total: 0, byCategory: [] },
        trading212: null,
        bankAccounts: [],
        summary: {
          netWorth: 0,
          totalAssets: 0,
          totalLiabilities: 0,
          income: { total: 0, savingsRate: 0 },
          expenses: { total: 0 },
          monthlySavings: 0,
        },
      },
    };
  }
}

export default async function Home() {
  const data = await getInitialData();
  return <DashboardClient initialData={data} />;
}
