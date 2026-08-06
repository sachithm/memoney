import { listProviders, SaltEdgeAPIError } from "@/lib/saltedge";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const country = url.searchParams.get("country") || undefined;

    // If no country specified, return UK providers (for UK open banking)
    const providers = await listProviders(country || "GB");
    return Response.json(providers);
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
