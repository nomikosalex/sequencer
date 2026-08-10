import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/variables";
import SequenceActions from "./SequenceActions";

export const dynamic = "force-dynamic";

const STEP_STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  delivered: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  opened: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  replied: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  skipped: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default async function SequenceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ previewContact?: string }>;
}) {
  const { id } = await params;
  const { previewContact } = await searchParams;

  const sequence = await prisma.sequence.findUnique({
    where: { id },
    include: {
      templates: { orderBy: { stepNumber: "asc" } },
      steps: {
        include: { contact: true },
        orderBy: [{ contactId: "asc" }, { stepNumber: "asc" }],
      },
    },
  });

  if (!sequence) notFound();

  const contacts = await prisma.contact.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, company: true, title: true },
  });

  const previewData = previewContact
    ? await prisma.contact.findUnique({ where: { id: previewContact } })
    : null;

  const enrolledByContact = new Map<
    string,
    { contact: (typeof sequence.steps)[number]["contact"]; steps: typeof sequence.steps }
  >();
  for (const step of sequence.steps) {
    const existing = enrolledByContact.get(step.contactId);
    if (existing) {
      existing.steps.push(step);
    } else {
      enrolledByContact.set(step.contactId, { contact: step.contact, steps: [step] });
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Link href="/sequences" className="text-sm text-foreground/60 hover:text-foreground">
            Sequences
          </Link>
          <span className="text-foreground/40">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">{sequence.name}</h1>
          {!sequence.isActive && (
            <span className="text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5">
              inactive
            </span>
          )}
        </div>
        {sequence.description && (
          <p className="text-sm text-foreground/70">{sequence.description}</p>
        )}
        <div className="flex items-center justify-between">
          <SequenceActions sequence={sequence} />
          <Link
            href={`/sequences/${sequence.id}/enroll`}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
          >
            Enroll contacts
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide">
          Steps
        </h2>
        <div className="flex flex-col gap-2">
          {sequence.templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-black/10 dark:border-white/10 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Step {t.stepNumber}</span>
                <span className="text-foreground/60">
                  {t.stepNumber === 1 ? `Day ${t.delayDays}` : `+${t.delayDays}d after previous`}
                </span>
              </div>
              <div className="mt-1 text-sm font-medium">{t.subject}</div>
              <div className="mt-1 text-sm text-foreground/70 whitespace-pre-wrap">{t.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide">
          Preview
        </h2>
        <form method="get" className="flex gap-2">
          <select
            name="previewContact"
            defaultValue={previewContact ?? ""}
            className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm min-w-[240px]"
          >
            <option value="">Select a contact…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.company}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Preview
          </button>
        </form>

        {previewData && (
          <div className="flex flex-col gap-2">
            {sequence.templates.map((t) => (
              <div key={t.id} className="rounded-lg border border-black/10 dark:border-white/10 p-4">
                <div className="text-sm font-medium">
                  Step {t.stepNumber}: {renderTemplate(t.subject, previewData)}
                </div>
                <div className="mt-1 text-sm text-foreground/70 whitespace-pre-wrap">
                  {renderTemplate(t.body, previewData)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide">
          Enrolled contacts
        </h2>
        {enrolledByContact.size === 0 ? (
          <div className="rounded-lg border border-dashed border-black/15 dark:border-white/15 px-4 py-6 text-sm text-foreground/70">
            No one enrolled yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-black/[.03] dark:bg-white/[.04] text-left text-foreground/60">
                <tr>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Steps</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(enrolledByContact.values()).map(({ contact, steps }) => (
                  <tr key={contact.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-4 py-2">
                      <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline">
                        {contact.name}
                      </Link>
                      <div className="text-foreground/60">{contact.company}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {steps.map((s) => (
                          <span
                            key={s.id}
                            title={`Step ${s.stepNumber}: ${s.status}`}
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STEP_STATUS_STYLES[s.status] ?? STEP_STATUS_STYLES.pending}`}
                          >
                            {s.stepNumber}: {s.status}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
