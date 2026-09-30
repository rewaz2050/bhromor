"use client";

/**
 * Vendor dashboard (marketplace slice 3): needs-action orders, today's
 * takings, the open/closed sign, and shortcuts into the work queues.
 */

import { useState } from "react";
import Link from "next/link";
import { useVendor } from "@/components/vendor/vendor-shell";
import {
  EmptyState,
  ErrorBox,
  PageHeader,
  Skeleton,
  StatusPill,
  formatDateTime,
} from "@/components/vendor/vendor-ui";
import { formatBdt } from "@/lib/format";
import {
  patchVendorShop,
  useVendorEarnings,
  useVendorOrders,
  useShopFollowers,
  useVendorFunnel,
  useVendorPromos,
  useVendorReviews,
  useVendorProducts,
  vendorErrorMessage,
} from "@/lib/use-vendor";
import {
  isLateOrder,
  serviceScore,
  shopPath,
  splitNeedsAction,
  todayStats,
} from "@/lib/vendor-dashboard";
import { useVendorOrderAlert } from "@/lib/use-vendor-order-alert";
import {
  WEEKDAY_LABELS,
  hourLabel,
  hourProfile,
  unitsByProduct,
  weekdayProfile,
  zoneDemand,
} from "@/lib/insights";
import { shelfState } from "@/lib/product-shelf";
import OnboardingChecklist from "@/components/vendor/onboarding-checklist";
import ServiceScoreCard from "@/components/vendor/service-score-card";
import FollowersCard from "@/components/vendor/followers-card";
import FunnelCard from "@/components/vendor/funnel-card";
import VerificationCard from "@/components/vendor/verification-card";
import VacationCard from "@/components/vendor/vacation-card";
import type { ShopVacation } from "@/lib/catalog";
import { isOnVacation, vacationVendorLine } from "@/lib/shop-vacation";
import PromoCard from "@/components/vendor/promo-card";
import VendorReviewsCard from "@/components/vendor/vendor-reviews-card";

