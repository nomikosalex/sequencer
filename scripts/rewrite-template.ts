/**
 * Rewrite the step-1 template, then re-render every queued email from it.
 *
 * Two changes. The body was roughly six-sevenths autobiography -- the pipeline,
 * the sequencer, the age, the study -- around a single sentence about the
 * reader, and it closed by *offering* to do work rather than naming what would
 * be delivered. The rewrite keeps the proof of work, because that is the point
 * of writing at all, but spends fewer words on it and makes the ask concrete.
 *
 * It also fixes a claim that has shipped in every email so far: "four ATS
 * providers". The harvest resolved companies on three (greenhouse, ashby,
 * lever). Workable was attempted and matched nothing in this dataset. The count
 * of postings, 7,190, is correct.
 *
 * Claims left in the body are ones that can be checked: the posting count, the
 * timezone hold (visible in the header timestamp), and bounce-not-open
 * reporting. The earlier draft said the sequencer "stops itself if you reply" --
 * cut, because inbound mail does not reach Mailgun, so that is not yet true.
 *
 *   npx tsx scripts/rewrite-template.ts            # dry run, prints the email
 *   npx tsx scripts/rewrite-template.ts --confirm  # write + re-render queue
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { renderTemplate } from "../lib/variables";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SUBJECT = "I found {{company}} by scraping 7,190 job posts";

const BODY = `Hi {{name}},

{{customLine}}

I found you by scraping 7,190 live job posts across three ATS providers, then ranking companies by what their postings say about where the pipeline is about to strain. {{company}} came out near the top.

This email was sent by a sequencer I built. It held the message until morning where you are rather than where I am, and it reports bounces instead of opens, because plain text cannot carry a tracking pixel.

I'm 19, studying economics in Athens, and I'm applying through your board. Neither of those shows up on a CV, which is why I am writing as well.

If it is useful, I will build you 25 accounts against your own ICP before we ever speak, each with the reason to call them now and the link that proves it. You would be judging output rather than a pitch.

Alexandros

alexnomikos.com
linkedin.com/in/alexandrosnomikosgtm
{{githubLink}}`;

async function main() {
  const write = process.argv.includes("--confirm");
  const seq = await prisma.sequence.findFirst({ include: { templates: true } });
  const tpl = seq!.templates.find((t) => t.stepNumber === 1)!;

  if (write) {
    await prisma.sequenceTemplate.update({
      where: { id: tpl.id },
      data: { subject: SUBJECT, body: BODY },
    });
  }

  // Queued bodies are frozen copies, so the template edit alone would change
  // nothing that ships. Re-render each from the contact it belongs to.
  const steps = await prisma.sequenceStep.findMany({
    where: { status: "pending" },
    include: { contact: true },
  });
  for (const s of steps) {
    if (write) {
      await prisma.sequenceStep.update({
        where: { id: s.id },
        data: {
          subject: renderTemplate(SUBJECT, s.contact),
          body: renderTemplate(BODY, s.contact),
        },
      });
    }
  }

  const sample = steps[0];
  if (sample) {
    console.log("─".repeat(76));
    console.log(`To: ${sample.contact.name} <${sample.contact.email}>`);
    console.log(`Subject: ${renderTemplate(SUBJECT, sample.contact)}`);
    console.log("─".repeat(76));
    console.log(renderTemplate(BODY, sample.contact));
    console.log("─".repeat(76));
  }
  const words = BODY.split(/\s+/).length;
  console.log(`\n${write ? "written" : "DRY RUN"} — template ${words} words + custom line`);
  console.log(`${write ? "re-rendered" : "would re-render"} ${steps.length} queued emails`);
  await prisma.$disconnect();
}

main();
