import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailgun";
import { logStepSentToHubspot, setPipelineStage } from "@/lib/hubspotSync";

// Hobby plan's default/max function duration with fluid compute. Set explicitly
// (rather than relying on the platform default) so the jitter/time-budget logic
// below has a known, stable ceiling to work against.
export const maxDuration = 300;

const JITTER_MIN_MS = 5_000;
const JITTER_MAX_MS = 30_000;
// Leave headroom under maxDuration for the in-flight send/DB calls to finish
// before Vercel would kill the function mid-request.
const TIME_BUDGET_MS = 270_000;

function randomJitterMs(): number {
  return JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pendingSteps = await prisma.sequenceStep.findMany({
    where: {
      status: "pending",
      sendAt: { lte: new Date() },
      contact: { status: "active" },
    },
    include: { contact: true },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;
  const startedAt = Date.now();

  for (let i = 0; i < pendingSteps.length; i++) {
    const step = pendingSteps[i];

    // Ran out of time budget for this invocation — leave the rest as
    // "pending" (untouched, still claimable) for tomorrow's cron run
    // rather than risk Vercel killing the function mid-send.
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      deferred = pendingSteps.length - i;
      break;
    }

    // Space out sends so a batch doesn't fire in a multi-second burst —
    // bursty sending from a low-reputation/new domain is a spam signal.
    // No jitter before the first send in a batch; nothing to space it from.
    if (i > 0) {
      await sleep(randomJitterMs());
    }

    // Atomically claim the step before sending, so a duplicate cron
    // invocation (Vercel cron delivery is best-effort, not exactly-once)
    // can't email the same person twice.
    const claim = await prisma.sequenceStep.updateMany({
      where: { id: step.id, status: "pending" },
      data: { status: "sending" },
    });
    if (claim.count === 0) {
      skipped++;
      continue;
    }

    try {
      const result = await sendEmail({
        to: step.contact.email,
        subject: step.subject,
        text: step.body,
      });

      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { status: "sent", sentAt: new Date(), mailgunId: result.id },
      });
      await logStepSentToHubspot(step, step.contact);
      if (step.contact.pipelineStage === "target") {
        await setPipelineStage(step.contact.id, "contacted");
      }
      sent++;
    } catch {
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { status: "failed" },
      });
      failed++;
    }
  }

  return NextResponse.json({ checked: pendingSteps.length, sent, failed, skipped, deferred });
}
