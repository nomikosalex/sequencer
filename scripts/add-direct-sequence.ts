/**
 * A second sequence for targets the scraping pipeline did not find.
 *
 * The "Job search" template opens by saying the company was found by scraping
 * 7,190 job posts and came out near the top. For Unikraft that is simply untrue
 * — they run Teamtailor, which the harvest does not cover, and the role surfaced
 * from a web search instead. Sending the existing body would have shipped a
 * false claim in the second paragraph, which is the exact failure this campaign
 * has spent the day removing.
 *
 * So the provenance line comes out and the proof stays in. What is left is
 * checkable: the pipeline exists, the sequencer exists, both were built with
 * Claude Code, and the email itself is the artifact.
 *
 * Deliberately absent: "stops on reply". Inbound mail for this domain goes to
 * the registrar's forwarding and never reaches Mailgun, so automatic reply
 * detection cannot fire. Claiming it would be the same mistake in a new place.
 *
 *   npx tsx scripts/add-direct-sequence.ts            # dry run
 *   npx tsx scripts/add-direct-sequence.ts --confirm
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { renderTemplate } from "../lib/variables";
import { nextSendSlot } from "../lib/schedule";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SEQUENCE = "Direct — found off-pipeline";

const SUBJECT = "Working Student GTM Engineering — the sequencer that sent this";

const BODY = `Hi {{name}},

{{customLine}}

I'm 19, studying economics in Athens, and I've applied through your form as well. This is the part the form cannot show.

Behind it: a pipeline that scrapes ATS boards across three providers, classifies the companies and ranks them on why they are worth contacting now; and a sequencer I wrote to send from it — Next.js on Vercel, Postgres, Mailgun, per-timezone send windows, bounce handling, and a daily cap so a new domain does not burn its own reputation. Both built with Claude Code. Nobody paid me for either.

If it is useful, I will build you 25 accounts against {{company}}'s ICP before we ever speak, each with the reason to call them now and the link that proves it.

Alexandros

alexnomikos.com
linkedin.com/in/alexandrosnomikosgtm
{{githubLink}}`;

// Every clause is quoted or paraphrased from Unikraft's own posting and from
// Jérôme's profile on their careers site.
const LINE =
  "Your posting asks for someone who has been in the deep with claude code / opencode and is \"not just using LLMs in chat\". This email was sent by a sequencer I built exactly that way, and the outbound, enrichment and campaign automation you describe is the work I have been doing unpaid for months to run my own search. You also say you do not need a senior engineer, only someone comfortable writing code that runs — that is the part I would rather show than claim.";

async function main() {
  const write = process.argv.includes("--confirm");

  let seq = await prisma.sequence.findFirst({ where: { name: SEQUENCE } });
  if (!seq && write) {
    seq = await prisma.sequence.create({
      data: {
        name: SEQUENCE,
        isActive: true,
        templates: { create: [{ stepNumber: 1, delayDays: 0, subject: SUBJECT, body: BODY }] },
      },
      include: { templates: true },
    });
  }

  const contact = {
    name: "Jérôme Jaggi", email: "jerome.jaggi@unikraft.com", company: "Unikraft",
    title: "Chief of Staff", city: "Munich", timezone: "Europe/Berlin",
    customLine: LINE, leadScore: 99,
    notes:
      "Working Student GTM Engineering, EUROPE CET±2, FULLY REMOTE, 10-15h/wk, student required, no language requirement. " +
      "Jérôme is Chief of Staff responsible for Growth & Ops and his careers profile says \"I'm hiring\". " +
      "Source: careers.unikraft.com/jobs/7970623. Email verified via Clay 31/08/2026; unikraft.com is canonical (unikraft.io redirects). " +
      "Compensation is not stated in the posting — ask.",
  };

  const subject = renderTemplate(SUBJECT, contact as never);
  const body = renderTemplate(BODY, contact as never);
  const sendAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const slot = nextSendSlot(sendAt, contact.timezone);

  console.log(`sequence : ${SEQUENCE}`);
  console.log(`to       : ${contact.name} <${contact.email}> · ${contact.title}`);
  console.log(`ships    : ${slot?.toISOString() ?? "no slot"}\n`);
  console.log(`SUBJECT: ${subject}\n`);
  console.log(body);

  if (write) {
    const c = await prisma.contact.upsert({
      where: { email: contact.email }, create: contact, update: contact,
    });
    await prisma.sequenceStep.create({
      data: { contactId: c.id, sequenceId: seq!.id, stepNumber: 1, subject, body, sendAt },
    });
    console.log("\nenrolled.");
  } else {
    console.log("\nDRY RUN — pass --confirm to create the sequence and enroll.");
  }
  await prisma.$disconnect();
}

main();
