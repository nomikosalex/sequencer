/**
 * Delete every pending sequence step.
 *
 * Templates are rendered once at enrollment and frozen into the step rows, so a
 * template fix does not repair steps that are already queued. This clears them
 * so you can correct the template and re-enroll.
 *
 *   npx tsx scripts/reset-pending.ts            # dry run — counts only
 *   npx tsx scripts/reset-pending.ts --confirm  # actually deletes
 *
 * Only touches status = "pending". Sent, replied and skipped history is left
 * alone.
 */
// dotenv first: this runs outside Next.js, which would otherwise load .env for us.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Same driver-adapter setup as lib/prisma.ts — Prisma 7 refuses to connect
// without one.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const confirmed = process.argv.includes("--confirm");

  const pending = await prisma.sequenceStep.findMany({
    where: { status: "pending" },
    include: { contact: { select: { email: true, name: true } } },
  });

  if (pending.length === 0) {
    console.log("No pending steps. Nothing to do.");
    return;
  }

  console.log(`${pending.length} pending step(s) queued:\n`);
  for (const step of pending.slice(0, 20)) {
    console.log(
      `  step ${step.stepNumber}  ${step.contact.email.padEnd(34)} "${step.subject.slice(0, 52)}"`
    );
  }
  if (pending.length > 20) console.log(`  ... and ${pending.length - 20} more`);

  if (!confirmed) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --confirm to delete.");
    return;
  }

  const { count } = await prisma.sequenceStep.deleteMany({ where: { status: "pending" } });
  console.log(`\nDeleted ${count} pending step(s).`);
  console.log("Now fix the template in the UI and re-enroll.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
