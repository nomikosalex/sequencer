import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-foreground/70">
        This page, contact, or sequence doesn&apos;t exist.
      </p>
      <Link href="/" className="text-sm underline">
        Back to dashboard
      </Link>
    </div>
  );
}
