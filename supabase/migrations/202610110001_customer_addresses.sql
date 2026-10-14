-- ============================================================================
-- 202610110001_customer_addresses.sql
-- The address book, on the server.
--
-- Until now the saved addresses lived in localStorage (`prosanti.address-book
-- .v1`), which the account page had to admit out loud: "শুধু এই ব্রাউজারে
-- থাকে—অন্য ডিভাইসে নয়". A shopper who orders from a phone and then opens the
-- site on a laptop retypes the whole address, every time. The wishlist already
-- syncs (storefront_saved_items, 202609080001) — the address book was the one
-- piece of the account left behind on a single device.
--
-- The local copy stays: checkout reads it synchronously and must keep working
-- with no session and no network. This table is the mirror that follows the
-- customer between devices, keyed by the same client id so the two never
-- disagree about which row is which.
--
-- Service-role only, like every other customer table: the API routes are the
-- only door, and each one resolves the phone from the session cookie.
-- ============================================================================

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  /** Normalized 01XXXXXXXXX of the account this address belongs to. */
  customer_phone text not null check (customer_phone ~ '^[0-9]{11}$'),
  /**
   * The id the browser already uses (`addr-<timestamp>`). Kept so a device
   * that saved an address offline and a device that pulled it from here end
   * up talking about the same row.
   */
  client_id text not null,
  /** Checkout restores the preferred address first — one per customer. */
  preferred boolean not null default false,
  /** The SavedAddress object as the client knows it (label, para, pin, …). */
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_phone, client_id)
);

create index if not exists idx_customer_addresses_phone
  on public.customer_addresses (customer_phone, preferred desc, created_at desc);

/** The same rule the local store enforces: one address is "the" one. */
create unique index if not exists one_preferred_address_per_customer
  on public.customer_addresses (customer_phone) where preferred;

-- No policies on purpose: RLS denies anon/authenticated, and the service role
-- (the only reader/writer, always behind the customer session) bypasses it.
alter table public.customer_addresses enable row level security;
