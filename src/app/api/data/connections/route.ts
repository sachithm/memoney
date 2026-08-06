import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/data/connections
 *
 * Lists all connections from the database with their current status.
 */
export async function GET() {
  try {
    const connections = await prisma.connection.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ connections });
  } catch (error) {
    console.error("[api/data/connections]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
