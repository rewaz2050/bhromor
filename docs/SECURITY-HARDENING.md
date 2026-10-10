# নিরাপত্তা জোরদার — ২৯ সেপ্টেম্বর ২০২৬

## রিপোজিটরিতে করা পরিবর্তন

- Admin ও vendor API-তে JSON parse করার আগেই streaming body size-cap: default ১.১ MB; CSV-তে সর্বোচ্চ ৩.১ MB। `Content-Length` কেবল আগাম reject-এর hint—আসল stream-ও গোনা হয়।
- Vendor Cloudinary upload server-verified shop ID-র নিজস্ব folder-এ যায়: `prosanti/vendors/<shop-id>/…`; request body দিয়ে অন্য দোকান বা platform folder বেছে নেওয়া যায় না। Signature নির্দিষ্ট image/video format allowlist-এ বাঁধা।
- Upstash REST credentials থাকলে API-র সামনে shared Redis-backed rate limit চলে; Redis না থাকলে আগের route-level সীমা fallback হিসেবে থাকে।

## যেগুলো চালু করতে production dashboard/access লাগবে

1. **Distributed rate limit:** Vercel Production/Preview-তে `UPSTASH_REDIS_REST_URL` (Config) ও `UPSTASH_REDIS_REST_TOKEN` (Secret) যোগ করে redeploy করুন। এতে login/signup/reset, order, vendor staff ও media-sign-এর কড়া সীমাসহ API rate-limiting চালু হবে। Vercel Firewall/WAF-ও চালু রাখুন। Redis down থাকলে route-level fallback আছে—এটি DDoS প্রতিরক্ষা নয়।
2. **MFA:** Supabase Auth-এ admin, super-admin, shop owner ও staff-এর জন্য TOTP MFA বাধ্যতামূলক করুন। একমাত্র super-admin-এর MFA enforce করার আগে দ্বিতীয় admin/recovery পদ্ধতিতে login পরীক্ষা করুন, যেন lockout না হয়।
3. **Cloudinary সীমা:** Cloudinary account-এ সর্বোচ্চ upload size, quota/usage alert এবং cleanup policy সেট করুন। Browser-এর accept/size check নিজে security control নয়।
4. **CSP:** আগে report-only CSP দিয়ে Next.js inline scripts এবং Cloudinary/maps/video origins যাচাই করুন; তারপর nonce/hash-ভিত্তিক policy enforce করুন। অন্ধভাবে strict CSP বা স্থায়ী `unsafe-inline` দেবেন না।
5. **Database:** Production-এ migration সঠিক ক্রমে হয়েছে কি না, vendor-owned table-এ RLS চালু কি না, anon/authenticated role দিয়ে cross-shop read/write আটকায় কি না যাচাই করুন। Migration-এর আগে restore করা যায় এমন backup নিন। `SUPABASE_SERVICE_ROLE_KEY` কখনো browser-এ প্রকাশ করবেন না।
6. **Secret ও account:** Supabase service key/Cloudinary secret Vercel-এ Secret রাখুন; log/screenshot/chat/Git-এ বেরিয়ে গেলে সঙ্গে সঙ্গে rotate করুন। অপ্রয়োজনীয় staff/vendor access সরান এবং Supabase session/password policy পর্যালোচনা করুন।
7. **Dependency alert:** Production dependency audit পরিষ্কার; পূর্ণ audit-এ Vitest/@vitest/mocker-এর দুইটি moderate dev-only alert আছে। `--force` দিয়ে অন্ধ upgrade না করে আলাদা tested major upgrade করুন।
8. **Monitoring/recovery:** Auth failure, 413/429 spike, staff roster change, upload volume, payout, product price/status change-এ alert দিন। Backup restore drill এবং incident-time key rotation-ও পরীক্ষা করুন।

## Permission matrix — admin / vendor / rider (অডিট ২০২৬-১০-০৯)

**মডেল:** তিনটি গার্ড — `staffRoute` (`api/admin/_lib.ts`), `vendorRoute`, `riderRoute` —
লগইন যাচাই ও রেট-লিমিট করে; আসল মালিকানা ডাটাবেজে (RLS + `security definer` ফাংশন)।

