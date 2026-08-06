import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getConnectedAccounts,
  requestTransactions,
  getConnectionStatus,
  TrueLayerAPIError,
} from "@/lib/truelayer";
import { z } from "zod";

const refreshSchema = z.object({
  connectionId: z.string(),
});

/**
 * POST /api/data/refresh
 *
 * Triggers a refresh of account + transaction data from TrueLayer
 * for a given internal connection id. This is called:
 * - manually (user clicks "Refresh")
 * - via cron (Phase 2 background job)
 *
 * Steps:
 *   1. Check connection status with TrueLayer
 *   2. Fetch connected accounts → upsert into Account table
 *   3. For each account, request transactions → poll → store results
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { connectionId } = refreshSchema.parse(body);

    // Look up the connection in our DB
    const conn = await prisma.connection.findFirst({
      where: { id: connectionId },
    });

    if (!conn) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    if (!conn.connectionId) {
      return NextResponse.json(
        { error: "Connection not yet authorized" },
        { status: 409 },
      );
    }

    // 1. Check connection status
    let status;
    try {
      status = await getConnectionStatus(conn.connectionId);
    } catch (error) {
      if (error instanceof TrueLayerAPIError) {
        console.warn("[api/data/refresh] Connection status check failed:", error.status, error.message);
        return NextResponse.json(
          { error: `TrueLayer API error: ${error.message}` },
          { status: 502 },
        );
      }
      throw error;
    }

    await prisma.connection.update({
      where: { id: conn.id },
      data: {
        status: status.status === "authorized" ? "AUTHORIZED" : conn.status,
        lastAuthorizedAt: status.status === "authorized" && !conn.lastAuthorizedAt
          ? new Date()
          : conn.lastAuthorizedAt,
      },
    });

    if (status.status !== "authorized") {
      return NextResponse.json({
        message: `Connection status: ${status.status}`,
        updated: false,
      });
    }

    // 2. Fetch connected accounts
    const accountsData = await getConnectedAccounts(conn.connectionId);

    let accountsUpserted = 0;
    const tlAccountIds: string[] = [];

    for (const tlAccount of accountsData.items) {
      tlAccountIds.push(tlAccount.account_id);

      // Map account type
      const accountType = (tlAccount.account_type === "card" ? "CARD" : "ACCOUNT") as "ACCOUNT" | "CARD";

      // Both account types expose balance/available_balance in the TrueLayer response
      const balance = tlAccount.balance?.amount;
      const availableBalance = tlAccount.available_balance?.amount;

      const accountData = {
        type: accountType,
        name: tlAccount.account_name,
        currency: tlAccount.currency,
        iban: tlAccount.iban,
        sortCode: tlAccount.sort_code,
        accountNumber: tlAccount.account_number,
        balance,
        availableBalance,
        lastUpdated: new Date(),
      };

      await prisma.account.upsert({
        where: { id: tlAccount.account_id },
        update: accountData,
        create: {
          id: tlAccount.account_id,
          connectionId: conn.id,
          ...accountData,
        },
      });
      accountsUpserted++;
    }

    // 3. Request transactions for each account
    for (const accountId of tlAccountIds) {
      try {
        await requestTransactions(conn.connectionId, accountId);
      } catch (error) {
        console.warn(
          `[api/data/refresh] Failed to request transactions for account ${accountId}:`,
          error,
        );
      }
    }

    return NextResponse.json({
      message: "Refresh initiated",
      updated: true,
      accountsUpserted,
      transactionsRequestedFor: tlAccountIds.length,
      note: "Transactions are fetched asynchronously via webhook. Check back later.",
    });
  } catch (error) {
    console.error("[api/data/refresh]", error);

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

export const dynamic = "force-dynamic";
