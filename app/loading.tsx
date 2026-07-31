export default function Loading() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-7 w-40 rounded bg-black/[.06] dark:bg-white/[.08]" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
        ))}
      </div>
      <div className="h-40 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
    </div>
  );
}
