import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { skipRemainingSteps } from "@/lib/sequenceControl";

// Stop one contact for good: cancel every step still queued for them and mark
// them completed. Pause holds the queue; this empties it.
//
// Uses the same helper the reply and bounce webhooks call, so "this contact is
// done" means one thing everywhere in the app.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cancelled = await skipRemainingSteps(id);

  // Leave a status that already records why the run ended (replied, bounced,
  // unsubscribed) rather than overwriting it with the blander "completed".
  const keepStatus = ["replied", "bounced", "unsubscribed"].includes(contact.status);
  const updated = keepStatus
    ? contact
    : await prisma.contact.update({ where: { id }, data: { status: "completed" } });

  return NextResponse.json({ cancelled, status: updated.status });
}
