"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { csvToContactRows, type ParsedContactRow } from "@/lib/csv";

type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; email?: string; message: string }[];
};

export default function ImportContactsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedContactRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setParseError(null);
    setFileName(file.name);

    const text = await file.text();
    const parsed = csvToContactRows(text);

    if (parsed.length === 0) {
      setParseError("No rows found in CSV.");
      setRows([]);
      return;
    }

    const missingRequired = parsed.every((r) => !r.name || !r.email || !r.company);
    if (missingRequired) {
      setParseError(
        "Couldn't find name, email, and company columns. Expected headers: name, email, company, linkedin, title."
      );
      setRows([]);
      return;
    }

    setRows(parsed);
  }

  async function handleImport() {
    setSubmitting(true);
    setResult(null);

    const res = await fetch("/api/contacts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: rows }),
    });

    setSubmitting(false);
    const data: ImportResult = await res.json();
    setResult(data);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Link href="/contacts" className="text-sm text-foreground/60 hover:text-foreground">
          Contacts
        </Link>
        <span className="text-foreground/40">/</span>
        <h1 className="text-2xl font-semibold tracking-tight">Import CSV</h1>
      </div>

      <p className="text-sm text-foreground/70">
        Columns: <code className="text-xs">name, email, company, linkedin, title</code>. Column
        order doesn&apos;t matter; header names are matched case-insensitively.
      </p>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={handleFile}
        className="text-sm"
      />

      {parseError && (
        <div className="rounded-md bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-3 py-2 text-sm">
          {parseError}
        </div>
      )}

      {rows.length > 0 && !result && (
        <>
          <div className="text-sm text-foreground/70">
            Parsed {rows.length} row{rows.length === 1 ? "" : "s"} from {fileName}. Preview:
          </div>
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-black/[.03] dark:bg-white/[.04] text-left text-foreground/60 sticky top-0">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const invalid = !row.name || !row.email || !row.company;
                  return (
                    <tr
                      key={i}
                      className={`border-t border-black/10 dark:border-white/10 ${invalid ? "bg-red-50 dark:bg-red-900/10" : ""}`}
                    >
                      <td className="px-4 py-2">{row.name || <span className="text-red-500">missing</span>}</td>
                      <td className="px-4 py-2">{row.email || <span className="text-red-500">missing</span>}</td>
                      <td className="px-4 py-2">{row.company || <span className="text-red-500">missing</span>}</td>
                      <td className="px-4 py-2 text-foreground/70">{row.title || "—"}</td>
                      <td className="px-4 py-2 text-foreground/70">{row.linkedinUrl || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={submitting}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Importing…" : `Import ${rows.length} contact${rows.length === 1 ? "" : "s"}`}
            </button>
            <Link
              href="/contacts"
              className="rounded-md border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              Cancel
            </Link>
          </div>
        </>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-black/10 dark:border-white/10 px-4 py-3 text-sm">
            <div>{result.created} created</div>
            <div>{result.skipped} skipped (duplicate email)</div>
            <div>{result.errors.length} failed</div>
          </div>
          {result.errors.length > 0 && (
            <ul className="text-sm text-red-700 dark:text-red-400 flex flex-col gap-1">
              {result.errors.map((e, i) => (
                <li key={i}>
                  Row {e.row}{e.email ? ` (${e.email})` : ""}: {e.message}
                </li>
              ))}
            </ul>
          )}
          <Link href="/contacts" className="text-sm underline w-fit">
            View contacts
          </Link>
        </div>
      )}
    </div>
  );
}
