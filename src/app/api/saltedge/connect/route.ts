import { prisma } from "@/lib/prisma";
import { createCustomer, createConnection, SaltEdgeAPIError } from "@/lib/saltedge";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const providerCode: string = body.provider_code || body.providerCode;

    if (!providerCode) {
      return Response.json(
        { error: "provider_code or providerCode is required" },
        { status: 400 },
      );
    }

    // Find or create Salt Edge customer
    const existing = await prisma.connection.findFirst({
      where: {
        source: "SALTEDGE",
        scopes: { startsWith: "saltedge_customer:" },
      },
    });

    let customerIdNum: number;
    if (existing) {
      const match = existing.scopes.match(/saltedge_customer:(\d+)/);
      if (match) {
        customerIdNum = parseInt(match[1]);
      } else {
        const seCust = await createCustomer(`memoney-user-${Date.now()}`);
        customerIdNum = seCust.id;
      }
    } else {
      const seCust = await createCustomer(`memoney-user-${Date.now()}`);
      customerIdNum = seCust.id;
    }

    // Create connection — redirects user to bank auth
    const connection = await createConnection({
      customerId: customerIdNum,
      providerCode,
    });

    // Persist to database
    await prisma.connection.create({
      data: {
        providerId: providerCode,
        linkUri: connection.redirect_url,
        connectionId: connection.connection_id,
        status: "PENDING",
        scopes: `accounts,transactions,saltedge_customer:${customerIdNum}`,
        source: "SALTEDGE",
      },
    });

    return Response.json({
      connectionId: connection.connection_id,
      redirectUrl: connection.redirect_url,
      customerId: customerIdNum,
      providerCode,
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
