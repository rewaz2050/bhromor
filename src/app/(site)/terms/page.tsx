import type { Metadata } from "next";
import InfoRail from "@/components/info/info-rail";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/primitives";
import L from "@/components/i18n/l";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms and conditions for using the PROSANTI store and services.",
};

/**
 * Terms & conditions — bilingual (UX plan §11, R10). Server component with
 * `<L en bn />` leaves; the Bengali says the same thing, not less.
 */
export default function TermsPage() {
  return (
    <>
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <Eyebrow><L en="Clear rules" bn="পরিষ্কার নিয়ম" /></Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        <L en="Terms & conditions" bn="শর্তাবলি" />
      </h1>
      <p className="mt-3 text-sm text-ink-soft">
        <L en="Last updated: September 2026" bn="সর্বশেষ হালনাগাদ: সেপ্টেম্বর ২০২৬" />
      </p>

      <div className="prose-prosanti mt-8">
        <p>
          <L
            en="By using prosanti.store you agree to these terms. They keep shopping fair and honest for everyone."
            bn="prosanti.store ব্যবহার করলে আপনি এই শর্তগুলোতে সম্মত হচ্ছেন। এগুলো সবার জন্য কেনাকাটা ন্যায্য ও সৎ রাখে।"
          />
        </p>

        <h2><L en="Orders & pricing" bn="অর্ডার ও দাম" /></h2>
        <ul>
          <li>
            <L
              en="Product prices are shown in Bangladeshi Taka (৳) and include VAT. Delivery charges are zone-based and displayed before you confirm."
              bn="পণ্যের দাম বাংলাদেশি টাকায় (৳) দেখানো হয় এবং ভ্যাটসহ। ডেলিভারি চার্জ এলাকাভিত্তিক, অর্ডার নিশ্চিত করার আগেই দেখানো হয়।"
            />
          </li>
          <li>
            <L
              en="An order is confirmed when we accept it and send the confirmation. We may cancel an order if an item is unavailable, the address is outside the service area, or payment cannot be collected."
              bn="আমরা গ্রহণ করে নিশ্চিতকরণ পাঠালে অর্ডার নিশ্চিত হয়। পণ্য না থাকলে, ঠিকানা সেবা-এলাকার বাইরে হলে, বা পেমেন্ট নেওয়া না গেলে আমরা অর্ডার বাতিল করতে পারি।"
            />
          </li>
          <li>
            <L
              en="Product images are representative; descriptions state real fabric, fit and care details."
              bn="পণ্যের ছবি প্রতিনিধিত্বমূলক; বিবরণে আসল কাপড়, ফিট ও যত্নের তথ্য দেওয়া থাকে।"
            />
          </li>
          <li>
            <L
              en="Coupons, free-delivery thresholds and Smart Card rewards apply as shown at checkout; one coupon per order, and rewards are not exchangeable for cash."
              bn="কুপন, ফ্রি-ডেলিভারির সীমা আর স্মার্ট কার্ডের পুরস্কার চেকআউটে যেভাবে দেখানো হয় সেভাবেই প্রযোজ্য; প্রতি অর্ডারে একটি কুপন, আর পুরস্কার নগদে বদলানো যায় না।"
            />
          </li>
        </ul>

        <h2><L en="Delivery" bn="ডেলিভারি" /></h2>
        <ul>
          <li>
            <L
              en="The 45–50 minute window is a service target inside the operating area, not a guarantee for every circumstance. Estimates shown at checkout are honest and zone-based."
              bn="৪৫–৫০ মিনিটের সময়সীমা সেবা-এলাকার ভেতরে আমাদের লক্ষ্য, সব পরিস্থিতিতে নিশ্চয়তা নয়। চেকআউটে দেখানো আনুমানিক সময় সৎ ও এলাকাভিত্তিক।"
            />
          </li>
          <li>
            <L
              en="Please ensure someone is available at the delivery address and that the phone number provided is correct."
              bn="ডেলিভারির ঠিকানায় কেউ যেন থাকেন আর দেওয়া ফোন নম্বরটা যেন ঠিক হয়, সেটা নিশ্চিত করুন।"
            />
          </li>
        </ul>

        <h2><L en="Payment" bn="পেমেন্ট" /></h2>
        <p>
          <L
            en="Cash on Delivery is the primary method at launch: pay the rider the exact total on delivery. Future online payment methods will be governed by the applicable gateway terms."
            bn="শুরুতে ক্যাশ অন ডেলিভারিই মূল পদ্ধতি: ডেলিভারির সময় রাইডারকে ঠিক মোট অঙ্কটা দিন। ভবিষ্যতের অনলাইন পেমেন্ট সংশ্লিষ্ট গেটওয়ের শর্তে চলবে।"
          />
        </p>

        <h2><L en="Returns & accountability" bn="ফেরত ও দায়বদ্ধতা" /></h2>
        <p>
          <L
            en="Returns and exchanges follow the"
            bn="ফেরত ও বদল চলে"
          />{" "}
          <Link href="/returns"><L en="Returns & Exchange policy" bn="ফেরত ও বদল নীতি" /></Link>
          <L
            en=". We are responsible for items that arrive damaged or incorrect and will replace or refund them promptly."
            bn=" অনুযায়ী। ক্ষতিগ্রস্ত বা ভুল পণ্য পৌঁছালে দায় আমাদের — দ্রুত বদলে দিই বা টাকা ফেরত দিই।"
          />
        </p>

        <h2><L en="Content & conduct" bn="কনটেন্ট ও আচরণ" /></h2>
        <ul>
          <li>
            <L
              en="All content on this site (text, images, brand marks) belongs to PROSANTI and may not be reused without permission."
              bn="এই সাইটের সব কনটেন্ট (লেখা, ছবি, ব্র্যান্ড চিহ্ন) PROSANTI-র; অনুমতি ছাড়া পুনঃব্যবহার করা যাবে না।"
            />
          </li>
          <li>
            <L
              en="You agree not to misuse the site, attempt unauthorised access, or submit false information — including reviews of pieces you did not buy."
              bn="আপনি সাইটের অপব্যবহার, অননুমোদিত প্রবেশের চেষ্টা বা ভুয়া তথ্য দেবেন না — না-কেনা পণ্যের রিভিউসহ।"
            />
          </li>
        </ul>

        <h2><L en="Limits of liability" bn="দায়ের সীমা" /></h2>
        <p>
          <L
            en="Our liability is limited to the value of the products ordered. To the extent permitted by law, we are not liable for indirect losses arising from use of the site or delays outside our reasonable control."
            bn="আমাদের দায় অর্ডার করা পণ্যের মূল্যের মধ্যে সীমাবদ্ধ। আইন যতটা অনুমতি দেয়, সাইট ব্যবহারজনিত পরোক্ষ ক্ষতি বা আমাদের যুক্তিসঙ্গত নিয়ন্ত্রণের বাইরের দেরির জন্য আমরা দায়ী নই।"
          />
        </p>

        <h2><L en="Changes & contact" bn="পরিবর্তন ও যোগাযোগ" /></h2>
        <p>
          <L
            en="We may update these terms; the latest version is always on this page. Questions? See the"
            bn="আমরা এই শর্তাবলি হালনাগাদ করতে পারি; সর্বশেষ সংস্করণ সবসময় এই পেজেই থাকে। প্রশ্ন থাকলে দেখুন"
          />{" "}
          <Link href="/contact"><L en="Contact page" bn="যোগাযোগ পেজ" /></Link>
          <L en="." bn="।" />
        </p>
      </div>
    </div>
    {/* UX plan §11 (R8) — leave with product in view, not a dead end. */}
    <InfoRail />
    </>
  );
}
