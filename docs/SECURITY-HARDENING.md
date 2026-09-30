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

## সীমাবদ্ধতা

Automated test ও source/config review **লাইভ penetration test নয়**। এই সেশনে Production Supabase, Cloudinary, Vercel Firewall, বাস্তব MFA enrollment বা backup restore-এ ঢুকে পরীক্ষা করা হয়নি। তাই এগুলো production-এ যাচাই না হওয়া পর্যন্ত security hardening পুরোপুরি শেষ বলা যাবে না।