**একটা গুরুত্বপূর্ণ সত্য:** `ps_is_admin()` তিনটি রোলকেই (`admin`, `super_admin`,
**`manager`**) স্টাফ ধরে, তাই RLS manager-কে super_admin-এর সমান টেবিল-অ্যাক্সেস দেয়।
রোল আলাদা করার **একমাত্র** জায়গা হলো রাউটের `opts.roles`। তাই নিচের তালিকাটা
`src/app/api/__tests__/admin-permission-matrix.test.ts` পিন করে রাখে — কোনো
রিফ্যাক্টরে `roles:` মুছে গেলে CI ফেল করবে।

### যেগুলো শুধু admin / super_admin (manager নয়)

| গোষ্ঠী | রাউট |
|---|---|
| টাকা বের করা / ব্যালেন্স | `POST riders/[id]/settle`, `POST riders/[id]/settle-claim`, `POST riders/[id]/adjust`, `POST payouts`, `POST`+`PATCH money`, `GET money/export` |
| কাস্টমারের টাকা কোথায় যায় | `PATCH settings` (`wallets.bkash` / `wallets.nagad`) |
| লগইন তৈরি | `GET`+`POST`+`DELETE staff`, `POST riders/[id]/link-rider`, `POST shops/[id]/link-vendor`, `POST riders/[id]/reset-password`, `POST shops/[id]/reset-password` |
| পরিচয় / ভেটিং | `POST riders/[id]/review`, `PATCH riders/[id]/licence`, `POST shops/[id]/review`, `POST shops/[id]/verification`, `POST access-requests/[id]` |
| দোকানের গঠন | `POST shops`, `GET shops/[id]`, `GET shops/[id]/commission` |
| সবার কাছে ব্রডকাস্ট | `GET`+`POST push/broadcast` |

**পড়া (GET) ইচ্ছে করেই খোলা** — manager রোজকার কিউ চালায়, তাই `payouts`, `money`,
`money/daily`, `money/audit`, `settings` পড়তে পারে; লেখা আটকানো।

**manager-এর UI-তে বাটন লুকানো হয়নি** — এটা সীমানা নয়, সুবিধা। চাপ দিলে সার্ভারের
সত্যি কথাই ফিরবে ("Admin access is required for this action.") এবং `use-riders`-এর
`setError` সেটা স্ক্রিনে দেখাবে, চুপচাপ ব্যর্থ হবে না।

### যেগুলো যাচাই করে ঠিক পাওয়া গেছে (বদলাবেন না)

- **রাইডার IDOR:** যেসব `ps_rider_*` ফাংশন id নেয়, সবগুলোতে
  `rider_id is distinct from ps_rider_id()` → `'forbidden'`।
- **রাইডার ডেটা ফাঁস নেই:** `ps_rider_scorecards_raw` ও `ps_rider_referral_code`
  `revoke all … from public, anon, authenticated` + শুধু `service_role`-কে grant।
- **ভেন্ডর স্টাফ:** `assertOwner(role)` (`lib/db/vendor-staff.ts:41`) চারটি হেল্পারেই
  কল হয়, ২২টি টেস্টে পিন করা।
- **স্টাফ ম্যানেজমেন্ট:** `canManageRole()`, নিজের রোল বদলানো যায় না, শেষ
  super_admin ডিমোট করা যায় না (`lib/db/admin.ts:2889`)।
- **টাকা-সেটল RPC:** `ps_admin_settle_rider` / `ps_admin_reject_settle` ভেতরে আবার
  `ps_is_admin()` চেক করে — তাই `grant execute … to authenticated` ঝুঁকি নয়।

## সীমাবদ্ধতা

Automated test ও source/config review **লাইভ penetration test নয়**। এই সেশনে Production Supabase, Cloudinary, Vercel Firewall, বাস্তব MFA enrollment বা backup restore-এ ঢুকে পরীক্ষা করা হয়নি। তাই এগুলো production-এ যাচাই না হওয়া পর্যন্ত security hardening পুরোপুরি শেষ বলা যাবে না।
