import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  date: z.string().transform((s) => new Date(s)).optional(),
  amount: z.number().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
});

/** GET /api/manual/income/[id] — fetch a single income entry
 *  PUT /api/manual/income/[id] — update an income entry
 *  DEL /api/manual/income/[id] — soft-delete
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const income = await prisma.incomeEntry.findUnique({ where: { id } });
    if (!income) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(income);
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
    const income = await prisma.incomeEntry.update({
      where: { id },
      data: parsed,
    });
    return Response.json(income);
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
    await prisma.incomeEntry.update({
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
