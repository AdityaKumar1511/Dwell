export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-20 pt-12" aria-busy="true">
      <div className="h-2.5 w-24 animate-pulse rounded-full bg-panel-2" />
      <div className="mt-5 h-12 w-2/3 animate-pulse rounded-md bg-panel" />
      <div className="mt-4 h-4 w-1/2 animate-pulse rounded-full bg-panel" />

      <div className="mt-10 h-[8.5rem] animate-pulse rounded-xl border border-line bg-panel/40" />

      <div className="mt-14 space-y-0 border-t border-line">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="flex items-center gap-4 border-b border-line py-5"
          >
            <div className="h-2.5 w-6 animate-pulse rounded-full bg-panel-2" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 animate-pulse rounded-full bg-panel-2" />
              <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-panel" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
