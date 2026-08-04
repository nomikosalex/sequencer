"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type StepDraft = {
  delayDays: number;
  subject: string;
  body: string;
};

const EMPTY_STEP: StepDraft = { delayDays: 0, subject: "", body: "" };

export default function NewSequencePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([{ ...EMPTY_STEP }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, { ...EMPTY_STEP, delayDays: 3 }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (steps.length === 0) {
      setError("Add at least one step");
      return;
    }
    if (steps.some((s) => !s.subject || !s.body)) {
      setError("Every step needs a subject and body");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        templates: steps.map((s) => ({
          delayDays: s.delayDays,
          subject: s.subject,
          body: s.body,
        })),
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }

    const sequence = await res.json();
    router.push(`/sequences/${sequence.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href="/sequences" className="text-sm text-foreground/60 hover:text-foreground">
          Sequences
        </Link>
        <span className="text-foreground/40">/</span>
        <h1 className="text-2xl font-semibold tracking-tight">New sequence</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && (
          <div className="rounded-md bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="name">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="description">
            Description
          </label>
          <input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide">
              Steps
            </h2>
            <span className="text-xs text-foreground/50">
              Variables: {"{{name}} {{fullName}} {{company}} {{title}} {{customLine}} {{portfolioLink}} {{githubLink}}"}
            </span>
          </div>

          {steps.map((step, i) => (
            <div key={i} className="rounded-lg border border-black/10 dark:border-white/10 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Step {i + 1}</span>
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">
                  Delay (days {i === 0 ? "after enrollment" : "after previous step"})
                </label>
                <input
                  type="number"
                  min={0}
                  value={step.delayDays}
                  onChange={(e) => updateStep(i, { delayDays: Number(e.target.value) })}
                  className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm w-32"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Subject</label>
                <input
                  value={step.subject}
                  onChange={(e) => updateStep(i, { subject: e.target.value })}
                  className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Body</label>
                <textarea
                  rows={6}
                  value={step.body}
                  onChange={(e) => updateStep(i, { body: e.target.value })}
                  className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm font-mono"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addStep}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06] w-fit"
          >
            + Add step
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Create sequence"}
          </button>
          <Link
            href="/sequences"
            className="rounded-md border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
