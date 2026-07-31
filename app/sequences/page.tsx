import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SequencesPage() {
  const sequences = await prisma.sequence.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      templates: { orderBy: { stepNumber: "asc" } },
      _count: { select: { steps: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Sequences</h1>
        <Link
          href="/sequences/new"
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
        >
          New sequence
        </Link>
      </div>

      {sequences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 dark:border-white/15 px-4 py-6 text-sm text-foreground/70">
          No sequences yet.{" "}
          <Link href="/sequences/new" className="underline">
            Create your first sequence
          </Link>
          .
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sequences.map((seq) => (
            <Link
              key={seq.id}
              href={`/sequences/${seq.id}`}
              className="rounded-lg border border-black/10 dark:border-white/10 px-4 py-3 hover:bg-black/[.02] dark:hover:bg-white/[.03]"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{seq.name}</span>
                {!seq.isActive && (
                  <span className="text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5">
                    inactive
                  </span>
                )}
              </div>
              {seq.description && (
                <div className="text-sm text-foreground/60 mt-0.5">{seq.description}</div>
              )}
              <div className="text-sm text-foreground/60 mt-1">
                {seq.templates.length} step{seq.templates.length === 1 ? "" : "s"} · {seq._count.steps} enrolled step{seq._count.steps === 1 ? "" : "s"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
