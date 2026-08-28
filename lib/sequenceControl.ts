import { prisma } from "@/lib/prisma";

// Shared by the Mailgun webhook (reply, bounce, complaint) and the manual Stop
// action, so "cancel the rest of this contact's run" means exactly one thing.
export async function skipRemainingSteps(contactId: string): Promise<number> {
  const result = await prisma.sequenceStep.updateMany({
    where: { contactId, status: "pending" },
    data: { status: "skipped" },
  });
  return result.count;
}

// Stop, as distinct from pause: cancels every pending step in a sequence.
// Pause (Sequence.isActive = false) holds them; this discards them.
export async function stopSequence(sequenceId: string): Promise<number> {
  const result = await prisma.sequenceStep.updateMany({
    where: { sequenceId, status: "pending" },
    data: { status: "skipped" },
  });
  return result.count;
}

const SENDING_PAUSED_KEY = "sendingPaused";

// Global kill switch. Lives in the database rather than an env var because an
// emergency stop has to take effect the moment it is flipped — a Vercel env
// change needs a redeploy, which is minutes you may not want to spend.
export async function isSendingPaused(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: SENDING_PAUSED_KEY } });
  return row?.value === "true";
}

export async function setSendingPaused(paused: boolean): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SENDING_PAUSED_KEY },
    create: { key: SENDING_PAUSED_KEY, value: String(paused) },
    update: { value: String(paused) },
  });
}
