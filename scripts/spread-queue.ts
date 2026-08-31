/**
 * Even out the send queue so no single day carries a spike.
 *
 * The queue had eight due on one morning and then 4/1/2/1 — sixteen emails
 * over five days, which averages a perfectly safe 3.2/day but arrives as a
 * lump. The domain has sent 4 emails in 3 days, so that first morning was a
 * sixfold jump in rate on a sender with no reply history to vouch for it.
 *
 * Two things change here. The route's daily cap now sits at 4, which is the
 * real guard. This spreads `sendAt` to match, so the Outbox shows what will
 * actually happen instead of a date the cap will silently override.
 *
 * Within a day, contacts are dealt out across timezones rather than grouped,
 * so a single cron run never carries the whole day's volume.
 *
 *   npx tsx scripts/spread-queue.ts            # dry run
 *   npx tsx scripts/spread-queue.ts --confirm
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { nextSendSlot, isSendingDay } from "../lib/schedule";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PER_DAY = 4;

async function main() {
  const write = process.argv.includes("--confirm");
  const steps = await prisma.sequenceStep.findMany({
    where: { status: "pending" },
    include: { contact: { select: { company: true, timezone: true, leadScore: true } } },
    // Lead score first: spreading by date alone pushed the best-fit target
    // (Unikraft, 99) to the third day behind weaker ones that happened to be
    // enrolled earlier. The queue should drain in the order the targets matter.
    orderBy: [{ contact: { leadScore: "desc" } }, { sendAt: "asc" }],
  });

  // Deal round-robin across timezones so each day gets a mix, not a cluster
  // that all lands in the same cron run.
  const byZone = new Map<string, typeof steps>();
  for (const s of steps) {
    const z = s.contact.timezone || "Europe/Athens";
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z)!.push(s);
  }
  const queues = [...byZone.values()];
  for (const q of queues) q.sort((a, b) => b.contact.leadScore - a.contact.leadScore);
  const dealt: typeof steps = [];
  while (dealt.length < steps.length) {
    for (const q of queues) {
      const next = q.shift();
      if (next) dealt.push(next);
    }
  }

  // Walk forward from tomorrow, skipping non-sending days.
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 1);
  day.setUTCHours(0, 0, 0, 0);
  const plan: { step: (typeof steps)[number]; at: Date }[] = [];
  let i = 0;
  while (i < dealt.length) {
    if (!isSendingDay(day, null)) {
      day.setUTCDate(day.getUTCDate() + 1);
      continue;
    }
    for (let n = 0; n < PER_DAY && i < dealt.length; n++, i++) {
      plan.push({ step: dealt[i], at: new Date(day) });
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }

  // A day's four can still collide in one cron run: every US contact's morning
  // window contains exactly one cron, so they all resolve to the same slot and
  // the fourth would silently roll to the next day while the Outbox claimed
  // otherwise. Push overflow forward a day until every run is within the cap.
  const PER_RUN = 3;
  for (let pass = 0; pass < 12; pass++) {
    const runs = new Map<string, typeof plan>();
    for (const item of plan) {
      const slot = nextSendSlot(item.at, item.step.contact.timezone);
      const key = (slot ?? item.at).toISOString();
      if (!runs.has(key)) runs.set(key, []);
      runs.get(key)!.push(item);
    }
    let moved = 0;
    for (const group of runs.values()) {
      for (const item of group.slice(PER_RUN)) {
        do {
          item.at = new Date(item.at.getTime() + 86400000);
        } while (!isSendingDay(item.at, null));
        moved++;
      }
    }
    if (!moved) break;
  }

  const byDay = new Map<string, string[]>();
  for (const { step, at } of plan) {
    const slot = nextSendSlot(at, step.contact.timezone);
    const key = (slot ?? at).toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(
      `${step.contact.company}${slot ? ` (${slot.toISOString().slice(11, 16)}Z)` : ""}`);
    if (write) {
      await prisma.sequenceStep.update({ where: { id: step.id }, data: { sendAt: at } });
    }
  }

  for (const [d, v] of [...byDay].sort()) {
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d).getUTCDay()];
    console.log(`  ${d} ${wd}  ${"█".repeat(v.length)} ${v.length}  ${v.join(", ")}`);
  }
  console.log(`\n${write ? "rescheduled" : "DRY RUN —"} ${plan.length} steps at ${PER_DAY}/day`);
  await prisma.$disconnect();
}

main();
