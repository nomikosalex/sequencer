/**
 * Audit the personalisation of every enrolled contact.
 *
 * The enrollment route already refuses a contact with a blank customLine, but
 * "not blank" is a much weaker promise than "specific to this company". This
 * checks the promise that actually matters, and it checks it against the
 * **frozen step body** rather than the contact record, because those two can
 * disagree: templates are rendered once at enrollment, so a customLine edited
 * afterwards leaves the queued email carrying the old text. That drift is
 * invisible in the UI, which shows the contact's current value.
 *
 *   npx tsx scripts/audit-personalisation.ts
 *
 * Read-only. Exits 1 if anything is still queued and failing, so it can gate a
 * send.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Openers that sound personal and say nothing. If a line survives with only
// these, it would read the same addressed to anyone.
const FILLER = [
  "i came across", "i stumbled upon", "i was impressed", "impressed by",
  "love what you", "big fan of", "your innovative", "exciting journey",
  "hope this finds you", "reaching out because", "caught my eye",
  "doing great things", "space is heating up", "quick question",
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const steps = await prisma.sequenceStep.findMany({
    // Not a whitelist of statuses: the send route writes "delivered", and an
    // audit that quietly skips whatever it did not anticipate is worse than no
    // audit. Exclude only what was deliberately abandoned.
    where: { status: { notIn: ["skipped", "failed"] } },
    include: {
      contact: { select: { name: true, email: true, company: true, customLine: true, status: true } },
      sequence: { select: { name: true } },
    },
    orderBy: [{ sendAt: "asc" }],
  });

  if (!steps.length) return console.log("nothing enrolled.");

  // A line reused across companies is, by definition, not about either of them.
  const lineUses = new Map<string, Set<string>>();
  for (const s of steps) {
    const k = norm(s.contact.customLine ?? "");
    if (!k) continue;
    if (!lineUses.has(k)) lineUses.set(k, new Set());
    lineUses.get(k)!.add(s.contact.company);
  }

  let failing = 0;
  const rows: string[] = [];

  for (const s of steps) {
    const c = s.contact;
    const line = (c.customLine ?? "").trim();
    const fails: string[] = [];
    const soft: string[] = [];

    if (!line) fails.push("no customLine on the contact");

    // The queued email is the source of truth for what will actually arrive.
    if (line && !s.body.includes(line))
      fails.push("DRIFT: contact edited after enrollment — queued email has the OLD line");

    if (/\{\{[^}]+\}\}/.test(s.body + s.subject))
      fails.push(`unrendered variable: ${(s.body + s.subject).match(/\{\{[^}]+\}\}/)![0]}`);

    if (line && (lineUses.get(norm(line))?.size ?? 0) > 1)
      fails.push(`line reused across ${lineUses.get(norm(line))!.size} companies`);

    // Advisory, not blocking. Good lines here spell counts out ("Four AE
    // roles") and say "you" rather than the company name, so an earlier
    // stricter version of this flagged every single line -- a check that fails
    // everything is measuring itself, not the copy. What a regex can honestly
    // confirm is that the line points at something outside the sender's head:
    // a named role, a count, a place.
    const anchored =
      line.includes(c.company.split(" ")[0]) ||
      /\d/.test(line) ||
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|dozen)\b/i.test(line) ||
      /\b(AE|SDR|BDR|RevOps|Head of|VP|Director|Manager|Engineer|Analyst|Lead)\b/.test(line);
    if (line && !anchored) soft.push("no named role, count or place — reads generic");

    const filler = FILLER.filter((f) => norm(line).includes(f));
    if (filler.length) fails.push(`filler: "${filler[0]}"`);

    if (line && line.length < 40) fails.push(`too short (${line.length} chars)`);

    const editable = s.status === "pending";
    if (fails.length && editable) failing++;

    const mark = fails.length ? (editable ? " FIX  " : " GONE ") : soft.length ? " warn " : "  ok  ";
    rows.push(
      `${mark} ${c.company.slice(0, 20).padEnd(22)}${s.status.padEnd(8)}` +
        `${s.sendAt.toISOString().slice(0, 10)}  ${c.email}`
    );
    for (const f of fails) rows.push(`         └─ ${f}`);
    for (const f of soft) rows.push(`         ·  ${f}`);
    if (line) rows.push(`         "${line.slice(0, 130)}"`);
    rows.push("");
  }

  console.log(rows.join("\n"));
  const pending = steps.filter((s) => s.status === "pending").length;
  console.log(
    `${steps.length} steps (${pending} still queued, ${steps.length - pending} already sent)\n` +
      `${failing} queued step(s) failing personalisation checks`
  );
  await prisma.$disconnect();
  if (failing) process.exit(1);
}

main();
