import type { Metadata } from "next";
import InfoRail from "@/components/info/info-rail";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/primitives";
import L from "@/components/i18n/l";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PROSANTI collects, uses and protects your personal information.",
};

/**
 * Privacy policy — bilingual (UX plan §11, R10). The page stays a server
 * component; every text node is an `<L en bn />` leaf so the whole policy
 * reads in the shopper's language, headings included.
 */
export default function PrivacyPage() {
  return (
    <>
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow><L en="Your data, respected" bn="আপনার তথ্য, সম্মানের সাথে" /></Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        <L en="Privacy policy" bn="গোপনীয়তা নীতি" />
      </h1>
      <p className="mt-3 text-sm text-ink-soft">
        <L en="Last updated: September 2026" bn="সর্বশেষ হালনাগাদ: সেপ্টেম্বর ২০২৬" />
      </p>

      <div className="prose-prosanti mt-8">
        <p>
          <L
            en="PROSANTI (“we”, “us”) operates prosanti.store and provides commerce and local delivery services in Bangladesh. This policy explains what personal information we collect and why, and how we protect it."
            bn="PROSANTI (“আমরা”) prosanti.store চালায় এবং বাংলাদেশে অনলাইন কেনাকাটা ও স্থানীয় ডেলিভারি সেবা দেয়। এই নীতিতে বলা আছে আমরা কোন ব্যক্তিগত তথ্য কেন নিই, আর কীভাবে সেটা সুরক্ষিত রাখি।"
          />
        </p>

        <h2><L en="Information we collect" bn="যে তথ্য আমরা নিই" /></h2>
        <ul>
          <li>
            <strong><L en="Order details:" bn="অর্ডারের তথ্য:" /></strong>{" "}
            <L
              en="name, phone number, delivery address and order notes — needed to confirm, deliver and support your order."
              bn="নাম, ফোন নম্বর, ডেলিভারির ঠিকানা ও অর্ডার নোট — অর্ডার নিশ্চিত করা, পৌঁছে দেওয়া ও সাপোর্টের জন্য দরকার।"
            />
          </li>
          <li>
            <strong><L en="Account (optional):" bn="অ্যাকাউন্ট (ঐচ্ছিক):" /></strong>{" "}
            <L
              en="name, phone number and a password you choose — only if you open a free account to save addresses, see order history and collect Smart Card stamps. No verification code, no email required."
              bn="নাম, ফোন নম্বর আর আপনার বেছে নেওয়া পাসওয়ার্ড — শুধু যদি ঠিকানা সেভ, অর্ডারের ইতিহাস আর স্মার্ট কার্ডের স্ট্যাম্পের জন্য ফ্রি অ্যাকাউন্ট খোলেন। কোনো ভেরিফিকেশন কোড বা ইমেইল লাগে না।"
            />
          </li>
          <li>
            <strong><L en="Reviews:" bn="রিভিউ:" /></strong>{" "}
            <L
              en="the name, rating, text and photos you submit. When a review is a verified purchase, we also keep the phone number and order it was checked against — that is never shown publicly."
              bn="আপনার দেওয়া নাম, রেটিং, লেখা ও ছবি। রিভিউটা যাচাই করা কেনাকাটা হলে যে ফোন নম্বর ও অর্ডারের সাথে মিলিয়েছি সেটাও রাখি — তা কখনো প্রকাশ্যে দেখানো হয় না।"
            />
          </li>
          <li>
            <strong><L en="Communication:" bn="যোগাযোগ:" /></strong>{" "}
            <L
              en="messages you send through support channels."
              bn="সাপোর্ট চ্যানেলে আপনি যা লেখেন।"
            />
          </li>
          <li>
            <strong><L en="Technical:" bn="প্রযুক্তিগত:" /></strong>{" "}
            <L
              en="basic first-party analytics such as pages viewed, searches and device type, used to improve the experience — no advertising trackers, no user id. No payment-card data is handled by us at launch — Cash on Delivery is primary."
              bn="কোন পেজ দেখা হলো, কী খোঁজা হলো, কোন ধরনের ডিভাইস — শুধু আমাদের নিজস্ব সাধারণ পরিসংখ্যান, সেবা ভালো করার জন্য; কোনো বিজ্ঞাপনী ট্র্যাকার বা ইউজার-আইডি নেই। কার্ডের তথ্য আমরা নিই না — ক্যাশ অন ডেলিভারিই মূল পদ্ধতি।"
            />
          </li>
        </ul>

        <h2><L en="How we use it" bn="কীভাবে ব্যবহার করি" /></h2>
        <ul>
          <li>
            <L
              en="To confirm, fulfil and deliver orders, and to show live status."
              bn="অর্ডার নিশ্চিত করা, প্রস্তুত করা ও পৌঁছে দেওয়া, আর লাইভ স্ট্যাটাস দেখানোর জন্য।"
            />
          </li>
          <li>
            <L
              en="To respond to support and return/exchange requests."
              bn="সাপোর্ট আর ফেরত/বদলের অনুরোধের উত্তর দিতে।"
            />
          </li>
          <li>
            <L
              en="To send order updates — browser notifications or WhatsApp — only where you have opted in and the channel is operationally enabled."
              bn="অর্ডারের আপডেট পাঠাতে — ব্রাউজার নোটিফিকেশন বা WhatsApp-এ — শুধু আপনি রাজি হলে এবং চ্যানেলটি চালু থাকলে।"
            />
          </li>
          <li>
            <L
              en="To improve products, delivery performance and the website."
              bn="পণ্য, ডেলিভারি আর ওয়েবসাইট ভালো করতে।"
            />
          </li>
        </ul>

        <h2><L en="Sharing" bn="কার সাথে ভাগ হয়" /></h2>
        <p>
          <L
            en="We do not sell personal information. Delivery riders receive only the name, phone number and address needed to complete your delivery. Shops on the marketplace see the order details needed to prepare it. Service providers (hosting, media, analytics, and in the future payment gateways) process data under our instruction with appropriate safeguards."
            bn="আমরা ব্যক্তিগত তথ্য বিক্রি করি না। ডেলিভারি রাইডার শুধু ডেলিভারির জন্য দরকারি নাম, ফোন নম্বর ও ঠিকানা পান। মার্কেটপ্লেসের দোকান অর্ডার প্রস্তুত করতে যতটুকু দরকার ততটুকু দেখে। সেবাদাতা প্রতিষ্ঠান (হোস্টিং, মিডিয়া, পরিসংখ্যান, ভবিষ্যতে পেমেন্ট গেটওয়ে) আমাদের নির্দেশে যথাযথ সুরক্ষা মেনে তথ্য প্রক্রিয়া করে।"
          />
        </p>

        <h2><L en="Location" bn="অবস্থান" /></h2>
        <p>
          <L
            en="Live courier location is collected only during an active delivery, shared only with the order’s customer, and stopped when delivery completes. Courier personal information is never exposed."
            bn="রাইডারের লাইভ অবস্থান শুধু চলমান ডেলিভারির সময় নেওয়া হয়, শুধু সেই অর্ডারের ক্রেতাকে দেখানো হয়, আর ডেলিভারি শেষ হলেই বন্ধ। রাইডারের ব্যক্তিগত তথ্য কখনো প্রকাশ করা হয় না।"
          />
        </p>

        <h2><L en="Retention & your rights" bn="সংরক্ষণ ও আপনার অধিকার" /></h2>
        <p>
          <L
            en="Order records are kept as long as needed for operations, accounting and legal obligations. You may request a copy or deletion of your personal data by contacting us — see the"
            bn="অর্ডারের রেকর্ড যতদিন পরিচালনা, হিসাব ও আইনি প্রয়োজনে দরকার ততদিন রাখা হয়। আপনার ব্যক্তিগত তথ্যের কপি বা মুছে ফেলার অনুরোধ করতে পারেন — দেখুন"
          />{" "}
          <Link href="/contact"><L en="Contact page" bn="যোগাযোগ পেজ" /></Link>
          <L en="." bn="।" />
        </p>

        <h2><L en="Contact" bn="যোগাযোগ" /></h2>
        <p>
          <L
            en="Questions about this policy: use the"
            bn="এই নীতি নিয়ে প্রশ্ন থাকলে:"
          />{" "}
          <Link href="/contact"><L en="Contact page" bn="যোগাযোগ পেজ" /></Link>{" "}
          <L
            en="— it shows the shop's current phone, WhatsApp and email."
            bn="— সেখানে দোকানের বর্তমান ফোন, WhatsApp ও ইমেইল দেওয়া আছে।"
          />
        </p>
      </div>
    </div>
    {/* UX plan §11 (R8) — leave with product in view, not a dead end. */}
    <InfoRail />
    </>
  );
}