export default function VendorDashboardPage() {
  const me = useVendor();
  const authed = me !== null;
  const orders = useVendorOrders(authed);
  const earnings = useVendorEarnings(authed);
  const prods = useVendorProducts(authed);
  // B1 — followers come from their own row-level-secured read.
  const follows = useShopFollowers(authed);
  // B2 — approved reviews of this shop's products, with the reply writer.
  const reviews = useVendorReviews(authed);
  // B3 — the shop's own promo codes and what they have cost so far.
  const promos = useVendorPromos(authed);
  // B4 — the shop's own funnel: visits → product → bag → checkout → order.
  const funnel = useVendorFunnel(authed);
  const [toggling, setToggling] = useState(false);
  const [open, setOpen] = useState<boolean | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  // B6 — the holiday lives in local state until the save answers, because the
  // dashboard's own `me` is refreshed by a reload, not by this request.
  const [savedVacation, setSavedVacation] = useState<ShopVacation | null | undefined>(undefined);
  const isOpen = open ?? me?.shop.isOpen ?? false;
  // B6 — what the dashboard shows as the shop's holiday: the save's answer if
  // there has been one, otherwise the shop row we loaded with.
  const vacation = savedVacation !== undefined ? savedVacation : me?.shop.vacation;
  const onHoliday = isOnVacation(vacation);
  const list = orders.orders;
  // 2026-09-27 — one card per real job (to confirm / preparing / rider
  // waiting) plus a late warning, instead of one lumped "Needs action" that
  // hid a 40-minute-old unconfirmed order among the fresh ones.
  const work = splitNeedsAction(list);
  const inKitchen = work.preparing.length;
  const today = todayStats(list);
  // A2 (2026-09-28) — the shop's own service score over the last week, from
  // the very orders this page already loaded. No order in the window means
  // no score, not a fake 0%.
  const service = serviceScore(list, { prepMinutes: me?.shop.prepMinutes ?? 0 });
  const alertOrder = useVendorOrderAlert(list, {
    enabled: me !== null && me.shop.status === "active",
    shopName: me?.shop.name,
  });
  // P2 #23 — real demand analytics over the shop's most recent ≤100 orders
  // (the same list this page already shows — cancellations never count).
  const weekday = weekdayProfile(list);
  const hours = hourProfile(list);
  const topProds = unitsByProduct(list).slice(0, 3);
  const zones = zoneDemand(list);
  const maxDay = Math.max(1, ...weekday.orders);
  // Same shelf model as the product list: published rows that are sold out
  // or running low (drafts and archived pieces are not "needs restock").
  const lowStock = prods.products.filter((pp) => {
    const st = shelfState(pp);
    return st === "out" || st === "low";
  });

  const shareUrl =
    me?.shop.slug && typeof window !== "undefined"
      ? `${window.location.origin}${shopPath(me.shop.slug)}`
      : me?.shop.slug
        ? shopPath(me.shop.slug)
        : "";

  const copyShopLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareNote("Link copied — paste it anywhere.");
    } catch {
      setShareNote(shareUrl);
    }
  };

  const shareShop = async () => {
    if (!shareUrl) return;
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({ title: me?.shop.name ?? "My shop", url: shareUrl });
        return;
      }
    } catch {
      // The shop closed the share sheet — fall through to copying.
    }
    await copyShopLink();
  };

  const saveVacation = async (patch: {
    start: string | null;
    end: string | null;
    note: string;
  }): Promise<void> => {
    const shop = await patchVendorShop({
      vacationStart: patch.start ?? "",
      vacationEnd: patch.end ?? "",
      vacationNote: patch.note,
    });
    setSavedVacation(shop.vacation ?? null);
  };

  const flipOpen = async () => {
    setToggling(true);
    setToggleError(null);
    try {
      const shop = await patchVendorShop({ is_open: !isOpen });
      setOpen(shop.isOpen);
    } catch (err) {
      setToggleError(vendorErrorMessage(err));
    } finally {
      setToggling(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Salaam, ${me?.shop.name ?? "vendor"} — today at a glance.`}
        sub={`${me?.role === "owner" ? "Owner" : "Staff"} account · ${me?.shop.prepMinutes ?? 15} min prep · ${Math.round(me?.shop.commissionPct ?? 15)}% commission`}
      />

      {/* The ring (2026-09-27): the dashboard is not a silent poll any more. */}
      {me?.shop.status === "active" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-forest-50 px-4 py-3 ring-1 ring-forest-200">
          <p className="text-xs text-forest-900">
            <span className="font-semibold">
              {alertOrder.state.armed ? "New orders ring on this device." : "New orders are silent right now."}
            </span>{" "}
            {alertOrder.state.permission === "denied"
              ? "The browser blocked notifications — allow them in the address-bar lock, then tap Test."
              : "Keep this page open on the counter phone; the bell works while the dashboard is open."}
          </p>
          <div className="flex gap-2">
            {alertOrder.state.armed ? (
              <>
                <button
                  type="button"
                  onClick={() => void alertOrder.testAlert()}
                  className="rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-forest-700"
                >
                  Test the bell
                </button>
                <button
                  type="button"
                  onClick={() => alertOrder.disableAlerts()}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-line hover:text-ink"
                >
                  Turn off
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void alertOrder.enableAlerts()}
                className="rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-forest-700"
              >
                Turn the bell on
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            To confirm
          </p>
          <p className="mt-1 font-display text-3xl text-forest-900">
            {orders.loading ? "…" : work.fresh.length}
          </p>
          {work.late.length > 0 && !orders.loading && (
            <p className="mt-1 rounded-lg bg-amber-100 px-2 py-1 text-[0.68rem] font-semibold text-amber-900">
              ⚠ {work.late.length} waiting over 10 minutes
            </p>
          )}
          <Link
            href="/vendor/orders?status=pending"
            className="mt-1 inline-block text-xs font-semibold text-forest-800 underline underline-offset-2"
          >
            Open order queue →
          </Link>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Being prepared
          </p>
          <p className="mt-1 font-display text-3xl text-forest-900">
            {orders.loading ? "…" : inKitchen}
          </p>
          <Link
            href="/vendor/orders?status=preparing"
            className="mt-1 inline-block text-xs font-semibold text-forest-800 underline underline-offset-2"
          >
            View →
          </Link>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Ready for rider
          </p>
          <p className="mt-1 font-display text-3xl text-forest-900">
            {orders.loading ? "…" : work.readyForRider.length}
          </p>
          <Link
            href="/vendor/orders?status=ready-for-pickup"
            className="mt-1 inline-block text-xs font-semibold text-forest-800 underline underline-offset-2"
          >
            View →
          </Link>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Today&rsquo;s sales
          </p>
          <p className="mt-1 font-display text-3xl text-forest-900">
            {orders.loading ? "…" : formatBdt(today.revenue)}
          </p>
          <p className="mt-1 text-[0.68rem] text-ink-soft">
            {orders.loading
              ? "…"
              : `${today.orders} orders · avg ${formatBdt(today.average)}${
                  today.cancelled > 0 ? ` · ${today.cancelled} cancelled` : ""
                }`}
          </p>
          <Link
            href="/vendor/earnings"
            className="mt-1 inline-block text-xs font-semibold text-forest-800 underline underline-offset-2"
          >
            Earnings →
          </Link>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Shop sign
          </p>
          <p data-testid="shop-sign" className="mt-1 font-display text-3xl text-forest-900">
            {onHoliday ? "On holiday" : isOpen ? "Open" : "Closed"}
          </p>
          <button
            type="button"
            onClick={flipOpen}
            disabled={toggling}
            className="mt-1 text-xs font-semibold text-forest-800 underline underline-offset-2 disabled:opacity-60"
          >
            {toggling ? "Saving…" : isOpen ? "Close the shop" : "Open the shop"}
          </button>
          {/* B6 — the switch is not broken while the holiday covers it: saying
              so stops the owner from pressing it twice a day. */}
          {onHoliday && (
            <p className="mt-1 text-[0.68rem] leading-4 text-amber-800">
              {vacationVendorLine(vacation)}
            </p>
          )}
        </div>
      </div>

      {/* Your shop, shareable (2026-09-27): the owner finally has the link. */}
      {me && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Your shop
            </p>
            <p className="mt-0.5 truncate text-sm text-ink">
              {shareUrl || shopPath(me.shop.slug)}
            </p>
            {shareNote && <p className="mt-1 text-xs text-forest-800">{shareNote}</p>}
          </div>
          {me.shop.freeDeliveryMinPaisa ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[0.68rem] font-semibold text-emerald-800">
              Free delivery over {formatBdt(me.shop.freeDeliveryMinPaisa)}
            </span>
          ) : (
            <span className="rounded-full bg-ivory-200 px-3 py-1 text-[0.68rem] font-semibold text-ink-soft">
              No free-delivery offer
            </span>
          )}
          <Link
            href={shopPath(me.shop.slug)}
            className="rounded-full px-4 py-1.5 text-xs font-semibold text-forest-800 ring-1 ring-line hover:bg-ivory-100"
          >
            View storefront
          </Link>
          <button
            type="button"
            onClick={() => void shareShop()}
            className="rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-forest-700"
          >
            Share link
          </button>
        </div>
      )}

      {toggleError && (
        <div className="mt-3">
          <ErrorBox message={toggleError} />
        </div>
      )}

      {me && (
        <ServiceScoreCard
          score={service}
          prepMinutes={me.shop.prepMinutes}
          loading={orders.loading}
        />
      )}

      {me && (
        <div className="mt-6">
          <VerificationCard
            verification={me.shop.verification}
            shopName={me.shop.name}
          />
        </div>
      )}

      {me && (
        <div className="mt-6">
          <VacationCard
            vacation={vacation}
            onSave={saveVacation}
            editable={me.role === "owner"}
          />
        </div>
      )}

      <div className="mt-6">
        <FunnelCard
          funnel={funnel.funnel}
          loading={funnel.loading}
          missing={funnel.missing}
          error={funnel.error}
          onRetry={funnel.refresh}
        />
      </div>

      {me && promos.limits && (
        <div className="mt-6">
          <PromoCard
            promos={promos.promos}
            limits={promos.limits}
            usedTotal={promos.usedTotal}
            discountBornePaisa={promos.discountBornePaisa}
            commissionPct={Math.round(me.shop.commissionPct ?? 15)}
            loading={promos.loading}
            onCreate={promos.create}
            onToggle={promos.setActive}
          />
        </div>
      )}

      {me && (
        <VendorReviewsCard
          reviews={reviews.reviews}
          onReply={reviews.reply}
          loading={reviews.loading}
          limit={3}
          allHref="/vendor/reviews"
        />
      )}

      {me && (
        <FollowersCard
          followers={follows.followers}
          neverReached={follows.neverReached}
          rows={follows.rows}
          loading={follows.loading}
        />
      )}

      {/* Round 4 — what a new shop still has to do; hides itself once complete. */}
      {me && (
        <div className="mt-6">
          <OnboardingChecklist
            shop={{ ...me.shop, isOpen }}
            products={prods.products}
            loading={prods.loading}
            onOpenShop={() => {
              if (!isOpen) void flipOpen();
            }}
            opening={toggling}
          />
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="mt-6 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-900">
            Restock soon
          </h3>
          <ul className="mt-2 space-y-1.5">
            {lowStock.slice(0, 5).map((pp) => (
              <li key={pp.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{pp.name}</span>
                <span className="shrink-0 text-xs font-semibold text-amber-900">
                  {shelfState(pp) === "out" ? "Sold out" : "Low"}
                </span>
                <Link
                  href={`/vendor/products/${encodeURIComponent(pp.id)}`}
                  className="shrink-0 text-xs font-semibold text-forest-800 underline underline-offset-2"
                >
                  Restock →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-label="Latest orders">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Latest orders
          </h3>
          {orders.loading ? (
            <Skeleton lines={3} />
          ) : orders.error ? (
            <ErrorBox message={orders.error} onRetry={orders.refresh} />
          ) : list.length === 0 ? (
            <EmptyState
              title="No orders yet"
              sub="When customers order from your shop, new orders land here for confirmation."
            />
          ) : (
            <ul className="space-y-2">
              {list.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/vendor/orders/${encodeURIComponent(o.id)}`}
                    className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line transition hover:ring-forest-400"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-forest-900">
                        {o.id} · {o.customer.name}
                        {isLateOrder(o) && (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-amber-900">
                            late
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-soft">
                        {formatDateTime(o.createdAt)} · {formatBdt(o.total)}
                      </p>
                    </div>
                    <StatusPill status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Payout balance">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Payout balance
          </h3>
          {earnings.loading ? (
            <Skeleton lines={2} />
          ) : earnings.error ? (
            <ErrorBox message={earnings.error} onRetry={earnings.refresh} />
          ) : (
            <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
              <p className="font-display text-3xl text-forest-900">
                {formatBdt(earnings.earnings?.balance ?? 0)}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Earned {formatBdt(earnings.earnings?.lifetimePayable ?? 0)} ·{" "}
                paid out {formatBdt(earnings.earnings?.lifetimePaid ?? 0)}
              </p>
              <p className="mt-3 text-xs text-ink-soft">
                PROSANTI settles payouts to your bKash/bank account — the
                ledger below updates per delivered order.
              </p>
              <Link
                href="/vendor/earnings"
                className="mt-2 inline-block text-xs font-semibold text-forest-800 underline underline-offset-2"
              >
                Full earnings →
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* P2 #23 — what the shop's own orders say: when, what, where. */}
      <section
        aria-label="Demand insights"
        className="mt-6 rounded-2xl bg-paper p-5 ring-1 ring-line"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg text-forest-900">
            Demand insights
          </h3>
          <p className="text-xs text-ink-soft">
            Counted from your most recent {list.length} loaded orders — cancelled
            ones never count. This is history, not a forecast.
          </p>
        </div>
        {orders.error ? (
          <ErrorBox message={orders.error} onRetry={orders.refresh} />
        ) : list.length === 0 ? (
          <EmptyState
            title="Nothing to analyse yet"
            sub="The first real order flips this panel on — the shop refuses to draw bars from an empty table."
          />
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Busiest day
              </p>
              <p className="mt-1 font-display text-2xl text-forest-900">
                {weekday.busiest === null
                  ? "—"
                  : WEEKDAY_LABELS[weekday.busiest]}
              </p>
              <div className="mt-3 space-y-1" role="img" aria-label="orders per weekday">
                {WEEKDAY_LABELS.map((d, i) => (
                  <div key={d} className="flex items-center gap-2 text-[0.65rem] text-ink-soft">
                    <span className="w-7">{d}</span>
                    <span
                      className="h-1.5 rounded-full bg-forest-700"
                      style={{ width: `${(weekday.orders[i] / maxDay) * 100}%`, minWidth: weekday.orders[i] ? 4 : 0 }}
                    />
                    <span className="tabular-nums">{weekday.orders[i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Best hours
              </p>
              {hours.best ? (
                <p className="mt-1 font-display text-2xl text-forest-900">
                  {hours.top.map((h) => hourLabel(h.hour)).join(" · ")}
                </p>
              ) : (
                <p className="mt-1 font-display text-2xl text-ink-soft">—</p>
              )}
              <p className="mt-2 text-xs leading-5 text-ink-soft">
                Order times in Bangladesh clock — prep extra hands before the
                rush instead of hoping.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Top movers (units)
              </p>
              {topProds.length === 0 ? (
                <p className="mt-1 text-sm text-ink-soft">—</p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {topProds.map((tp, i) => (
                    <li key={tp.productId} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-ink">
                        {i + 1}. {tp.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-soft">
                        {tp.units} · {formatBdt(tp.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Zones &amp; stock
              </p>
              {zones[0] ? (
                <p className="mt-1 text-sm text-ink">
                  <span className="font-display text-2xl text-forest-900">
                    {Math.round(zones[0].share * 100)}%
                  </span>{" "}
                  of orders come from {zones[0].zoneName}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-ink-soft">
                {zones.length > 1
                  ? `${zones.length} zones have bought from you — restock the loudest first.`
                  : "One zone so far — the rest will follow the courier map."}
              </p>
              <Link
                href={lowStock.length > 0 ? "/vendor/products?shelf=out" : "/vendor/products"}
                className={`mt-2 inline-block text-xs font-semibold underline underline-offset-2 ${
                  lowStock.length > 0 ? "text-amber-800" : "text-forest-800"
                }`}
              >
                {lowStock.length > 0
                  ? `⚠ ${lowStock.length} piece${lowStock.length > 1 ? "s" : ""} low/out of stock — restock →`
                  : "Stock levels healthy →"}
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
