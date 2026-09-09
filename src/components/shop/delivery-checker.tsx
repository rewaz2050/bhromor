"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveZones } from "@/lib/use-live-zones";
import { useMyZone } from "@/lib/use-my-zone";
import { formatBdt } from "@/lib/format";
import { IconTruck } from "@/components/ui/icons";

export default function DeliveryChecker() {
  const { activeZones } = useLiveZones();
  const { zoneId: myZoneId, setZoneId } = useMyZone();
  const [area, setArea] = useState("");
  const [checked, setChecked] = useState(false);
  const zone = activeZones.find(
    (z) =>
      z.areas.some(
        (a) => a.toLocaleLowerCase() === area.trim().toLocaleLowerCase(),
      ) || z.name.toLocaleLowerCase() === area.trim().toLocaleLowerCase(),
  );
  return (
    <section
      aria-labelledby="delivery-check-title"
      className="border-b border-line bg-ivory-100"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-6 py-8 lg:grid-cols-2 lg:px-8">
        <div className="flex items-start gap-4">
          <IconTruck className="mt-1 h-6 w-6 shrink-0 text-gold-600" />
          <div>
            <h2
              id="delivery-check-title"
              className="font-display text-2xl text-forest-900"
            >
              Good things. Closer than you think.
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              Enter your area to check delivery availability and estimated time.
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setChecked(true);
          }}
        >
          <label htmlFor="delivery-area" className="sr-only">
            Area or location
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              required
              id="delivery-area"
              list="delivery-areas"
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setChecked(false);
              }}
              placeholder="Enter area / location"
              className="h-12 min-w-0 flex-1 border border-line bg-paper px-4 text-base"
            />
            <datalist id="delivery-areas">
              {activeZones
                .flatMap((z) => z.areas)
                .map((a) => (
                  <option key={a} value={a} />
                ))}
            </datalist>
            <button className="editorial-button justify-center bg-forest-800 text-white">
              Check availability
            </button>
          </div>
          <div role="status" className="mt-3 text-sm text-forest-800">
            {checked &&
              (zone ? (
                <>
                  {`✓ Available · Estimated delivery: ${zone.etaLabel} · Delivery from ${formatBdt(zone.charge)} (free on qualifying orders).`}{" "}
                  {myZoneId === zone.id ? (
                    <span className="font-medium">
                      Showing shops for {zone.name}.
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setZoneId(zone.id)}
                      className="font-semibold underline underline-offset-2 hover:text-forest-900"
                    >
                      Shop for {zone.name}
                    </button>
                  )}
                </>
              ) : (
                <>
                  We couldn’t confirm this area. Choose a suggested area or{" "}
                  <Link href="/contact" className="underline">
                    contact us
                  </Link>{" "}
                  before ordering.
                </>
              ))}
          </div>
        </form>
      </div>
    </section>
  );
}
