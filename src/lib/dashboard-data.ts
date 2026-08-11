import { prisma } from "@/lib/prisma";
import {
  Connection,
  Account,
  ManualData,
  Trading212DashboardData,
  type DashboardInitialData,
} from "@/lib/types";

/**
 * Fetch the data needed to hydrate the dashboard on first paint.
 *
 * Connections & accounts come straight from Prisma (server-only, so Date
 * objects are safe). The Trading 212 and net-worth payloads are fetched via
 * the App Router's shared route cache — T212 with a short revalidate to stay
 * under its 1 req/5s rate limit, and manual net worth always fresh
 * (`revalidate: 0`).
 *
 * Shared by the net-worth tracker page (and previously the home page) so the
 * data-loading logic lives in exactly one place.
 */
export async function getInitialData(): Promise<DashboardInitialData> {
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
      connections: connections.map((c): Connection => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        lastAuthorizedAt: c.lastAuthorizedAt?.toISOString() ?? null,
      })),
      accounts: accounts.map((a): Account => ({
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
