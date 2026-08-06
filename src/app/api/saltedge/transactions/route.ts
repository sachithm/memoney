import { listTransactions, SaltEdgeAPIError } from "@/lib/saltedge";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const connectionId = url.searchParams.get("connectionId");
    const customerId = url.searchParams.get("customerId");
    const accountId = url.searchParams.get("accountId");
    const dateStart = url.searchParams.get("dateStart") || undefined;
    const dateEnd = url.searchParams.get("dateEnd") || undefined;

    if (!connectionId) {
      return Response.json(
        { error: "connectionId query parameter is required" },
        { status: 400 },
      );
    }

    const transactions = await listTransactions({
      connectionId: parseInt(connectionId),
      accountId: accountId ? parseInt(accountId) : undefined,
      customerId: customerId ? parseInt(customerId) : undefined,
      dateStart,
      dateEnd,
    });

    return Response.json(transactions.data || []);
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
