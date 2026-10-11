-- ============================================================================
-- 202610110002_customer_threads.sql
-- An in-app conversation between a shopper and the shop that sold the order.
--
-- Every customer→shop path so far has left the site: the tracker's WhatsApp
-- button, the delay note, the contact form. That works when the shopper has
-- WhatsApp and the shop is watching one number, and it leaves nothing behind —
-- no thread, no history, no way for the shop to answer the person who actually
-- asked. `contact_messages` (202609090006) is a one-way inbox with a
-- new/read/replied flag, not a conversation.
--
-- Free by construction: one table, read by polling the same way the tracker
-- re-reads an order. No third party, no per-message cost, no push dependency.
--
-- Service-role only; the customer routes scope by session phone and the staff
-- routes sit behind staffRoute.
-- ============================================================================

create table if not exists public.customer_threads (
  id uuid primary key default gen_random_uuid(),
  /** Normalized 01XXXXXXXXX of the shopper who opened it. */
  customer_phone text not null check (customer_phone ~ '^[0-9]{11}$'),
  /** The shop the order came from — null for a general platform question. */
  shop_id uuid references public.shops (id) on delete set null,
  /** The order this is about, when it is about one. */
  order_no text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  /** So the inbox sorts by "who spoke last" without a join. */
  last_message_at timestamptz not null default now()
);

create table if not exists public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.customer_threads (id) on delete cascade,
  /** Who said it — the UI colours the bubble by this. */
  sender text not null check (sender in ('customer', 'shop', 'rider', 'platform')),
  /** Display name of the sender, so a shop with staff can say who replied. */
  sender_name text not null default '',
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_threads_phone
  on public.customer_threads (customer_phone, last_message_at desc);
create index if not exists idx_customer_threads_shop
  on public.customer_threads (shop_id, status, last_message_at desc);
create index if not exists idx_customer_messages_thread
  on public.customer_messages (thread_id, created_at);

alter table public.customer_threads  enable row level security;
alter table public.customer_messages enable row level security;
