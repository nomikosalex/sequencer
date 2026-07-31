export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 rounded bg-black/[.06] dark:bg-white/[.08]" />
        <div className="h-8 w-32 rounded-md bg-black/[.06] dark:bg-white/[.08]" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
        ))}
      </div>
    </div>
  );
}
