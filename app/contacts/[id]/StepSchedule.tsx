"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Reschedules one queued email. Date only: the send route fires inside the
// recipient's 07:00-10:00 window, so offering a time would suggest a precision
// that does not exist.
export default function StepSchedule({
  stepId,
  localDate,
  timeZone,
}: {
  stepId: string;
  localDate: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState(localDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/steps/${stepId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't reschedule. Try again.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="text-xs text-foreground/60" htmlFor={`d-${stepId}`}>
        Sends on
      </label>
      <input
        id={`d-${stepId}`}
        type="date"
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          setSaved(false);
        }}
        className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-xs"
      />
      <span className="text-xs text-foreground/50">
        morning, {timeZone.replace("_", " ")}
      </span>
      {date !== localDate && (
        <button
          onClick={save}
          disabled={busy}
          className="rounded-md border border-black/10 dark:border-white/10 px-2 py-1 text-xs font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      )}
      {saved && <span className="text-xs text-green-700 dark:text-green-400">Rescheduled</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
