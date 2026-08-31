import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { nextSendSlot } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// The dashboard answers "how many"; this answers "what exactly went out, to
// whom, and when". Those are different questions, and the second one is the
// only way to catch a wrong claim before the recipient does — the body shown
// here is the frozen copy the send route will hand to Mailgun, not a
// re-render, so what appears below is literally what lands.

const STATUS_STYLES: Record<string, string> = {
  delivered: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  sent: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  opened: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  replied: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  bounced: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  skipped: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function Badge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.skipped;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

function when(d: Date, timeZone: string | null) {
  const tz = timeZone || "Europe/Athens";
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return `${local} ${tz.split("/")[1]?.replace("_", " ") ?? tz}`;
}

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;

  const steps = await prisma.sequenceStep.findMany({
    where: show === "queued" ? { status: "pending" }
         : show === "sent" ? { sentAt: { not: null } }
         : {},
    include: {
      contact: { select: { id: true, name: true, email: true, company: true, timezone: true } },
      sequence: { select: { name: true } },
    },
    orderBy: [{ sentAt: "desc" }, { sendAt: "asc" }],
  });

  const sent = steps.filter((s) => s.sentAt);
  const queued = steps.filter((s) => s.status === "pending");

  const paused = await prisma.appSetting.findUnique({ where: { key: "sendingPaused" } });
  const isPaused = paused?.value === "true";

  const tabs = [
    { key: undefined, label: `All (${steps.length})` },
    { key: "sent", label: `Sent (${sent.length})` },
    { key: "queued", label: `Queued (${queued.length})` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Outbox</h1>
          <p className="text-sm text-foreground/60 mt-1">
            Every email this sequencer has sent or is holding, with the exact text.
          </p>
        </div>
        {isPaused && (
          <span className="rounded-md bg-amber-100 dark:bg-amber-900/40 px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">
            Sending is paused — nothing will go out
          </span>
        )}
      </div>

      <div className="flex gap-1 border-b border-black/[.08] dark:border-white/[.12]">
        {tabs.map((t) => {
          const active = show === t.key || (!show && !t.key);
          return (
            <Link
              key={t.label}
              href={t.key ? `/outbox?show=${t.key}` : "/outbox"}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-foreground/60 hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {steps.length === 0 && (
        <p className="text-sm text-foreground/60 py-8">Nothing here yet.</p>
      )}

      <div className="space-y-2">
        {steps.map((s) => {
          // Not the raw sendAt: that is only the earliest it becomes eligible.
          const slot = s.status === "pending"
            ? nextSendSlot(s.sendAt, s.contact.timezone)
            : null;
          return (
            <details
              key={s.id}
              className="group rounded-lg border border-black/[.08] dark:border-white/[.12] bg-background"
            >
              <summary className="cursor-pointer list-none px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-foreground/40 text-xs group-open:rotate-90 transition-transform">
                  ▶
                </span>
                <Badge status={s.status} />
                <Link
                  href={`/contacts/${s.contact.id}`}
                  className="font-medium hover:underline"
                >
                  {s.contact.company}
                </Link>
                <span className="text-sm text-foreground/60">
                  {s.contact.name} &lt;{s.contact.email}&gt;
                </span>
                <span className="ml-auto text-xs text-foreground/50 tabular-nums">
                  {s.sentAt
                    ? `sent ${when(s.sentAt, s.contact.timezone)}`
                    : slot
                      ? `sends ${when(slot, s.contact.timezone)}`
                      : "no send slot fits — check the cron schedule"}
                </span>
              </summary>

              <div className="border-t border-black/[.08] dark:border-white/[.12] px-4 py-3 space-y-3">
                <div className="text-sm">
                  <span className="text-foreground/50">Subject: </span>
                  <span className="font-medium">{s.subject}</span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90 bg-black/[.02] dark:bg-white/[.03] rounded-md p-3 overflow-x-auto">
                  {s.body}
                </pre>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground/50 tabular-nums">
                  <span>Sequence: {s.sequence.name} · step {s.stepNumber}</span>
                  {s.sentAt && <span>Sent {s.sentAt.toISOString().replace("T", " ").slice(0, 16)} UTC</span>}
                  {!s.sentAt && (
                    <span>
                      Eligible from {s.sendAt.toISOString().replace("T", " ").slice(0, 16)} UTC
                      {slot && ` · ships ${slot.toISOString().replace("T", " ").slice(0, 16)} UTC`}
                    </span>
                  )}
                  {s.repliedAt && <span>Replied {s.repliedAt.toISOString().slice(0, 10)}</span>}
                  {s.mailgunId && <span className="break-all">Mailgun {s.mailgunId.slice(0, 28)}</span>}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
