import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const ATHENS = "Europe/Athens";
function fmtAthens(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ATHENS,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}

async function main() {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 3600_000);

  // 1. Sent in last 24h (sentAt in window) — join contact/sequence for company name
  const sentRecently = await prisma.sequenceStep.findMany({
    where: { sentAt: { gte: since } },
    include: { contact: true },
    orderBy: { sentAt: "desc" },
  });

  // Steps that were SCHEDULED (sendAt) in the last 24h window, regardless of current status
  const scheduledInWindow = await prisma.sequenceStep.findMany({
    where: { sendAt: { gte: since, lte: now } },
    include: { contact: true },
    orderBy: { sendAt: "desc" },
  });
  const stillPendingFromWindow = scheduledInWindow.filter((s) => s.status === "pending");

  // 2. Bounce rate: failed / total with sentAt (all-time, and also last 24h)
  const totalWithSentAt = await prisma.sequenceStep.count({ where: { sentAt: { not: null } } });
  const totalFailed = await prisma.sequenceStep.count({ where: { status: "failed" } });
  const failedWithSentAt = await prisma.sequenceStep.count({ where: { status: "failed", sentAt: { not: null } } });
  // failed steps overall (some failed steps may not have sentAt set)
  const totalAttempted = totalWithSentAt + totalFailed; // sentAt-null failures + sentAt successes

  // 3. Replies
  const repliedSteps = await prisma.sequenceStep.findMany({
    where: { status: "replied" },
    include: { contact: true },
  });
  const repliedContacts = await prisma.contact.findMany({ where: { status: "replied" } });

  // 4. Still queued
  const queuedCount = await prisma.sequenceStep.count({ where: { status: "pending" } });
  const nextTwo = await prisma.sequenceStep.findMany({
    where: { status: "pending" },
    include: { contact: true },
    orderBy: { sendAt: "asc" },
    take: 2,
  });

  // Diagnostics for flagging
  const pausedSetting = await prisma.appSetting.findUnique({ where: { key: "sendingPaused" } });
  const inactiveSequences = await prisma.sequence.count({ where: { isActive: false } });
  const totalSequences = await prisma.sequence.count();

  const out: any = {
    now: now.toISOString(),
    sentRecently: sentRecently.map((s) => ({
      company: s.contact.company,
      email: s.contact.email,
      status: s.status,
      sentAtAthens: fmtAthens(s.sentAt),
      timezone: s.contact.timezone,
    })),
    scheduledInWindowCount: scheduledInWindow.length,
    stillPendingFromWindow: stillPendingFromWindow.map((s) => ({
      company: s.contact.company,
      email: s.contact.email,
      sendAtAthens: fmtAthens(s.sendAt),
      contactTimezone: s.contact.timezone,
      contactCity: s.contact.city,
      contactStatus: s.contact.status,
    })),
    bounce: {
      totalWithSentAt,
      totalFailed,
      failedWithSentAt,
      totalAttempted,
      rateOverSentAt: totalWithSentAt > 0 ? (failedWithSentAt / totalWithSentAt) : null,
      rateOverAttempted: totalAttempted > 0 ? (totalFailed / totalAttempted) : null,
    },
    replies: {
      repliedStepsCount: repliedSteps.length,
      repliedSteps: repliedSteps.map((s) => ({ company: s.contact.company, email: s.contact.email, repliedAtAthens: fmtAthens(s.repliedAt) })),
      repliedContactsCount: repliedContacts.length,
    },
    queued: {
      count: queuedCount,
      nextTwo: nextTwo.map((s) => ({
        company: s.contact.company,
        email: s.contact.email,
        sendAtAthens: fmtAthens(s.sendAt),
        contactTimezone: s.contact.timezone,
      })),
    },
    diagnostics: {
      sendingPaused: pausedSetting?.value ?? null,
      inactiveSequences,
      totalSequences,
    },
  };

  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
