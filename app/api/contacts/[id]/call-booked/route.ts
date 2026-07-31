import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setPipelineStage } from "@/lib/hubspotSync";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await setPipelineStage(id, "call_booked");

  return NextResponse.json({ ok: true });
}
