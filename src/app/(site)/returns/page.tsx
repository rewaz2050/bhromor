import type { Metadata } from "next";
import InfoRail from "@/components/info/info-rail";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/primitives";
import L from "@/components/i18n/l";
import { ExchangeForm } from "@/components/returns/exchange-form";

export const metadata: Metadata = {
  title: "Returns & Exchange",
  description: "PROSANTI return and exchange policy — 7-day returns on unworn items, easy process.",
};

const STEPS = [
  {
    title: "Request",
    titleBn: "জানান",
    text: "Contact support (phone, WhatsApp or the online form below) within 7 days of delivery with your order ID and the item you wish to return or exchange.",
    textBn: "ডেলিভারির ৭ দিনের মধ্যে সাপোর্টে জানান (ফোন, WhatsApp বা নিচের ফর্ম) — অর্ডার আইডি আর কোন পণ্যটা ফেরত/বদল করতে চান, সেটুকুই যথেষ্ট।",
  },
  {
    title: "Review",
    titleBn: "যাচাই",
    text: "We confirm eligibility — items must be unworn, unwashed, with original tags and packaging. Certain items are excluded (see below).",
    textBn: "আমরা মিলিয়ে দেখি — পণ্য না-পরা, না-ধোয়া, ট্যাগ ও প্যাকেট সহ হতে হবে। কিছু পণ্য এর বাইরে (নিচে দেখুন)।",
  },
  {
    title: "Pickup & resolve",
    titleBn: "পিকআপ ও সমাধান",
    text: "Our rider collects the item during a scheduled window, or we guide you to the nearest drop point. Exchange ships on arrival; refunds (where applicable) are processed within 3–5 working days.",
    textBn: "নির্দিষ্ট সময়ে আমাদের রাইডার পণ্যটা নিয়ে যায়, নয়তো কাছের ড্রপ পয়েন্ট বলে দিই। পণ্য পৌঁছালেই বদলি পাঠানো হয়; ফেরত (যেখানে প্রযোজ্য) ৩–৫ কর্মদিবসে।",
  },
];

export default function ReturnsPage() {
  return (
    <>
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16 space-y-12">
      <div>
        <Eyebrow><L en="Easy, fair, clear" bn="সহজ, ন্যায্য, পরিষ্কার" /></Eyebrow>
        <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
          <L en="Returns & exchange" bn="ফেরত ও বদল" />
        </h1>
        <p className="mt-4 leading-7 text-ink-soft">
          <L
            en="We want the fit and feel to be right. If it is not, you have 7 days from delivery to request a return or exchange on most items."
            bn="মাপ আর অনুভূতি ঠিক হওয়াটাই আমাদের চাওয়া। না হলে, বেশিরভাগ পণ্যে ডেলিভারির ৭ দিনের মধ্যে ফেরত বা বদলের অনুরোধ করতে পারেন।"
          />
        </p>

        <ol className="mt-8 space-y-5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-5 rounded-3xl bg-paper p-6 ring-1 ring-line">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-800 font-display text-lg font-semibold text-ivory-50">
                <L en={index + 1} bn={"১২৩"[index]} />
              </span>
              <div>
                <h2 className="font-display text-xl font-medium text-forest-900">
                  <L en={step.title} bn={step.titleBn} />
                </h2>
                <p className="mt-2 text-sm leading-7 text-ink-soft">
                  <L en={step.text} bn={step.textBn} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Interactive Size Exchange & Return Form */}
      <ExchangeForm />

      <div className="prose-prosanti">
        <h2><L en="Policy notes" bn="নিয়মের কথা" /></h2>
        <ul>
          <li>
            <L
              en={<>Return window: <strong>7 days from delivery</strong>.</>}
              bn={<>ফেরতের সময়: <strong>ডেলিভারির ৭ দিন</strong>।</>}
            />
          </li>
          <li>
            <L
              en="Items must be unworn, unwashed, undamaged, with original tags and packaging."
              bn="পণ্য না-পরা, না-ধোয়া, অক্ষত, আসল ট্যাগ ও প্যাকেট সহ হতে হবে।"
            />
          </li>
          <li>
            <L
              en={<><strong>Not eligible:</strong> innerwear, and items marked “Final sale” — these are noted on the product page.</>}
              bn={<><strong>ফেরত হয় না:</strong> ইনারওয়্যার আর “ফাইনাল সেল” লেখা পণ্য — পণ্যের পেজেই লেখা থাকে।</>}
            />
          </li>
          <li>
            <L
              en="Size exchanges ship free inside the service area when the requested size is in stock."
              bn="সার্ভিস এলাকার ভেতরে সাইজ বদল ফ্রি — চাওয়া সাইজটা স্টকে থাকলে।"
            />
          </li>
          <li>
            <L
              en="If a product arrives damaged or incorrect, tell us within 48 hours with a photo — we replace it or refund promptly."
              bn="পণ্য নষ্ট বা ভুল এলে ৪৮ ঘণ্টার মধ্যে ছবিসহ জানান — সাথে সাথে বদলে দিই বা টাকা ফেরত।"
            />
          </li>
          <li>
            <L
              en="Cash-on-delivery orders can be refunded to bKash or bank transfer once online payments are enabled; during launch, exchanges are the fastest resolution."
              bn="অনলাইন পেমেন্ট চালু হলে ক্যাশ অন ডেলিভারির টাকা bKash বা ব্যাংকে ফেরত যাবে; আপাতত বদলই সবচেয়ে দ্রুত সমাধান।"
            />
          </li>
        </ul>
        <h2><L en="Start a return" bn="ফেরত শুরু করুন" /></h2>
        <p>
          <L
            en={<>The fastest way is using the form above or via phone call — both are listed on the <Link href="/contact">Contact page</Link>. Have your order ID ready.</>}
            bn={<>সবচেয়ে দ্রুত: ওপরের ফর্ম, নয়তো ফোন — দুটোই <Link href="/contact">যোগাযোগ পেজে</Link> আছে। অর্ডার আইডিটা হাতের কাছে রাখুন।</>}
          />
        </p>
      </div>
    </div>
    {/* UX plan §11 (R8) — leave with product in view, not a dead end. */}
    <InfoRail />
    </>
  );
}
