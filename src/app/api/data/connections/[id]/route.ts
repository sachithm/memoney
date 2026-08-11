import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/data/connections/[id]
 *
 * Returns a single connection and its current status. Used by the
 * `/auth/callback` page to poll the connection state after a user returns
 * from the bank's consent screen (the authoritative `authorized` event still
 * arrives via the TrueLayer webhook, but this gives immediate UX feedback).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const connection = await prisma.connection.findUnique({
      where: { id },
      select: {
        id: true,
        providerId: true,
        connectionId: true,
        status: true,
        lastAuthorizedAt: true,
        scopes: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ connection });
  } catch (error) {
    console.error("[api/data/connections/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Status changes arrive via webhook; always serve the fresh DB value.
export const dynamic = "force-dynamic";
