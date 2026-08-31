/**
 * Apply the verified outreach lines to contacts *and* to their queued emails.
 *
 * Updating `contact.customLine` alone would change nothing that ships: the
 * template is rendered once at enrollment and frozen into the step row, so the
 * queued email keeps the old text while the UI shows the new one. That silent
 * disagreement is exactly what the personalisation audit was built to catch, so
 * this re-renders the pending step from the sequence template in place. Send
 * dates are untouched, which is why this is preferable to deleting and
 * re-enrolling.
 *
 *   npx tsx scripts/apply-verified-lines.ts            # dry run
 *   npx tsx scripts/apply-verified-lines.ts --confirm  # write
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { renderTemplate } from "../lib/variables";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Every claim below is sourced in data/out/34_evidence.json.
const LINES: Record<string, string> = {
  PermitFlow:
    "Nine GTM roles open at once — three Enterprise AE seats, two Enterprise Sales Managers, and a Commercial Sales Manager. Selling permitting to general contractors means your target list is developers and GCs ranked by permit volume, which is not a filter you get from a standard database.",
  Legora:
    "Twenty-three Account Executive roles open across twelve cities — Stockholm, Paris, Munich, Milan, New York, Denver, Sydney, Toronto — with one GTM Senior Systems Analyst behind all of it. Every one of those markets is a different set of firms, and that arithmetic stops working somewhere around city four.",
  HackerRank:
    "You have a Senior Talent Acquisition Partner dedicated to GTM and a Sales Operations Analyst open at the same time — hiring the reps and the person who measures them together. Selling developer assessment means your buyer is the engineering org, not the recruiting budget it sits in, and that distinction is what makes the target list hard.",
  Replit:
    "A Software Engineer on Growth and another on Growth Infrastructure, alongside Enterprise Account Managers in Foster City, New York and London. Staffing growth as engineering rather than headcount is the rarer choice, and it is the one that decides whether the enterprise motion gets a pipeline built or bought.",
  SigNoz:
    "A Founding SDR Lead for the US market, based in India, alongside an AI GTM Engineer and a Head of Demand Gen. Selling an open-source Datadog alternative means your buyer is already running OpenTelemetry and already paying someone else — that is a technographic list, not a firmographic one, and it is the kind you build rather than buy.",
  Popl:
    "A Head of Revenue Operations and a Senior Account Executive, out of six open roles total — a deliberate pair rather than a hiring wave. And whoever takes the RevOps seat has to run the motion your own product sells: your buyers are the field marketing teams working a conference floor, which is a list built from event calendars, not from a database.",
  "Solve Intelligence":
    "Two of your three GTM openings have GTM bolted onto the title, which usually means the roles are not carved up yet and whoever joins gets to shape them. Selling patent drafting software also means your list is IP firms and in-house patent counsel — findable in filing data, not in a company database — and that is the part I would want to build.",
  Sendbird:
    "A Head of Marketing Operations at director level next to a single SDR, out of ten open roles — you are rebuilding the engine before adding people to it, which is the right order and the rarer one. Selling an enterprise CX platform also means the buyer is defined by conversation volume rather than headcount, and that is a technographic list.",
  Garage:
    "Nine of your sixteen open roles are GTM, and a marketplace means two lists at once — the fire departments and municipalities buying, and the fleets selling. You already put a Software Engineer on Growth, so you know the answer is not more people doing manual research across fifty states of local government.",
};

// The board we scraped for this contact belongs to a different company.
const PULL = "Weave";

// India-based founder; the contact was left on the US default, which put the
// send at 19:30 local and defeated the whole point of timezone scheduling.
const TIMEZONE: Record<string, string> = { SigNoz: "Asia/Kolkata" };

async function main() {
  const write = process.argv.includes("--confirm");
  const seq = await prisma.sequence.findFirst({ include: { templates: true } });
  const tpl = seq!.templates.find((t) => t.stepNumber === 1)!;

  for (const [company, line] of Object.entries(LINES)) {
    const c = await prisma.contact.findFirst({ where: { company } });
    if (!c) { console.log(`  ${company}: NOT FOUND`); continue; }

    const next = { ...c, customLine: line, timezone: TIMEZONE[company] ?? c.timezone };
    const body = renderTemplate(tpl.body, next);
    const subject = renderTemplate(tpl.subject, next);

    if (write) {
      await prisma.contact.update({
        where: { id: c.id },
        data: { customLine: line, ...(TIMEZONE[company] ? { timezone: TIMEZONE[company] } : {}) },
      });
      await prisma.sequenceStep.updateMany({
        where: { contactId: c.id, status: "pending" },
        data: { subject, body },
      });
    }
    const tz = TIMEZONE[company] ? `  tz -> ${TIMEZONE[company]}` : "";
    console.log(`  ${write ? "updated" : "would update"} ${company}${tz}`);
  }

  const w = await prisma.contact.findFirst({ where: { company: PULL } });
  if (w) {
    if (write) {
      await prisma.sequenceStep.deleteMany({ where: { contactId: w.id, status: "pending" } });
      await prisma.contact.update({
        where: { id: w.id },
        data: {
          status: "completed",
          notes: "Pulled 31/08/2026: the greenhouse/weave board belongs to a pharma AI company, not weaveos.com. No verified hiring signal for this contact.",
        },
      });
    }
    console.log(`  ${write ? "pulled" : "would pull"} ${PULL} (${w.email})`);
  }

  const pending = await prisma.sequenceStep.count({ where: { status: "pending" } });
  const active = await prisma.contact.count({ where: { status: "active" } });
  console.log(`\n${write ? "" : "DRY RUN — nothing written. "}pending steps: ${pending}   active contacts: ${active}`);
  await prisma.$disconnect();
}

main();
