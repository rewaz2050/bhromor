# Android রাইডার অ্যাপ — PC ছাড়াই বানানো ও চালানো

**কেন অ্যাপ লাগল:** ব্রাউজারে স্ক্রিন বন্ধ করলে ফোন GPS পাঠানো বন্ধ করে দেয় — এটা
ব্রাউজারের নিয়ম, কোডের বাগ না। তাই রাইডারের ফোন পকেটে থাকলে কাস্টমারের ম্যাপে
পিন থেমে যেত। ইনস্টল করা অ্যাপে লোকেশন চলে **Android foreground service**-এ,
তাই স্ক্রিন বন্ধ থাকলেও পিন নড়তে থাকে। এটাই একমাত্র জিনিস যা web-এ কোনোদিন সম্ভব না।

**খরচ: ৳০**

| কী | খরচ |
|---|---|
| Capacitor 8.5.3 (core/android/cli) | ফ্রি, MIT |
| `@capgo/background-geolocation` 8.4.11 | ফ্রি, MPL-2.0 (কোনো লাইসেন্স কিনতে হয় না) |
| GitHub Actions-এ APK বিল্ড | ফ্রি — এই রিপো public, তাই মিনিটের হিসাব নেই |
| APK সরাসরি রাইডারকে দেওয়া | ফ্রি |
| (পরে) Play Store-এ ছাড়তে | এককালীন $২৫ |

> **TransistorSoft-এর প্লাগিনটা নেওয়া হয়নি** — ওটা সবচেয়ে শক্তিশালী কিন্তু লাইসেন্স
> কিনতে হয় (`license: CUSTOM`)। `@capgo` ফ্রি, আজকেও (২০২৬-১০-০৯) আপডেট হয়েছে,
> আর delivery-র জন্যই বানানো।

---

## ১) অ্যাপটা আসলে কী

এটা দ্বিতীয় কোনো কোডবেস না। অ্যাপটি একটি পাতলা নেটিভ শেল, যা **আপনার লাইভ সাইটটিই**
লোড করে (`capacitor.config.ts` → `server.url`, এখন `https://bhromor-zeta.vercel.app`)।

কেন এমন: এই প্রজেক্ট সার্ভার-রেন্ডারড Next.js — এতে `/api/*` রুট, middleware আর
service-role Supabase key আছে, যা ফোনের ভেতরে প্যাক করা যায় না। তাই শেলটি সাইট লোড
করে, আর বিনিময়ে **নেটিভ ব্রিজ** পায় — অর্থাৎ ব্যাকগ্রাউন্ড GPS।

**এর সুবিধা:** Vercel-এ কোড ঠিক করলেই সব রাইডারের ফোনে সেটা সাথে সাথে চলে আসে।
Play Store আপডেটের জন্য অপেক্ষা করতে হয় না।

## ২) APK বানানো (PC লাগবে না)

1. GitHub-এ রিপো খুলুন → **Actions** ট্যাব → বাঁ পাশে **Android APK**।
2. ডান দিকে **Run workflow** → সবুজ বোতাম।
3. ৫–১০ মিনিট পরে ওই রানের ভেতরে **Artifacts** → `prosanti-rider-apk` ডাউনলোড।
4. জিপ খুললে পাবেন `PROSANTI-rider-<নাম>.apk`।

**প্রিভিউ সাইট দিয়ে বানাতে চাইলে** Run workflow-এর ঘরে `site_url` লিখে দিন,
যেমন `https://my-preview.vercel.app`। খালি রাখলে প্রোডাকশন সাইট ধরবে।

**ফোনে ইনস্টল:** APK ফোনে পাঠান (WhatsApp/Drive/USB) → খুলুন → "অজানা অ্যাপ ইনস্টল"
অনুমতি দিন → ইনস্টল।

## ৩) রাইডারের ফোনে একবার যা করতে হবে

1. অ্যাপ খুলে লগইন → **অনলাইন** ট্যাপ।
2. লোকেশনের অনুমতি চাইবে → **"সবসময় অনুমতি দিন"** (Allow all the time)।
   শুধু "অ্যাপ চলার সময়" দিলে স্ক্রিন বন্ধ করলে আবার থেমে যাবে।
