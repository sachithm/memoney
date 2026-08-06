import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createConnection } from "@/lib/truelayer";
import { z } from "zod";

const connectSchema = z.object({
  providerId: z.string().optional(),
  redirectUri: z.string().optional(),
});

/**
 * POST /api/auth/connect
 *
 * Creates a TrueLayer Data API v3 connection and returns the link_uri
 * that the frontend should redirect the user to for bank selection + consent.
 *
 * The connection_id is persisted to the database. The connection is
 * finalized when TrueLayer sends the `connection.authorized` webhook.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = connectSchema.parse(body);
    const { providerId } = result;

    const scopes: ("info" | "accounts" | "transactions")[] = ["info", "accounts", "transactions"];

    // Create the connection in TrueLayer
    const tlConn = await createConnection(scopes, providerId);

    if (!tlConn.link_uri || !tlConn.connection_id) {
      return NextResponse.json(
        { error: "Failed to create TrueLayer connection" },
        { status: 502 },
      );
    }

    // Persist the connection to our database
    const record = await prisma.connection.create({
      data: {
        providerId: providerId ?? "",
        linkUri: tlConn.link_uri,
        connectionId: tlConn.connection_id,
        status: "PENDING",
        scopes: scopes.join(","),
        lastAuthorizedAt: null,
        source: "TRUELAYER",
      },
    });

    return NextResponse.json({
      linkUri: tlConn.link_uri,
      connectionId: tlConn.connection_id,
      internalId: record.id,
      redirectUri: process.env.TRUELAYER_REDIRECT_URI || null,
    });
  } catch (error) {
    console.error("[api/auth/connect]", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
