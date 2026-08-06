import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const incomeSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  amount: z.number().positive(),
  description: z.string().min(1),
  category: z.string().default("Other").optional(),
});

/**
 * GET  /api/manual/income     — list all non-deleted income entries
 * POST /api/manual/income     — create an income entry
 */
export async function GET() {
  try {
    const incomes = await prisma.incomeEntry.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
    });
    return Response.json(incomes);
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
    const parsed = incomeSchema.parse(body);
    const income = await prisma.incomeEntry.create({
      data: {
        date: parsed.date,
        amount: parsed.amount,
        description: parsed.description,
        category: parsed.category ?? "Other",
      },
    });
    return Response.json(income, { status: 201 });
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