3. Android 13+ হলে নোটিফিকেশনের অনুমতিও চাইবে → দিন। ওই নোটিফিকেশন
   ("PROSANTI ডেলিভারি চলছে") না থাকলে Android সার্ভিসটি বন্ধ করে দেয়।
4. এরপর স্ক্রিন বন্ধ করলেও চলবে। বোর্ডে সবুজ লেখা উঠবে:
   **"✅ অ্যাপে ব্যাকগ্রাউন্ড ট্র্যাকিং চালু"**।

পুরনো APK বা ব্রাউজার হলেও সমস্যা নেই — কোডটি তখন নিজে থেকেই ব্রাউজারের
`navigator.geolocation`-এ ফিরে যায়, আর তখনই কেবল "স্ক্রিন জাগিয়ে রাখুন" সুইচ দেখায়।

## ৪) কোন কোন ফাইল কী করে

| ফাইল | কাজ |
|---|---|
| `capacitor.config.ts` | অ্যাপের পরিচয় + কোন সাইট লোড হবে + `useLegacyBridge` |
| `mobile-web/index.html` | ইন্টারনেট না থাকলে যে বাংলা নোটিশ দেখায় |
| `android/` | নেটিভ প্রজেক্ট (Gradle) — কমিট করা আছে |
| `android/app/src/main/AndroidManifest.xml` | লোকেশন + ফোরগ্রাউন্ড সার্ভিসের অনুমতি |
| `src/lib/native-location.ts` | একমাত্র জায়গা যেটি নেটিভ প্লাগিনকে চেনে |
| `src/lib/use-rider-location.ts` | দুই ইঞ্জিন: নেটিভ হলে সেটি, নাহলে ব্রাউজার |

**`useLegacyBridge: true` কেন:** এটা না দিলে Android নতুন ব্রিজে চলে যায় আর
**৫ মিনিট পর ব্যাকগ্রাউন্ডে লোকেশন থেমে যায়** — প্লাগিনের ডকুমেন্টেশনেই লেখা আছে।
Capacitor 8.5.3-এর নিজের টাইপ ফাইলে অপশনটি আছে কিনা দেখে তবেই দেওয়া হয়েছে।

## ৫) Play Store-এ ছাড়তে চাইলে (পরে, এখন লাগবে না)

Debug APK সরাসরি ইনস্টল হয়, কিন্তু Play Store চায় সাইন করা release বিল্ড।

1. একটা keystore বানান (যেকোনো অনলাইন/ক্লাউড টার্মিনালে চলে):
   `keytool -genkey -v -keystore prosanti.keystore -alias prosanti -keyalg RSA -keysize 2048 -validity 10000`
2. GitHub → Settings → Secrets-এ তিনটি secret দিন:
   `ANDROID_KEYSTORE_BASE64` (ফাইলটির base64), `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`।
3. বললে workflow-এ সাইনিং ধাপ যোগ করে দেব — এটি ইচ্ছাকৃতভাবে এখন রাখা হয়নি,
   কারণ আপনার হাতে keystore নেই এবং এটা ছাড়াও অ্যাপ চালানো যায়।
4. Play Console একাউন্ট: এককালীন $২৫। ব্যাকগ্রাউন্ড লোকেশন ব্যবহার করলে
   Google-এর "sensitive permissions" ফর্ম পূরণ করতে হয় — দিতে হবে কেন তা লিখলেই হয়
   (রাইডার লাইভ ট্র্যাকিং, গ্রাহক নিজের ডেলিভারি দেখেন)।

## ৬) নোটিফিকেশন — অ্যাপের ভেতরে আসবে কি?

**প্যানেলে: হ্যাঁ, এখনই কাজ করে।** `notifyStaff()` (`src/lib/db/engagement.ts`) প্রতিটি স্টাফ
ইভেন্টে দুটো কাজ করে — প্যানেলের ইনবক্সে সারি **এবং** `pushStaffNotice()` দিয়ে ফোনে Web Push।
যেখান থেকে ডাকা হয় সেগুলো আসল: `POST /api/orders` (নতুন অর্ডার), রিভিউ, রিটার্ন, কনট্যাক্ট,
পাসওয়ার্ড-রিসেট রিকোয়েস্ট, নিউজলেটার, অর্ডার অ্যাডভান্স/পেমেন্ট, রাইডার রিলিজ। প্যানেল খোলা
থাকলে ১৫ সেকেন্ড পোল + বিপ; বন্ধ থাকলে সরাসরি ফোনে নোটিফিকেশন। সেটআপ একবারই —
README → "Realtime phone notifications for admin" (দুটি VAPID কী + মাইগ্রেশন
`202609210001_push_subscriptions.sql`)।

