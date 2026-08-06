import { createTrading212Client, Trading212APIError } from "@/lib/trading212";

export async function GET() {
  try {
    const client = createTrading212Client();

    if (!client.isConfigured()) {
      return Response.json(
        { error: "Trading 212 API not configured" },
        { status: 501 },
      );
    }

    const account = await client.getAccountSummary();
    return Response.json(account);
  } catch (e) {
    if (e instanceof Trading212APIError) {
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
