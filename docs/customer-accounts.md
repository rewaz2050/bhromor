# Customer accounts and account wishlists

## What this enables
- `/account`: passwordless email-code sign-in/signup, resend cooldown, invalid/expired-code recovery, session restoration and device-local sign-out.
- Guest wishlist remains browser-local. Authenticated wishlist is stored remotely and **never** written into guest storage. Account changes reset the in-memory account snapshot.
- Guests explicitly choose **Import guest favourites** after sign-in. Import uses `ON CONFLICT DO NOTHING`, never deletes account favourites, and preserves the guest list on that browser.
- Product hearts, wishlist badge and wishlist page use the active account. Writes are serialized; the UI waits for server confirmation. Failed reads/writes show recovery UI and block further changes until a successful retry.
- Account favourites refresh on sign-in, successful writes and browser-window focus. This is **not** continuous Realtime sync; another device's edits appear on refocus/reload.

## Setup (deployment owner)
1. Create/use a Supabase project. Enable Email authentication and new-user signup if desired.
2. Apply `supabase/migrations/202609080001_storefront_saved_items.sql` in the project's SQL editor or your migration pipeline. This standalone migration does not require applying the base schema. Do not blindly reapply `schema.sql` to an existing database.
3. Set `NEXT_PUBLIC_SUPABASE_URL` to the HTTPS project URL and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to its anon or publishable client key in the deployment's environment settings. Restart/rebuild Next.js after changing public variables. Never put a service-role key in a `NEXT_PUBLIC_` variable or chat.
4. Configure the Supabase **Magic Link** email template to display `{{ .Token }}` as the sign-in code. This UI uses `signInWithOtp` + `verifyOtp(type: "email")`, not magic-link redirects. Leave URL auto-session detection disabled. The code input accepts the provider's 6–10 digit OTP length.
5. Set a production SMTP sender, appropriate OTP expiry and Supabase Auth rate limits. The 60-second UI resend countdown is convenience only; server-side rate limiting must stay enabled. Supabase's development email sender may restrict recipients.
6. Verify the privacy/terms pages and consent policy for the deployed service.

Without valid configuration, `/account` displays an honest unavailable state and guest shopping remains functional. No fake user or session is created.

## Database/security boundary
- A separate `storefront_saved_items` table uses `(customer_id, product_slug)` as the primary key and an `auth.users` foreign key with cascade deletion.
- Slugs bridge the current typed storefront catalogue (`p1` etc.) and future UUID product rows. There is deliberately no foreign key into the not-yet-migrated product catalogue. Unknown/removed slugs do not render in the storefront; they are not automatically deleted from a customer's account.
- Anonymous access is revoked. Authenticated clients only get SELECT, INSERT and DELETE, protected by `auth.uid() = customer_id` RLS. No UPDATE or public-read policy is installed.
- All adapter queries also filter by customer ID. Client-side filters are not a replacement for the database policies.
- Customer auth does not grant admin privileges. The `/admin` staff gate is the production administration boundary and is never exposed to customers.
- Sessions use the Supabase browser SDK's persisted session. Protect the site against XSS and sign out on shared devices. Guest and account wishlist data remain separate; cart and guest checkout have not been migrated by this change.

## Verification before launch
Automated tests cover code send/verify/error UI, missing configuration, failed sign-out, owner-filtered queries, additive imports, failed sync recovery and guest/account isolation using mocked Supabase responses. They do **not** prove deployed RLS or email delivery.

With a configured project:
1. Create two test customer accounts A and B using actual email codes.
2. As A save a product, then on a separate device sign in as A and confirm persistence. Change a heart and refocus the other tab.
3. Sign out; verify only that browser's original guest favourites appear. Sign in as B and verify A's items never appear.
4. Using B's authenticated Supabase client, try reading/deleting A's rows (must return no accessible rows) and inserting a row with A's customer ID (must fail RLS). With an anonymous client, reads/writes must fail.
5. Import the same guest list twice; confirm no duplicates and no removal of existing account items.
6. Simulate offline mode/expired session; verify no success toast for a failed write and recovery after reconnection.
7. Verify invalid and expired OTPs, resend throttling, refresh-token restoration and sign-out after reload.

## Not included
Production orders/catalogue migration, server-authenticated account order history, purchase-verified reviews, real sales aggregates/Best Sellers, social feed permissions and verified size measurements remain separate integrations. This work neither reads mock orders as real sales nor links guest orders to accounts without proof of ownership.
