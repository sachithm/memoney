import { listAccounts, SaltEdgeAPIError } from "@/lib/saltedge";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const connectionId = url.searchParams.get("connectionId");
    const customerId = url.searchParams.get("customerId");

    if (!connectionId) {
      return Response.json(
        { error: "connectionId query parameter is required" },
        { status: 400 },
      );
    }

    const accounts = await listAccounts({
      connectionId: parseInt(connectionId),
      customerId: customerId ? parseInt(customerId) : undefined,
    });

    return Response.json(accounts.data || []);
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
