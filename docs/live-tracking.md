# Live tracking — the customer's real map (2026-10-08)

**What changed:** the tracker at `/track` now shows the customer a real map of
their own neighbourhood — OpenStreetMap tiles, their delivery pin, the rider's
pin on it, and the line between the two — instead of the decorative SVG route
that only printed the rider's coordinates as text. The rider's pin moves the
instant their phone reports (Supabase Realtime broadcast), with HTTP polling as
the fallback.

**Cost: ৳0.** Leaflet is MIT-licensed and already a dependency
(`leaflet ^1.9.4`, used by the admin dispatch map and the checkout pin picker).
OpenStreetMap tiles are free and need no API key. Supabase Realtime broadcast
needs no publication, no table and **no migration** — there is nothing to run in
the SQL Editor for this feature. Google Maps is not used anywhere and never was.

---

## 1. How a position reaches the customer

```
rider's phone (browser geolocation)
   │  lib/use-rider-location.ts — watchPosition + 30 s ping on a trip,
   │  lib/location-throttle.ts — sent only after ≥50 m or the 2 min heartbeat
   ├─► PATCH /api/rider/location ──► RPC ps_rider_update_location
   │        └─► riders.lat / lng / last_location_at        (source of truth)
   │
   └─► lib/use-rider-live-broadcast.ts ──► Realtime broadcast "fix"
            on the channel the job feed handed the rider
                    │
   customer's /track tab ◄─────────────────┘
        lib/use-live-rider-position.ts
          • GET /api/track/rider-location on mount, then every 10 s
          • subscribes to the channel the first answer names
          • while the socket is up, the poll slows to 30 s (backup only)
                    │
        components/track/rider-tile-map.tsx  (Leaflet + OSM)
```

Two independent paths, one state. If the socket never opens — no Supabase keys,
a blocked websocket, a rider on an old cached page — the poll carries the whole
feature and nothing looks broken. That is deliberate: the repo's rule for
Realtime has always been "socket first, poll backup" (see
`202609250007_realtime_offers.sql`).

## 2. The channel name, and why it is derived rather than stored

A Supabase broadcast channel is readable by anyone who knows its name, and an
order number is guessable (`PS-20261008-0042`). So the name carries the same
proof the rest of the tracker uses — the phone the order was placed with:

```
track:sha256("prosanti-live-track:" + orderUuid + ":" + phone)[:24]
```

`lib/live-track-channel.ts` (server-only, `node:crypto`). 96 bits, unguessable
without the phone. No column, no table, no migration: both sides derive the same
string from the same row.

| Who | Where it comes from | When |
|---|---|---|
| Customer | `GET /api/track/rider-location` → `liveChannel` | only after the order-ID + phone check passes |
| Rider | `GET /api/rider/jobs` → `job.liveChannel` | only for an `accepted` / `picked_up` job — the same point at which `riderOrderView` stops hiding the customer's contact |

