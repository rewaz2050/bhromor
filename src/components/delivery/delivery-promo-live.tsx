import { IconGift } from "@/components/ui/icons";
import { FIRST_FREE_DELIVERY_LIMIT } from "@/lib/delivery";

/**
 * Per-user first-10-free promo note — no global counter: every customer's
 * first 10 orders ride free inside Sunamganj city Zone A.
 */
export default function DeliveryPromoLive() {
  return (
    <div className="mt-8 rounded-2xl bg-gradient-to-r from-gold-50 to-amber-50 p-5 ring-1 ring-gold-200">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-800 text-gold-300">
          <IconGift className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-forest-900">
            🎉 প্রতিটি কাস্টমারের প্রথম {FIRST_FREE_DELIVERY_LIMIT} টি অর্ডারে ডেলিভারি সম্পূর্ণ ফ্রি!
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            শুধুমাত্র সুনামগঞ্জ সিটি (এ জোন)-এর ভেতরে। একই মোবাইল নম্বরে ১০টি অর্ডার
            সম্পন্ন হওয়ার পর এ জোনেও সাধারণ চার্জ (৳৩০) প্রযোজ্য হবে। বাইরে: Zone B ৳৫০,
            Zone C ৳৭০, Zone D (সদরের বাইরে / অন্য জেলা) ৳১০০ · Zone D-তে সর্বনিম্ন ৳৫০০ অর্ডার।
          </p>
        </div>
      </div>
    </div>
  );
}
