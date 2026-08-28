import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailgun";
import { logStepSentToHubspot, setPipelineStage } from "@/lib/hubspotSync";
import { isSendingPaused } from "@/lib/sequenceControl";
import { isInSendWindow } from "@/lib/timezone";
import { isSendingDay } from "@/lib/schedule";

// Hobby plan's default/max function duration with fluid compute. Set explicitly
// (rather than relying on the platform default) so the jitter/time-budget logic
// below has a known, stable ceiling to work against.
export const maxDuration = 300;

const JITTER_MIN_MS = 5_000;
const JITTER_MAX_MS = 30_000;
// Leave headroom under maxDuration for the in-flight send/DB calls to finish
// before Vercel would kill the function mid-request.
const TIME_BUDGET_MS = 270_000;

// Volume is a deliberate policy, not a side effect of the time budget. Before
// this existed the ceiling was ~15/run purely because TIME_BUDGET_MS divided by
// average jitter happened to land there — enrolling 100 contacts would have
// drained them as fast as the function allowed.
const DAILY_SEND_LIMIT = 10;
// This route is polled hourly, so cap each run too: ten messages leaving in one
// burst at 07:00 is a machine signature, three an hour across the morning is a
// person working through their inbox.
const PER_RUN_LIMIT = 3;

const SENT_STATUSES = ["sent", "delivered", "opened", "replied"];

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

  if (await isSendingPaused()) {
    return NextResponse.json({
      checked: 0, sent: 0, failed: 0, skipped: 0, deferred: 0,
      reason: "sending globally paused",
    });
  }

  const now = new Date();

  const dueSteps = await prisma.sequenceStep.findMany({
    where: {
      status: "pending",
      sendAt: { lte: now },
      contact: { status: "active" },
      // Without this, pausing a sequence changed a badge in the UI and nothing
      // else: mail kept going out.
      sequence: { isActive: true },
    },
    include: { contact: true },
  });

  // Outside their local morning, or on a day we don't send (Sunday by
  // default), steps stay pending and untouched for a later run: no state
  // change, nothing to unwind. Both checks use the recipient's calendar, not
  // ours, so a Sunday in Athens does not silently block New York.
  const pendingSteps = dueSteps.filter(
    (step) => isInSendWindow(now, step.contact.timezone) && isSendingDay(now, step.contact.timezone)
  );
  const outsideWindow = dueSteps.length - pendingSteps.length;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  // Counted from the database, not an in-memory tally, so the daily cap holds
  // across the many invocations an hourly poll produces.
  const sentToday = await prisma.sequenceStep.count({
    where: { sentAt: { gte: startOfDay }, status: { in: SENT_STATUSES } },
  });

  const budget = Math.min(DAILY_SEND_LIMIT - sentToday, PER_RUN_LIMIT);
  if (budget <= 0) {
    return NextResponse.json({
      checked: pendingSteps.length, sent: 0, failed: 0, skipped: 0,
      deferred: pendingSteps.length, outsideWindow, sentToday,
      reason: "daily limit reached",
    });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;
  const startedAt = Date.now();

  for (let i = 0; i < pendingSteps.length; i++) {
    const step = pendingSteps[i];

    // Hit the allowance for this run — leave the rest pending.
    if (sent >= budget) {
      deferred = pendingSteps.length - i;
      break;
    }

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

  return NextResponse.json({
    checked: pendingSteps.length, sent, failed, skipped, deferred,
    outsideWindow, sentToday: sentToday + sent, dailyLimit: DAILY_SEND_LIMIT,
  });
}
