import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const expenseSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  amount: z.number().positive(),
  description: z.string().min(1),
  category: z.string().default("Other").optional(),
  card: z.string().optional(),
});

/**
 * GET  /api/manual/expenses    — list all non-deleted expense entries
 * POST /api/manual/expenses    — create an expense entry
 */
export async function GET() {
  try {
    const expenses = await prisma.expenseEntry.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
    });
    return Response.json(expenses);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = expenseSchema.parse(body);
    const expense = await prisma.expenseEntry.create({
      data: {
        date: parsed.date,
        amount: parsed.amount,
        description: parsed.description,
        category: parsed.category ?? "Other",
        card: parsed.card ?? null,
      },
    });
    return Response.json(expense, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: e.issues },
        { status: 400 },
      );
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
