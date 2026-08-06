import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const querySchema = z.object({
  accountId: z.string(),
});

/**
 * GET /api/data/transactions?accountId=<id>
 *
 * Returns transactions for a given account from the database.
 * In Phase 2, this will trigger a fresh fetch from TrueLayer if needed.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { accountId } = querySchema.parse({
      accountId: searchParams.get("accountId"),
    });

    const transactions = await prisma.transaction.findMany({
      where: { accountId },
      orderBy: { bookedAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("[api/data/transactions]", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "accountId query param is required" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
