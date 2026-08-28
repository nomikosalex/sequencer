import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stopSequence } from "@/lib/sequenceControl";

// Stop, as opposed to pause. Pause (PATCH isActive:false) holds pending steps
// so they resume where they left off; this cancels them outright and also
// deactivates the sequence so nothing new fires.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sequence = await prisma.sequence.findUnique({ where: { id } });
  if (!sequence) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cancelled = await stopSequence(id);
  await prisma.sequence.update({ where: { id }, data: { isActive: false } });

  return NextResponse.json({ cancelled });
}