**অ্যাপের ভেতরে: না — এই প্ল্যাটফর্মে Web Push-ই নেই।** Android-এর System WebView-তে
`PushManager` নামের কিছুই নেই, তাই সাবস্ক্রাইব করার মতো কিছু নেই। এটা সেটিং নয়,
প্ল্যাটফর্মের সীমা।

আরেকটা জিনিস: অ্যাপের WebView Android-এর স্টক `; wv)` মার্কার নিয়েই ঘোরে (Capacitor user agent
তখনই বদলায় যখন `android.appendUserAgent` / `overrideUserAgentString` সেট করা থাকে —
আমাদের `capacitor.config.ts`-এ দুটোই নেই)। ফলে push কার্ড আগে রাইডারকে বলত "আপনি একটা
in-app browser-এ খুলেছেন, Chrome-এ খুলুন" — নিজের অ্যাপের ভেতরে দাঁড়িয়ে। এখন
`PushEnv.nativeApp` Capacitor bridge দেখে আগে চেক করে, তাই কার্ড সত্যি কথাটা বলে:

> PROSANTI app er bhitore Web Push chole na (Android WebView e PushManager nei)…

### নোটিফিকেশন চাইলে দুটি রাস্তা

| | কী | খরচ |
|---|---|---|
| **ক. আজই** | অ্যাডমিন/রাইডার URL টা **Chrome**-এ খুলুন, অথবা Chrome-এর মেনু থেকে **Add to Home Screen** করুন। তারপর আগের push কার্ড দিয়েই ON করুন — সব কাজ করবে | ৳০, এখনই |
| **খ. অ্যাপের ভেতরেই** | Firebase Cloud Messaging: `@capacitor/push-notifications@8.1.3` (MIT) + Firebase প্রজেক্ট + `google-services.json` (`android/app/`-এ — `com.google.gms.google-services` classpath ইতিমধ্যে `android/build.gradle`-এ আছে) + সার্ভারে `firebase-admin` সেন্ডার + একটি token টেবিল | ৳০ (FCM ফ্রি), তবে একদিনের কাজ |

খ রাস্তার মানে: Firebase console থেকে প্রজেক্ট বানানো, `google-services.json` নামিয়ে
`android/app/`-এ রাখা, অ্যাপ স্টার্টে `PushNotifications.requestPermissions()` + `getToken()` →
token টা ডাটাবেজে সংরক্ষণ, আর `pushStaffNotice`/রাইডার push-এর পাশে একটি FCM fan-out।
`POST_NOTIFICATIONS` অনুমতি ম্যানিফেস্টে আগে থেকেই আছে, তাই runtime প্রম্পট প্লাগিনই নেবে।

## ৭) যা এখনো যাচাই করা হয়নি

সততার সাথে: এই স্যান্ডবক্সে Java/Gradle/Android SDK নেই, তাই **APK এখানে কম্পাইল
করা হয়নি**। যা যাচাই করা হয়েছে:

- `npx cap add android` ও `npx cap sync android` দুটোই সফল (`@capgo/background-geolocation@8.4.11` শনাক্ত হয়েছে)
- জেনারেট হওয়া `capacitor.config.json`-এ `useLegacyBridge: true` আর সঠিক `server.url` আছে
- কোডের টেস্ট: নেটিভ ইঞ্জিন বাছাই, ফলব্যাক, থ্রটল, এরর ম্যাপিং
- `npm run lint`, `npm run typecheck`, পুরো টেস্ট স্যুট ও `next build` ক্লিন

প্রথমবার Actions চালানোর পর কোনো Gradle এরর এলে সেটা আমাকে জানান — ঠিক করে দেব।
