import { prisma } from "@/lib/prisma";
import ManualEntriesManager from "@/components/manual-entries-manager";

interface BalanceEntry {
  id: string;
  date: string;
  amount: number;
  currency: string;
  source: string;
  isLiability: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface IncomeEntry {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExpenseEntry {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: string;
  card: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

async function getInitialData(): Promise<{
  balances: BalanceEntry[];
  incomes: IncomeEntry[];
  expenses: ExpenseEntry[];
}> {
  try {
    const [balances, incomes, expenses] = await Promise.all([
      prisma.balanceEntry.findMany({
        where: { deletedAt: null },
        orderBy: { date: "desc" },
      }),
      prisma.incomeEntry.findMany({
        where: { deletedAt: null },
        orderBy: { date: "desc" },
      }),
      prisma.expenseEntry.findMany({
        where: { deletedAt: null },
        orderBy: { date: "desc" },
      }),
    ]);

    // Prisma returns Date objects — explicitly convert to ISO strings
    // so the data is safely serializable for Client Components.
    return {
      balances: balances.map((b) => ({
        id: b.id,
        date: b.date.toISOString(),
        amount: b.amount,
        currency: b.currency,
        source: b.source,
        isLiability: b.isLiability,
        deletedAt: b.deletedAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
      incomes: incomes.map((i) => ({
        id: i.id,
        date: i.date.toISOString(),
        amount: i.amount,
        description: i.description,
        category: i.category,
        deletedAt: i.deletedAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
      expenses: expenses.map((e) => ({
        id: e.id,
        date: e.date.toISOString(),
        amount: e.amount,
        description: e.description,
        category: e.category,
        card: e.card,
        deletedAt: e.deletedAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("Failed to fetch manual entries:", error);
    return { balances: [], incomes: [], expenses: [] };
  }
}

export default async function ManualPage() {
  const data = await getInitialData();
  return <ManualEntriesManager initialData={data} />;
}
