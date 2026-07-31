import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PipelineKanban from "@/app/components/PipelineKanban";

export const dynamic = "force-dynamic";

const ACTIVITY_VERB: Record<string, string> = {
  sent: "Email sent to",
  opened: "Opened by",
  replied: "Reply from",
  failed: "Failed to send to",
};

export default async function Home() {
  const [
    totalContacts,
    activeSequences,
    sentCount,
    openedCount,
    repliedCount,
    kanbanContacts,
    recentSteps,
    sequences,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.sequence.count({ where: { isActive: true } }),
    prisma.sequenceStep.count({ where: { sentAt: { not: null } } }),
    prisma.sequenceStep.count({ where: { openedAt: { not: null } } }),
    prisma.sequenceStep.count({ where: { status: "replied" } }),
    prisma.contact.findMany({
      select: { id: true, name: true, company: true, leadScore: true, pipelineStage: true },
      orderBy: { leadScore: "desc" },
    }),
    prisma.sequenceStep.findMany({
      where: { status: { in: ["sent", "opened", "replied", "failed"] } },
      orderBy: { updatedAt: "desc" },
      take: 15,
      include: { contact: true, sequence: true },
    }),
    prisma.sequence.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        templates: { orderBy: { stepNumber: "asc" } },
        steps: true,
      },
    }),
  ]);

  const openRate = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;
  const replyRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0;

  const stats = [
    { label: "Total contacts", value: totalContacts },
    { label: "Active sequences", value: activeSequences },
    { label: "Emails sent", value: sentCount },
    { label: "Open rate", value: `${openRate}%` },
    { label: "Reply rate", value: `${replyRate}%` },
  ];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-black/10 dark:border-white/10 px-4 py-3"
          >
            <div className="text-2xl font-semibold">{stat.value}</div>
            <div className="text-sm text-foreground/60">{stat.label}</div>
          </div>
        ))}
      </div>

      {totalContacts === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 dark:border-white/15 px-4 py-6 text-sm text-foreground/70">
          No contacts yet.{" "}
          <Link href="/contacts/new" className="underline">
            Add your first contact
          </Link>{" "}
          or{" "}
          <Link href="/contacts/import" className="underline">
            import from CSV
          </Link>
          .
        </div>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide">
            Pipeline
          </h2>
          <PipelineKanban contacts={kanbanContacts} />
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide">
            Recent activity
          </h2>
          {recentSteps.length === 0 ? (
            <div className="rounded-lg border border-dashed border-black/15 dark:border-white/15 px-4 py-6 text-sm text-foreground/70">
              Nothing has happened yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {recentSteps.map((step) => (
                <li
                  key={step.id}
                  className="rounded-md border border-black/10 dark:border-white/10 px-3 py-2"
                >
                  <Link href={`/contacts/${step.contactId}`} className="hover:underline">
                    {ACTIVITY_VERB[step.status] ?? step.status} {step.contact.name} @{" "}
                    {step.contact.company}
                  </Link>
                  <div className="text-foreground/50 text-xs mt-0.5">
                    {step.sequence.name} — step {step.stepNumber}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide">
            Sequence performance
          </h2>
          {sequences.length === 0 ? (
            <div className="rounded-lg border border-dashed border-black/15 dark:border-white/15 px-4 py-6 text-sm text-foreground/70">
              No sequences yet.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sequences.map((seq) => (
                <div key={seq.id} className="rounded-lg border border-black/10 dark:border-white/10">
                  <Link
                    href={`/sequences/${seq.id}`}
                    className="block px-4 py-2 text-sm font-medium border-b border-black/10 dark:border-white/10 hover:underline"
                  >
                    {seq.name}
                  </Link>
                  <table className="w-full text-sm">
                    <thead className="text-left text-foreground/60">
                      <tr>
                        <th className="px-4 py-1.5 font-medium">Step</th>
                        <th className="px-4 py-1.5 font-medium">Sent</th>
                        <th className="px-4 py-1.5 font-medium">Opened</th>
                        <th className="px-4 py-1.5 font-medium">Replied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seq.templates.map((t) => {
                        const stepInstances = seq.steps.filter(
                          (s) => s.stepNumber === t.stepNumber
                        );
                        const sent = stepInstances.filter((s) => s.sentAt).length;
                        const opened = stepInstances.filter((s) => s.openedAt).length;
                        const replied = stepInstances.filter(
                          (s) => s.status === "replied"
                        ).length;
                        return (
                          <tr key={t.id} className="border-t border-black/10 dark:border-white/10">
                            <td className="px-4 py-1.5">Step {t.stepNumber}</td>
                            <td className="px-4 py-1.5">{sent}</td>
                            <td className="px-4 py-1.5">{opened}</td>
                            <td className="px-4 py-1.5">{replied}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
