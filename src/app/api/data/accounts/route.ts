import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/data/accounts
 *
 * Returns all accounts from the database (aggregated view).
 * In Phase 2, this will also trigger a refresh of account balances
 * from TrueLayer if the connection is stale.
 */
export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      where: {
        connection: {
          status: "AUTHORIZED",
        },
      },
      include: {
        connection: {
          select: {
            id: true,
            providerId: true,
            status: true,
          },
        },
      },
      orderBy: { lastUpdated: "desc" },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("[api/data/accounts]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
