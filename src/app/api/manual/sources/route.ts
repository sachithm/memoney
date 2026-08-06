import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

/**
 * GET  /api/manual/sources   — list all balance sources
 * POST /api/manual/sources   — create a new balance source
 */
export async function GET() {
  try {
    const sources = await prisma.balanceSource.findMany({
      orderBy: { name: "asc" },
    });
    return Response.json(sources);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);

    // Use upsert so duplicate names are merged, not errored
    const source = await prisma.balanceSource.upsert({
      where: { name: parsed.name },
      update: {},
      create: { name: parsed.name },
    });

    return Response.json(source, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: e.issues },
        { status: 400 },
      );
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
