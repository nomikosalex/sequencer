"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Emergency stop for every sequence at once. Deliberately prominent when
// engaged: the failure mode this guards against is mail going out while you
// think it has stopped.
export default function SendingSwitch({ paused }: { paused: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!paused && !confirm("Pause all sending? Nothing goes out until you resume.")) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/sending", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: !paused }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't change sending. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={busy}
        className={
          paused
            ? "rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
            : "rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06] disabled:opacity-50"
        }
      >
        {paused ? "All sending paused — Resume" : "Pause all sending"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
