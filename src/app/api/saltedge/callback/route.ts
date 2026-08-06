import { prisma } from "@/lib/prisma";
import {
  getConnection,
  listAccounts,
  listTransactions,
  SaltEdgeAPIError,
} from "@/lib/saltedge";
import { SaltEdgeAccount, SaltEdgeTransaction } from "@/lib/saltedge-types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { connection_id, customer_id } = body;

    if (!connection_id) {
      return Response.json(
        { error: "connection_id is required" },
        { status: 400 },
      );
    }

    // Get connection details from Salt Edge
    const seConnection = await getConnection(parseInt(connection_id));

    // Map Salt Edge status to our status enum
    const statusMap: Record<string, "PENDING" | "AUTHORIZED" | "FAILED" | "DELETED"> = {
      initiated: "PENDING",
      logging_in: "PENDING",
      authenticating: "PENDING",
      granting_access: "PENDING",
      active: "AUTHORIZED",
      inactive: "PENDING",
      inactive_due_to_consent_expired: "FAILED",
      revoked: "DELETED",
      deleted: "DELETED",
    };
    const mappedStatus = statusMap[seConnection.status] || "PENDING";

    // Update the local connection record
    await prisma.connection.updateMany({
      where: {
        connectionId: connection_id.toString(),
        source: "SALTEDGE",
      },
      data: {
        status: mappedStatus,
        lastAuthorizedAt: mappedStatus === "AUTHORIZED" ? new Date() : undefined,
      },
    });

    // If authorized, fetch accounts
    let accounts: SaltEdgeAccount[] = [];
    if (mappedStatus === "AUTHORIZED") {
      const seAccounts = await listAccounts({
        connectionId: parseInt(connection_id),
        customerId: customer_id ? parseInt(customer_id) : undefined,
      });
      const seAccountList: SaltEdgeAccount[] = seAccounts.data || [];
      accounts = seAccountList;

      // Sync accounts to our DB
      for (const acc of seAccountList) {
        await prisma.account.upsert({
          where: { id: `se-${acc.id}` },
          update: {
            name: acc.name,
            currency: acc.currency,
            balance: acc.balance ?? null,
            availableBalance: acc.balance ?? null,
            lastUpdated: new Date(),
          },
          create: {
            id: `se-${acc.id}`,
            connectionId: (
              await prisma.connection.findFirst({
                where: { connectionId: connection_id.toString() },
                select: { id: true },
              })
            )?.id || "",
            type: "ACCOUNT",
            name: acc.name,
            currency: acc.currency,
            balance: acc.balance ?? null,
            availableBalance: acc.balance ?? null,
            lastUpdated: new Date(),
          },
        });
      }

      // Fetch transactions
      const seTx = await listTransactions({
        connectionId: parseInt(connection_id),
        customerId: customer_id ? parseInt(customer_id) : undefined,
      });
      const seTransactions: SaltEdgeTransaction[] = seTx.data || [];

      // Sync transactions
      for (const tx of seTransactions) {
        const account = await prisma.account.findFirst({
          where: { id: `se-${tx.account_id}` },
        });
        if (account) {
          await prisma.transaction.upsert({
            where: { id: `se-${tx.transaction_id}` },
            update: {
              amount: tx.amount,
              description: tx.description,
            },
            create: {
              id: `se-${tx.transaction_id}`,
              accountId: account.id,
              bookedAt: new Date(tx.bank_date),
              description: tx.description,
              amount: tx.amount,
              currency: tx.currency,
            },
          });
        }
      }
    }

    return Response.json({
      connection: seConnection,
      status: mappedStatus,
      accounts,
    });
  } catch (e) {
    if (e instanceof SaltEdgeAPIError) {
      return Response.json(
        { error: e.message, status: e.status },
        { status: e.status || 500 },
      );
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
