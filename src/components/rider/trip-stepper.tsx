/**
 * A trip is four moves: take the offer → collect at the shop → ride → hand
 * over. The stepper tells the rider where they are and what comes next, so the
 * single primary button below it always makes sense.
 */

export type TripState = "offered" | "accepted" | "picked_up" | "delivered";

export const TRIP_STEPS = [
  { key: "offered", label: "অফার" },
  { key: "accepted", label: "দোকানে" },
  { key: "picked_up", label: "পথে" },
  { key: "delivered", label: "ডেলিভারি" },
] as const;

/** 0-based index of the step the trip is ON (the current, unfinished one). */
export const tripStepIndex = (state: TripState): number =>
  Math.max(0, TRIP_STEPS.findIndex((s) => s.key === state));

export default function TripStepper({ state }: { state: TripState }) {
  const current = tripStepIndex(state);
  return (
    <ol aria-label="Trip progress" className="flex items-center" data-testid="trip-stepper">
      {TRIP_STEPS.map((step, i) => {
        const done = i < current || state === "delivered";
        const active = i === current && state !== "delivered";
        return (
          <li key={step.key} className="flex flex-1 items-center last:flex-none" aria-current={active ? "step" : undefined} data-step={step.key} data-status={done ? "done" : active ? "active" : "todo"}>
            <span className="flex flex-col items-center gap-1">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  done
                    ? "bg-emerald-600 text-white"
                    : active
                      ? "bg-forest-800 text-gold-300 ring-2 ring-gold-400/50"
                      : "bg-line/70 text-ink-soft"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-[10px] font-semibold ${active ? "text-forest-900" : "text-ink-soft"}`}>{step.label}</span>
            </span>
            {i < TRIP_STEPS.length - 1 && (
              <span className={`mx-1 mb-4 h-0.5 flex-1 rounded ${i < current ? "bg-emerald-500" : "bg-line"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
