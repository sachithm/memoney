import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const balanceSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  amount: z.number(),
  currency: z.string().default("GBP").optional(),
  source: z.string().min(1),
  isLiability: z.boolean().default(false).optional(),
});

/**
 * GET  /api/manual/balances       — list all non-deleted balance entries
 * POST /api/manual/balances       — create a balance entry (soft-deletable)
 *
 * Data is soft-deleted: `deletedAt` is set rather than removing the row,
 * so historical net-worth snapshots are always recoverable.
 */
export async function GET() {
  try {
    const balances = await prisma.balanceEntry.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
    });
    return Response.json(balances);
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
    const parsed = balanceSchema.parse(body);
    const balance = await prisma.balanceEntry.create({
      data: {
        date: parsed.date,
        amount: parsed.amount,
        currency: parsed.currency ?? "GBP",
        source: parsed.source,
        isLiability: parsed.isLiability ?? false,
      },
    });
    return Response.json(balance, { status: 201 });
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
