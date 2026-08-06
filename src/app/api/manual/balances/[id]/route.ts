import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  date: z.string().transform((s) => new Date(s)).optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  source: z.string().min(1).optional(),
  isLiability: z.boolean().optional(),
});

/** GET /api/manual/balances/[id] — fetch a single balance entry
 *  PUT /api/manual/balances/[id] — update a balance entry
 *  DEL /api/manual/balances/[id] — soft-delete (set deletedAt)
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const balance = await prisma.balanceEntry.findUnique({
      where: { id },
    });
    if (!balance) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(balance);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = updateSchema.parse(body);
    const balance = await prisma.balanceEntry.update({
      where: { id },
      data: parsed,
    });
    return Response.json(balance);
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.balanceEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return Response.json({ success: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
