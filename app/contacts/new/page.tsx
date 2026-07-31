"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewContactPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      company: form.get("company"),
      title: form.get("title") || undefined,
      linkedinUrl: form.get("linkedinUrl") || undefined,
      leadScore: form.get("leadScore") ? Number(form.get("leadScore")) : 0,
      notes: form.get("notes") || undefined,
    };

    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }

    const contact = await res.json();
    router.push(`/contacts/${contact.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div className="flex items-center gap-2">
        <Link href="/contacts" className="text-sm text-foreground/60 hover:text-foreground">
          Contacts
        </Link>
        <span className="text-foreground/40">/</span>
        <h1 className="text-2xl font-semibold tracking-tight">Add contact</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-md bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <Field label="Name" name="name" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Company" name="company" required />
        <Field label="Title" name="title" placeholder="e.g. Head of Growth" />
        <Field label="LinkedIn URL" name="linkedinUrl" type="url" />
        <Field label="Lead score" name="leadScore" type="number" defaultValue="0" />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save contact"}
          </button>
          <Link
            href="/contacts"
            className="rounded-md border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" htmlFor={name}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
      />
    </div>
  );
}
