export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 rounded bg-black/[.06] dark:bg-white/[.08]" />
        <div className="h-8 w-28 rounded-md bg-black/[.06] dark:bg-white/[.08]" />
      </div>
      <div className="h-9 w-full max-w-xl rounded-md bg-black/[.06] dark:bg-white/[.08]" />
      <div className="h-64 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
    </div>
  );
}
