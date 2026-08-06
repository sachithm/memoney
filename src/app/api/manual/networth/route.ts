import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Trading212DashboardData } from "@/lib/trading212";

/**
 * GET /api/manual/networth
 *
 * Returns a combined picture of net worth across all data sources:
 *  1. Manual balance entries (assets / liabilities) — always included
 *  2. Trading 212 equity (fetched via the T212 client)
 *  3. Bank accounts (via TrueLayer or Salt Edge — if available)
 *
 * Query params:
 *  ?from=2024-01-01   — filter entries from this date (ISO)
 *  ?to=2024-12-31     — filter entries to this date (ISO)
 *  ?group=day|month   — group time-series data (default: day)
 *
 * Response shape:
 *  {
 *    timeSeries: [{ date, netWorth }],
 *    balances: [{ date, totalAssets, totalLiabilities, netWorth }],
 *    income:   { total, byCategory: [{ category, total }] },
 *    expenses: { total, byCategory: [{ category, total }] },
 *    trading212: { totalValue, cash, investments } | null,
 *    bankAccounts: [{ name, balance, currency, source }],
 *    summary: {
 *      netWorth,
 *      totalAssets,
 *      totalLiabilities,
 *      income: { total, savingsRate },
 *      expenses: { total },
 *      monthlySavings: number,
 *    }
 *  }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const group = url.searchParams.get("group") || "day";

    const from = fromParam ? new Date(fromParam) : undefined;
    const to = toParam ? new Date(toParam) : undefined;

    // ─── 1. Manual balance entries ───────────────────────
    const balanceWhere: {
      deletedAt: null;
      date?: { gte?: Date; lte?: Date };
    } = {
      deletedAt: null,
    };
    if (from || to) {
      balanceWhere.date = {};
      if (from) balanceWhere.date.gte = from;
      if (to) balanceWhere.date.lte = to;
    }

    const balances = await prisma.balanceEntry.findMany({
      where: balanceWhere,
      orderBy: { date: "asc" },
    });

    const incomeWhere: {
      deletedAt: null;
      date?: { gte?: Date; lte?: Date };
    } = {
      deletedAt: null,
    };
    if (from || to) {
      incomeWhere.date = {};
      if (from) incomeWhere.date.gte = from;
      if (to) incomeWhere.date.lte = to;
    }

    const incomes = await prisma.incomeEntry.findMany({
      where: incomeWhere,
      orderBy: { date: "asc" },
    });

    const expenseWhere: {
      deletedAt: null;
      date?: { gte?: Date; lte?: Date };
    } = {
      deletedAt: null,
    };
    if (from || to) {
      expenseWhere.date = {};
      if (from) expenseWhere.date.gte = from;
      if (to) expenseWhere.date.lte = to;
    }

    const expenses = await prisma.expenseEntry.findMany({
      where: expenseWhere,
      orderBy: { date: "asc" },
    });

    // ─── 2. Trading 212 data ─────────────────────────────
    let trading212Data: Trading212DashboardData | null = null;
    try {
      // Import the T212 client — it uses env vars directly
      const { getTrading212DashboardData } = await import("@/lib/trading212");
      trading212Data = await getTrading212DashboardData();
    } catch {
      // T212 not configured — silently skip
    }

    // ─── 3. Bank accounts from DB (trueLayer or salt edge) ─
    const dbAccounts = await prisma.account.findMany({
      include: { connection: true },
    });
    const bankAccounts = dbAccounts.map((acc) => ({
      name: acc.name,
      balance: acc.balance ?? 0,
      availableBalance: acc.availableBalance ?? acc.balance ?? null,
      currency: acc.currency,
      source: acc.connection.providerId,
    }));

    // ─── Compute net-worth time series from balance entries ─
    // Each balance entry represents a snapshot. We compute net worth at
    // each unique date by summing all assets minus liabilities entered
    // up to and including that date.
    const dates = [...new Set(balances.map((b) => b.date.toISOString()))].sort();

    // Group dates if requested (default: "day")
    let groupedDates: string[];
    if (group === "month") {
      // Take the last entry of each month
      const months: Record<string, string> = {};
      for (const d of dates) {
        const iso = new Date(d).toISOString();
        const monthKey = iso.slice(0, 7); // "YYYY-MM"
        months[monthKey] = iso; // always keep the latest
      }
      groupedDates = Object.values(months).sort();
    } else {
      groupedDates = dates;
    }

    const computeNetWorth = (snapshot: Date) => {
      const entriesUpTo = balances.filter(
        (b) => b.date.getTime() <= snapshot.getTime(),
      );
      const totalAssets = entriesUpTo
        .filter((b) => !b.isLiability)
        .reduce((sum, b) => sum + b.amount, 0);
      const totalLiabilities = entriesUpTo
        .filter((b) => b.isLiability)
        .reduce((sum, b) => sum + b.amount, 0);
      const t212Value = trading212Data?.account?.totalValue ?? 0;
      return { netWorth: totalAssets - totalLiabilities + t212Value, totalAssets, totalLiabilities };
    };

    const timeSeries: { date: string; netWorth: number }[] = groupedDates.map((d) => {
      const result = computeNetWorth(new Date(d));
      return { date: d, netWorth: result.netWorth };
    });

    // ─── Balances detail (per-date breakdown) ─
    const balancesDetail = groupedDates.map((d) => {
      const result = computeNetWorth(new Date(d));
      return {
        date: d,
        totalAssets: result.totalAssets,
        totalLiabilities: result.totalLiabilities,
        netWorth: result.netWorth,
      };
    });

    // ─── Income breakdown ─
    const incomeTotal = incomes.reduce((sum, i) => sum + i.amount, 0);
    const incomeByCategory = incomes.reduce(
      (acc: Record<string, number>, i) => {
        acc[i.category] = (acc[i.category] || 0) + i.amount;
        return acc;
      },
      {},
    );

    // ─── Expense breakdown ─
    const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    const expenseByCategory = expenses.reduce(
      (acc: Record<string, number>, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      },
      {},
    );

    // ─── Summary ─
    const allAssets = bankAccounts.reduce(
      (sum, a) => sum + (a.balance ?? 0),
      0,
    );
    const allLiabilities = 0; // bank card balances are negative
    const t212Value = trading212Data?.account?.totalValue ?? 0;
    const balanceSum = balances
      .filter((b) => !b.isLiability)
      .reduce((sum, b) => sum + b.amount, 0);
    const liabilitySum = balances
      .filter((b) => b.isLiability)
      .reduce((sum, b) => sum + b.amount, 0);
    const totalAssets = balanceSum + t212Value + allAssets;
    const totalLiabilitiesSum = liabilitySum + allLiabilities;
    const netWorth = totalAssets - totalLiabilitiesSum;

    const savings = incomeTotal - expenseTotal;
    const savingsRate = incomeTotal > 0 ? (savings / incomeTotal) * 100 : 0;

    // Monthly savings (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthlyIncome = incomes
      .filter((i) => i.date >= thirtyDaysAgo)
      .reduce((sum, i) => sum + i.amount, 0);
    const monthlyExpense = expenses
      .filter((e) => e.date >= thirtyDaysAgo)
      .reduce((sum, e) => sum + e.amount, 0);
    const monthlySavings = monthlyIncome - monthlyExpense;

    return Response.json({
      timeSeries,
      balances: balancesDetail,
      income: {
        total: incomeTotal,
        byCategory: Object.entries(incomeByCategory).map(([category, total]) => ({
          category,
          total,
        })),
      },
      expenses: {
        total: expenseTotal,
        byCategory: Object.entries(expenseByCategory).map(([category, total]) => ({
          category,
          total,
        })),
      },
      trading212: trading212Data
        ? {
            totalValue: trading212Data.account?.totalValue ?? 0,
            cash: trading212Data.account?.cash?.availableToTrade ?? 0,
            investments: trading212Data.account?.investments?.currentValue ?? 0,
          }
        : null,
      bankAccounts,
      summary: {
        netWorth,
        totalAssets,
        totalLiabilities: totalLiabilitiesSum,
        income: {
          total: incomeTotal,
          savingsRate: Math.round(savingsRate * 10) / 10,
        },
        expenses: { total: expenseTotal },
        monthlySavings,
      },
    });
  } catch (e) {
    console.error("[api/manual/networth]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}

// Ensure this route is always fresh (reflects latest manual entries)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