**The key is the order UUID, not the order number.** `order_no` is nullable in
this schema (`coalesce(order_no, id::text)` appears throughout the migrations)
and the two sides hold different shapes of the order — the route has the row,
the job feed has the mapped domain object whose `id` *is* the order number. Two
sides deriving different names would mean the customer watches an empty room and
the pin moves only on the 30 s backup: a bug nobody can see. Pinned by
`ops-batch-h.test.ts` ("hands the rider the SAME live channel the tracker listens
on") and by `track-subroutes.test.ts`.

A failed phone check gets no channel at all (404, no `liveChannel` key).

## 3. What the map does — and what it refuses to do

`components/track/rider-tile-map.tsx` + `lib/live-map.ts` (pure, unit-tested).

- **Nothing is invented.** A pin is drawn only from a real coordinate. With
  neither a delivery pin from checkout nor a rider fix, the old schematic route
  renders instead — there is nothing honest to draw on a real map.
- **`0,0` is not a place.** An unset numeric column, an empty field or a failed
  geocode all turn into `0,0`, which is in the Gulf of Guinea. `asMapPoint`
  rejects it rather than sending a family 4,000 km from Sunamganj.
- **The pin slides, it does not teleport** — but only for travel. `markerMotion`
  slides a move of 15 m–2 km over 1.2 s (ease-out), and **snaps** anything
  beyond 2 km, because that is a GPS correction (a tunnel, a cold fix, a phone
  that was asleep), not a bike.
- **A stale fix cannot pose as live.** Older than the freshness window
  (`location-health.ts`: 2 min fresh / 5 min stale) the rider pin goes hollow
  with a dashed edge and a `?`, matching the admin map's rule.
- **The map follows the rider until the customer pans it.** From the first drag
  or pinch it stays put and offers a re-centre button.
- **Page scroll is never hijacked** (`scrollWheelZoom: false`) — a tracking page
  on a phone must still scroll.
- **Leaflet failing is handled.** If it cannot load (offline, blocked CDN) the
  component calls `onFailed` and the schematic route takes over instead of
  leaving a blank rectangle.

## 4. Rate limit

`GET /api/track/rider-location` had **no** limiter at all, and the tracker now
polls it every 10 s. It is limited like every other public lookup:
**60/min per IP** (`track-rider-loc:<ip>`) → 429 + `Retry-After`. One tab polls
6×/min, so a whole family watching on one connection still fits.

## 5. The one thing a web app cannot do

A browser suspends GPS when the tab is hidden or the screen sleeps — this is the
platform, not a bug here, and `lib/location-health.ts` says so in its header
comment. The mitigations already in the rider app are the honest ones:
`use-wake-lock` keeps the screen awake during a trip, a fix is forced the moment
the app comes back, and both sides are *told* when the signal is lost (rider:
"লোকেশন আপডেট হচ্ছে না"; customer: the hollow pin and "শেষ জানা অবস্থান").

Truly background tracking — screen off, app closed, like foodpanda's or
WhatsApp's native apps — needs a native shell (Capacitor / React Native) around
this same code. That is the only part of the foodpanda comparison that is not
free, and it is a separate decision.

## 6. Files

| File | Role |
|---|---|
| `src/lib/live-map.ts` | pure geometry, zoom rules, slide rules, pin markup |
| `src/components/track/rider-tile-map.tsx` | the Leaflet map |
| `src/lib/use-live-rider-position.ts` | customer side: poll + subscribe |
| `src/lib/use-rider-live-broadcast.ts` | rider side: publish each fix |
| `src/lib/live-track-channel.ts` | server-only channel derivation |
| `src/lib/live-fix-event.ts` | the one string both sides share |
| `src/app/api/track/rider-location/route.ts` | position + channel, rate-limited |
| `src/lib/db/riders.ts` | `RiderJob.liveChannel` |

Tests: `live-map.test.ts` (27), `use-live-rider-position.test.ts` (14),
`live-track-channel.test.ts` (9), `rider-tile-map.test.tsx` (8), plus the new
cases in `track-subroutes.test.ts` and `ops-batch-h.test.ts`.

## 7. Owner rollout checklist (বাংলা)

1. **কিছু রান করতে হবে না** — কোনো নতুন migration নেই, SQL Editor-এ কিছু লাগবে না।
2. Vercel-এ `NEXT_PUBLIC_SUPABASE_URL` ও `NEXT_PUBLIC_SUPABASE_ANON_KEY` আগে থেকেই
   আছে কিনা দেখুন — এগুলো থাকলে Realtime নিজ থেকেই চলবে। না থাকলেও সমস্যা নেই:
   ম্যাপ তখন ১০ সেকেন্ড পরপর হালনাগাদ হবে (স্ক্রিনে সেটাই লেখা থাকবে)।
3. রাইডারকে বলুন অ্যাপটি খোলা রাখতে — স্ক্রিন বন্ধ হলে ফোন লোকেশন পাঠানো থামায়
   (এটা ব্রাউজারের নিয়ম)। অ্যাপে "স্ক্রিন জাগিয়ে রাখুন" সুইচ আছে।
4. চেক করুন: `/track`-এ একটি চলমান অর্ডার খুললে আসল ম্যাপ আসবে, রাইডারের সবুজ পিন
   নড়বে, আর ৫ মিনিট সিগন্যাল না এলে পিন ফাঁপা হয়ে `?` দেখাবে।
5. ম্যাপের টাইল OpenStreetMap-এর ফ্রি সার্ভার থেকে আসে। অনেক বেশি ট্রাফিক হলে
   (দিনে লক্ষ লক্ষ টাইল) নিজের টাইল সার্ভার বা MapTiler/Stadia-র ফ্রি tier-এ যেতে
   হবে — `src/lib/live-map.ts`-এর `TRACK_TILE_URL` বদলালেই হবে, আর কিছু লাগবে না।
