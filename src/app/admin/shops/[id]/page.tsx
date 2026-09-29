"use client";

/**
 * C3 (2026-09-29) — one shop's file: /admin/shops/<id>.
 *
 * Before this page, "how is that shop doing?" meant four tabs and a bit of
 * mental arithmetic: the shops queue for its details, the products list
 * filtered by shop, the orders list filtered by shop, and the payouts board
 * for what it is owed. Everything is here now, and the page opens with what
 * needs doing rather than with a wall of numbers.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import AdminDataError from "@/components/admin/admin-data-error";
import { IconArrowRight, IconStar } from "@/components/ui/icons";
import { formatBdt } from "@/lib/format";
import { describeLoginEmail } from "@/lib/phone-login";
import { vacationReopenDate } from "@/lib/shop-vacation";
import { attentionFlags, dossierHeadline, type AttentionFlag } from "@/lib/shop-dossier";
import { useAdminShop } from "@/lib/use-admin-shop";
import type { AdminShopDetail } from "@/lib/db/admin-shop";

const TONE: Record<AttentionFlag["tone"], string> = {
  stop: "bg-rose-50 text-rose-800 ring-rose-200",
  warn: "bg-amber-50 text-amber-900 ring-amber-200",
  note: "bg-forest-50 text-forest-900 ring-forest-200",
};

const when = (ms: number | null): string =>
  ms === null
    ? "—"
    : new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function AdminShopDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { detail, loading, missing, error, refresh } = useAdminShop(params.id);
  // One clock reading per mount: "how long has this shop been waiting" is
  // answered against the moment the page opened, not against every render.
  const [now] = useState(() => Date.now());

  if (loading && !detail) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading shop">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-ivory-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
        <div className="h-64 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
      </div>
    );
  }

  if (missing) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl text-forest-900">That shop is not on PROSANTI</h1>
        <p className="text-sm text-ink-soft">
          The link may be old — the shop was removed, or the id is wrong.
        </p>
        <Link
          href="/admin/shops"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-800 underline underline-offset-2"
        >
          Back to the shops queue <IconArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  if (error && !detail) {
    return <AdminDataError error={error} onRetry={() => void refresh()} />;
  }
  if (!detail) return null;

  const { shop } = detail;
  const flags = attentionFlags(detail, now, t);
  const head = dossierHeadline(detail);
  const reopen = vacationReopenDate(shop.vacation);

  return (
    <div className="space-y-6">
      {/* ---------- who this is ---------- */}
      <header className="rounded-2xl bg-paper p-5 ring-1 ring-line">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/admin/shops"
              className="text-xs font-semibold text-ink-soft underline underline-offset-2"
            >
              ← Shops queue
            </Link>
            <h1 className="font-display mt-1 text-2xl text-forest-900">{shop.name}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              /shops/{shop.slug} · {shop.phone || "no phone"}
              {shop.contactEmail ? ` · ${describeLoginEmail(shop.contactEmail)}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-ivory-200 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide">
                {shop.status}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${
                  shop.isOpen ? "bg-forest-100 text-forest-800" : "bg-ivory-200 text-ink-soft"
                }`}
              >
                {shop.isOpen ? "Open" : "Closed"}
              </span>
              <span className="rounded-full bg-ivory-200 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide">
                {shop.commissionPct}% commission
              </span>
              {(shop.verification?.nid || shop.verification?.tradeLicence) && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-emerald-800">
                  Verified
                </span>
              )}
              {reopen && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-amber-900">
                  Holiday · back {reopen}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-forest-800">
            <Link
              href={`/shops/${shop.slug}`}
              className="underline underline-offset-2"
              target="_blank"
            >
              Storefront ↗
            </Link>
            <Link
              href={`/admin/products?shop=${encodeURIComponent(shop.id)}`}
              className="underline underline-offset-2"
            >
              Catalog →
            </Link>
            <Link
              href={`/admin/orders?shop=${encodeURIComponent(shop.id)}`}
              className="underline underline-offset-2"
            >
              All orders →
            </Link>
          </div>
        </div>
      </header>

      {/* ---------- what needs doing, worst first ---------- */}
      {flags.length > 0 && (
        <section aria-label="Needs attention" className="space-y-2" data-testid="shop-flags">
          {flags.map((flag) => (
            <p
              key={flag.id}
              data-testid={`shop-flag-${flag.id}`}
              className={`rounded-2xl px-4 py-3 text-sm font-medium ring-1 ${TONE[flag.tone]}`}
            >
              {flag.text}
              {flag.href && (
                <Link href={flag.href} className="ml-1.5 underline underline-offset-2">
                  Open →
                </Link>
              )}
            </p>
          ))}
        </section>
      )}

      {/* ---------- the four numbers ---------- */}
      <section
        aria-label="Headline"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        data-testid="shop-headline"
      >
        <Tile label="Orders taken" value={String(head.orders)} sub={`${head.openOrders} still open`} />
        <Tile label="Shoppers paid" value={formatBdt(head.revenue)} sub="cancelled excluded" />
        <Tile
          label="Owed to the shop"
          value={formatBdt(head.balance)}
          sub={`${formatBdt(head.earned)} earned · ${formatBdt(detail.ledger.paid)} paid`}
        />
        <Tile
          label="Rating"
          value={head.rating === null ? "—" : `★ ${head.rating.toFixed(1)}`}
          sub={head.reviewCount === 0 ? "no reviews yet" : `${head.reviewCount} reviews`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard detail={detail} />
        <LoginsCard detail={detail} />
        <CatalogCard detail={detail} />
        <OrdersCard detail={detail} />
        <MoneyCard detail={detail} />
        <ReviewsCard detail={detail} />
      </div>

      {detail.orders.windowFull && (
        <p className="text-xs text-ink-soft">
          Order figures cover the last {detail.orders.window} orders — the full history lives on the
          orders page.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const Tile = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-2xl bg-paper p-4 ring-1 ring-line">
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
      {label}
    </p>
    <p className="font-display mt-1 text-2xl text-forest-900">{value}</p>
    {sub && <p className="mt-0.5 text-[0.7rem] text-ink-soft">{sub}</p>}
  </div>
);

const Card = ({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
  testId: string;
}) => (
  <section data-testid={testId} className="rounded-2xl bg-paper p-5 ring-1 ring-line">
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">{title}</h2>
      {action && (
        <Link
          href={action.href}
          className="text-xs font-semibold text-forest-800 underline underline-offset-2"
        >
          {action.label}
        </Link>
      )}
    </div>
    {children}
  </section>
);

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
    <span className="text-xs text-ink-soft">{label}</span>
    <span className="text-right text-sm text-ink">{value}</span>
  </div>
);

const ProfileCard = ({ detail }: { detail: AdminShopDetail }) => {
  const { shop, staff } = detail;
  return (
    <Card
      title="Shop"
      testId="shop-profile"
      action={{ href: `/admin/shops`, label: "Edit in the queue" }}
    >
      <Row label="Address" value={shop.address || "—"} />
      <Row label="Prep time" value={`${shop.prepMinutes} min`} />
      <Row label="Zones" value={shop.zoneIds.length > 0 ? shop.zoneIds.join(", ") : "none"} />
      <Row
        label="Free delivery (shop pays)"
        value={
          shop.freeDeliveryMinPaisa
            ? `over ${formatBdt(shop.freeDeliveryMinPaisa)}`
            : "not opted in"
        }
      />
      <Row label="Logins" value={`${staff.length} (${staff.filter((s) => s.role === "owner").length} owner)`} />
      {shop.review?.note && <Row label="Last decision" value={shop.review.note} />}
    </Card>
  );
};

const LoginsCard = ({ detail }: { detail: AdminShopDetail }) => {
  const { staff, shop } = detail;
  return (
    <Card title="Who can sign in" testId="shop-logins">
      {staff.length === 0 ? (
        <p className="text-sm text-amber-900">
          Nobody is linked — the shop cannot sign in. Link the owner from the shops queue.
        </p>
      ) : (
        <ul className="space-y-2">
          {staff.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-ivory-100 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  {member.name || "Unnamed login"}
                </span>
                <span className="block text-[0.7rem] text-ink-soft">
                  {member.login ? describeLoginEmail(member.login) : "no login on file"}
                </span>
              </span>
              <span className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-wide">
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    member.role === "owner"
                      ? "bg-forest-100 text-forest-800"
                      : "bg-ivory-200 text-ink-soft"
                  }`}
                >
                  {member.role}
                </span>
                <span className="text-ink-soft">{when(member.addedAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[0.68rem] leading-5 text-ink-soft">
        Staff logins are the owner&apos;s to open and revoke (Settings → Staff logins); this page only
        shows who has one. A shop with{" "}
        {staff.filter((s) => s.role === "owner").length === 0 ? "no owner" : "an owner"} can
        {staff.filter((s) => s.role === "owner").length === 0 ? "not" : ""} manage itself on{" "}
        {shop.name}.
      </p>
    </Card>
  );
};

const CatalogCard = ({ detail }: { detail: AdminShopDetail }) => {
  const { catalog, shop } = detail;
  return (
    <Card
      title="Catalog"
      testId="shop-catalog"
      action={{
        href: `/admin/products?shop=${encodeURIComponent(shop.id)}`,
        label: "All products →",
      }}
    >
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { n: catalog.published, label: "live" },
          { n: catalog.drafts, label: "draft" },
          { n: catalog.hidden, label: "hidden" },
          { n: catalog.outOfStock, label: "no stock" },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl bg-ivory-100 px-2 py-2">
            <p className="font-display text-lg text-forest-900">{tile.n}</p>
            <p className="text-[0.65rem] uppercase tracking-wide text-ink-soft">{tile.label}</p>
          </div>
        ))}
      </div>
      {catalog.sample.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {catalog.sample.map((product) => (
            <li key={product.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <Link
                  href={`/admin/products?shop=${encodeURIComponent(shop.id)}`}
                  className="text-ink underline-offset-2 hover:underline"
                >
                  {product.name}
                </Link>
                {product.status !== "published" && (
                  <span className="ml-1.5 text-[0.65rem] uppercase tracking-wide text-amber-800">
                    {product.status}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-ink-soft">{formatBdt(product.price)}</span>
            </li>
          ))}
        </ul>
      )}
      {catalog.windowFull && (
        <p className="mt-2 text-[0.68rem] text-ink-soft">Showing the newest 500 products.</p>
      )}
    </Card>
  );
};

const OrdersCard = ({ detail }: { detail: AdminShopDetail }) => {
  const { orders, shop } = detail;
  return (
    <Card
      title="Orders"
      testId="shop-orders"
      action={{
        href: `/admin/orders?shop=${encodeURIComponent(shop.id)}`,
        label: "All orders →",
      }}
    >
      <p className="text-xs text-ink-soft">
        {orders.count} taken · {orders.delivered} delivered · {orders.cancelled} cancelled
      </p>
      {orders.recent.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">No orders yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {orders.recent.map((order) => (
            <li key={order.id} className="flex items-baseline justify-between gap-3 text-sm">
              <Link
                href={`/admin/orders/${encodeURIComponent(order.orderNo || order.id)}`}
                className="font-medium text-forest-800 underline-offset-2 hover:underline"
              >
                {order.orderNo || order.id}
              </Link>
              <span className="flex items-baseline gap-2">
                <span className="text-[0.68rem] uppercase tracking-wide text-ink-soft">
                  {order.status}
                </span>
                <span className="text-ink">{formatBdt(order.total)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const MoneyCard = ({ detail }: { detail: AdminShopDetail }) => {
  const { ledger } = detail;
  return (
    <Card
      title="Money"
      testId="shop-money"
      action={{ href: `/admin/payouts`, label: "Payouts board →" }}
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { v: formatBdt(ledger.earned), label: "earned" },
          { v: formatBdt(ledger.paid), label: "paid" },
          { v: formatBdt(ledger.balance), label: "owed" },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl bg-ivory-100 px-2 py-2">
            <p className="font-display text-lg text-forest-900">{tile.v}</p>
            <p className="text-[0.65rem] uppercase tracking-wide text-ink-soft">{tile.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[0.68rem] text-ink-soft">
        Last payout {ledger.lastPayoutAt ? when(ledger.lastPayoutAt) : "never"}
      </p>
      {ledger.payouts.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {ledger.payouts.slice(0, 4).map((payout) => (
            <li key={payout.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink">
                {payout.method}
                {payout.reference ? ` · ${payout.reference}` : ""}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-[0.68rem] text-ink-soft">{when(payout.at)}</span>
                <span>{formatBdt(payout.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const ReviewsCard = ({ detail }: { detail: AdminShopDetail }) => {
  const { reviews } = detail;
  return (
    <Card title="Reviews" testId="shop-reviews" action={{ href: "/admin/reviews", label: "Moderate →" }}>
      <p className="text-xs text-ink-soft">
        {reviews.count === 0
          ? "No reviews yet."
          : `★ ${reviews.average.toFixed(1)} from ${reviews.count} · ${reviews.public} public · ${reviews.pending} waiting`}
      </p>
      <ul className="mt-2 space-y-2">
        {reviews.recent.map((review) => (
          <li key={review.id} className="rounded-xl bg-ivory-100 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1 text-sm font-medium text-ink">
                <IconStar className="h-3.5 w-3.5 text-amber-500" />
                {review.rating}/5
                <span className="font-normal text-ink-soft">· {review.author || "shopper"}</span>
              </span>
              <span className="text-[0.65rem] uppercase tracking-wide text-ink-soft">
                {review.status}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-ink">{review.body}</p>
            {review.reply && (
              <p className="mt-1 border-l-2 border-forest-200 pl-2 text-[0.7rem] text-forest-900">
                Shop replied: {review.reply}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};
