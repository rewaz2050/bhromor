import { IconTruck } from "@/components/ui/icons";

/** The sticky app bar: who is signed in, the realtime socket state, and the online/offline switch. */
export function RiderTopBar({
  name,
  live,
  isOnline,
  onToggle,
}: {
  name: string;
  /** Realtime socket is connected (offers arrive instantly), else 15 s polling. */
  live: boolean;
  isOnline: boolean;
  onToggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-forest-900 px-5 py-4 text-ivory-50 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-800 text-gold-300 ring-1 ring-gold-400/40">
          <IconTruck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-base font-semibold">PROSANTI রাইডার</h1>
          <p className="flex items-center gap-1.5 text-[11px] text-ivory-100/70">
            {name}
            {/* Realtime socket state — offers arrive instantly while Live. */}
            <span
              role="status"
              title={live ? "Live — নতুন অফার সাথে সাথে আসবে" : "পোলিং মোড — ১৫ সেকেন্ড পর পর আপডেট"}
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-semibold ${
                live ? "bg-emerald-500/20 text-emerald-300" : "bg-forest-800 text-ivory-100/50"
              }`}
            >
              <span className={`h-1 w-1 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`} />
              {live ? "Live" : "Polling"}
            </span>
          </p>
        </div>
      </div>

      {/* Online/Offline thumb toggle */}
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
          isOnline
            ? "bg-emerald-500 text-forest-950 shadow-sm ring-2 ring-emerald-300"
            : "bg-forest-800 text-ivory-100/60 ring-1 ring-line"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            isOnline ? "bg-forest-950 animate-pulse" : "bg-gray-400"
          }`}
        />
        {isOnline ? "অনলাইন" : "অফলাইন"}
      </button>
    </header>
  );
}
