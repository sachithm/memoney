import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignatureWithTimestamp } from "@/lib/truelayer";
import { z } from "zod";

// TrueLayer webhook event types we care about
const supportedEvents = new Set([
  "connection.authorized",
  "connection.failed",
  "connections.request_completed",
  "accounts.request_completed",
  "transactions.request_completed",
]);

const webhookEventSchema = z.object({
  event: z.string(),
  data: z.record(z.string(), z.unknown()),
  signature: z.string().optional(),
});

/**
 * POST /api/webhooks/truelayer
 *
 * Handles TrueLayer Data API v3 webhooks.
 * - Verifies the Webhook-Signature header (HMAC-SHA256).
 * - connection.authorized  → update Connection status to AUTHORIZED
 * - connection.failed      → update Connection status to FAILED
 * - transactions.request_completed → trigger transaction fetch
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("Webhook-Signature");

  const webhookSecret = process.env.TRUELAYER_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhooks/truelayer] WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  // Verify the webhook signature
  const isValid = verifyWebhookSignatureWithTimestamp(
    body,
    signature,
    webhookSecret,
  );

  if (!isValid) {
    console.warn("[webhooks/truelayer] Signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse the event
  let event;
  try {
    event = webhookEventSchema.parse(JSON.parse(body));
  } catch {
    console.warn("[webhooks/truelayer] Invalid JSON body");
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!supportedEvents.has(event.event)) {
    // Silently ignore unsupported events
    return NextResponse.json({ received: true });
  }

  // Route the event
  switch (event.event) {
    case "connection.authorized": {
      const connectionId = event.data.connection_id as string;
      if (connectionId) {
        await prisma.connection.updateMany({
          where: { connectionId: connectionId },
          data: {
            status: "AUTHORIZED",
            lastAuthorizedAt: new Date(),
          },
        });
      }
      break;
    }

    case "connection.failed": {
      const connectionId = event.data.connection_id as string;
      if (connectionId) {
        await prisma.connection.updateMany({
          where: { connectionId: connectionId },
          data: { status: "FAILED" },
        });
      }
      break;
    }

    case "transactions.request_completed": {
      const connectionId = event.data.connection_id as string;
      const accountId = event.data.account_id as string;
      const requestId = event.data.request_id as string;

      // Persist a refresh log entry
      if (connectionId) {
        const conn = await prisma.connection.findFirst({
          where: { connectionId: connectionId },
        });
        if (conn) {
          await prisma.refreshLog.create({
            data: {
              connectionId: conn.id,
              lastFetchAt: new Date(),
              status: "success",
              message: `Transactions request ${requestId} completed for account ${accountId}`,
            },
          });
        }
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}

export const dynamic = "force-dynamic"; // always run on the server
