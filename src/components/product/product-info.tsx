import Link from "next/link";
import type { Product } from "@/lib/catalog";
import { gsmBand, hasFabricInfo } from "@/lib/fabric";
import { availableSizes, sizeAvailability } from "@/lib/size-stock";
import { bnDigits } from "@/lib/arrival";
import L from "@/components/i18n/l";
import { IconCheck } from "@/components/ui/icons";

/**
 * Product information accordion (UX plan §4, R10) — native <details>, so it
 * works without JS and keeps the page short on a phone:
 *   1. বিবরণ ও কাপড় (open)  — description, fabric rows, transparency
 *   2. যত্ন                   — only when the shop declared care rows
 *   3. ফিট ও মাপ             — per-size availability, fit rows, how to measure
 *   4. ডেলিভারি ও ফেরত
 * Every heading and fixed line is bilingual through <L>; the shop's own rows
 * are printed as declared. No generic size chart is invented: the fit block
 * says plainly when no verified chart exists for the piece.
 */

const CARE_RE = /care|wash|iron|dry|clean|bleach/i;
const FIT_RE = /^(fit|size|length|width|chest|shoulder|sleeve|waist|includes|contents)$/i;

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 border-b border-line pb-3 text-sm">
    <dt className="font-medium text-ink">{label}</dt>
    <dd className="text-right text-ink-soft">{value}</dd>
  </div>
);

export default function ProductInfo({ product }: { product: Product }) {
  const care = product.details.filter((d) => CARE_RE.test(d.label));
  const fit = product.details.filter((d) => FIT_RE.test(d.label) && !CARE_RE.test(d.label));
  const fabric = product.details.filter((d) => !care.includes(d) && !fit.includes(d));
  const oneSize = product.sizes.length === 1 && /^(free|one) size$/i.test(product.sizes[0]);
  const gone = product.sizes.filter((s) => sizeAvailability(product, s).state === "out");
  const here = availableSizes(product);

  return (
    <div className="info-accordion lg:col-span-2" data-testid="product-info">
      <details open data-testid="info-details">
        <summary>
          <L en="Details & fabric" bn="বিবরণ ও কাপড়" />
        </summary>
        <div className="info-body space-y-5">
          {product.description.length > 0 ? (
            <div className="space-y-4">
              {product.description.map((para) => (
                <p key={para.slice(0, 32)} className="leading-8 text-ink-soft">
                  {para}
                </p>
              ))}
            </div>
          ) : null}
          {fabric.length > 0 ? (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {fabric.map((d) => (
                <Row key={d.label} label={d.label} value={d.value} />
              ))}
            </dl>
          ) : null}
          {hasFabricInfo(product) ? (
            <div className="space-y-3" data-testid="info-transparency">
              {product.qualityChecked ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-forest-50 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-forest-800">
                  <IconCheck className="h-3.5 w-3.5" /> <L en="Quality checked" bn="মান যাচাই করা" />
                </p>
              ) : null}
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {product.fabricGsm ? (
                  <div className="flex justify-between gap-4 border-b border-line pb-3 text-sm">
                    <dt className="font-medium text-ink">
                      <L en="Fabric weight" bn="কাপড়ের ওজন" />
                    </dt>
                    <dd className="text-right text-ink-soft">
                      <L
                        en={`${product.fabricGsm} GSM · ${gsmBand(product.fabricGsm)}`}
                        bn={`${bnDigits(String(product.fabricGsm))} GSM · ${gsmBand(product.fabricGsm)}`}
                      />
                    </dd>
                  </div>
                ) : null}
                {product.manufacturer ? (
                  <div className="flex justify-between gap-4 border-b border-line pb-3 text-sm">
                    <dt className="font-medium text-ink">
                      <L en="Woven by" bn="বুনেছেন" />
                    </dt>
                    <dd className="text-right text-ink-soft">{product.manufacturer}</dd>
                  </div>
                ) : null}
              </dl>
              {product.testReportUrl ? (
                <p className="text-sm text-ink-soft">
                  <L en="Fabric test report on file — " bn="কাপড়ের টেস্ট রিপোর্ট আছে — " />
                  <a
                    href={product.testReportUrl}
                    target="_blank"
                    rel="noopener nofollow"
                    className="font-medium text-forest-700 underline underline-offset-4"
                  >
                    <L en="read it here" bn="এখানে পড়ুন" />
                  </a>
                  .
                </p>
              ) : null}
              <p className="text-xs leading-6 text-ink-soft/80">
                <L
                  en="These details are declared by the shop for this piece — we publish what the maker states, never a generic “premium” label."
                  bn="এই তথ্যগুলো দোকান নিজে এই পণ্যের জন্য জানিয়েছে — আমরা যা বলা হয়েছে তাই ছাপি, কোনো সাধারণ “প্রিমিয়াম” লেবেল নয়।"
                />
              </p>
            </div>
          ) : null}
          {product.description.length === 0 && fabric.length === 0 && !hasFabricInfo(product) ? (
            <p className="text-sm text-ink-soft">
              <L
                en="The shop has not added more detail for this piece yet."
                bn="দোকান এই পণ্যের আর কোনো বিবরণ এখনো দেয়নি।"
              />
            </p>
          ) : null}
        </div>
      </details>

      {care.length > 0 ? (
        <details data-testid="info-care">
          <summary>
            <L en="Care" bn="যত্ন" />
          </summary>
          <div className="info-body">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {care.map((d) => (
                <Row key={d.label} label={d.label} value={d.value} />
              ))}
            </dl>
          </div>
        </details>
      ) : null}

      <details data-testid="info-fit">
        <summary>
          <L en="Fit & measurements" bn="ফিট ও মাপ" />
        </summary>
        <div className="info-body space-y-4 text-sm leading-7 text-ink-soft">
          {product.sizes.length > 0 ? (
            <p data-testid="info-sizes">
              <L en="Sizes: " bn="সাইজ: " />
              <span className="font-medium text-forest-800">
                {here.length > 0 ? here.join(" · ") : <L en="none right now" bn="এখন একটাও নেই" />}
              </span>
              {gone.length > 0 ? (
                <>
                  {" · "}
                  <span className="text-ink-soft/80">
                    <L en={`${gone.join(", ")} sold out`} bn={`${gone.join(", ")} শেষ`} />
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
          {fit.length > 0 ? (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {fit.map((d) => (
                <Row key={d.label} label={d.label} value={d.value} />
              ))}
            </dl>
          ) : null}
          {oneSize ? (
            <p>
              <L
                en="One size is a product label, not a guarantee of fit. Check the listed dimensions and ask the shop if you need a specific measurement."
                bn="“ওয়ান সাইজ” একটা লেবেল মাত্র, ফিটের নিশ্চয়তা নয়। দেওয়া মাপগুলো দেখুন, নির্দিষ্ট মাপ লাগলে দোকানকে জিজ্ঞেস করুন।"
              />
            </p>
          ) : product.sizes.length > 0 ? (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-forest-900">
                <L en="Before choosing your size" bn="সাইজ বাছার আগে" />
              </h3>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  <L
                    en="Lay a similar, well-fitting garment flat without stretching it."
                    bn="ভালো ফিট করে এমন একটা পোশাক না টেনে সমান করে বিছান।"
                  />
                </li>
                <li>
                  <L
                    en="Measure across the chest, shoulder seam to seam, and from the highest shoulder point to the hem."
                    bn="বুক আড়াআড়ি, কাঁধের সেলাই থেকে সেলাই, আর কাঁধের সবচেয়ে উঁচু জায়গা থেকে নিচ পর্যন্ত মাপুন।"
                  />
                </li>
                <li>
                  <L
                    en="Use the Size finder in the buy box, or send those numbers to the shop on WhatsApp before ordering."
                    bn="কেনার বক্সের সাইজ ফাইন্ডার ব্যবহার করুন, অথবা অর্ডারের আগে মাপগুলো WhatsApp-এ দোকানকে পাঠান।"
                  />
                </li>
              </ol>
            </>
          ) : null}
          <p className="border-l-2 border-gold-400 bg-ivory-100 p-4 text-xs leading-6">
            <L
              en="A verified size-by-size measurement chart is not yet available for this item. We don’t substitute a generic chart because fit varies by garment."
              bn="এই পণ্যের জন্য যাচাই করা সাইজ-ভিত্তিক মাপের চার্ট এখনো নেই। পোশাকভেদে ফিট আলাদা হয় বলে আমরা কোনো সাধারণ চার্ট বসাই না।"
            />
          </p>
        </div>
      </details>

      <details data-testid="info-delivery">
        <summary>
          <L en="Delivery & returns" bn="ডেলিভারি ও ফেরত" />
        </summary>
        <div className="info-body">
          <ul className="space-y-3 text-sm leading-7 text-ink-soft">
            <li>
              · <L en="7-day easy return & exchange on unworn items" bn="না-পরা পণ্যে ৭ দিনে সহজ ফেরত ও বদল" />
            </li>
            {product.warrantyDays ? (
              <li>
                ·{" "}
                <L
                  en={`${product.warrantyDays}-day warranty on this item — claim it from the track page within ${product.warrantyDays} days of delivery`}
                  bn={`এই পণ্যে ${bnDigits(String(product.warrantyDays))} দিনের ওয়ারেন্টি — ডেলিভারির ${bnDigits(String(product.warrantyDays))} দিনের মধ্যে ট্র্যাক পেজ থেকে দাবি করুন`}
                />
              </li>
            ) : null}
            <li>
              · <L en="Quality checked before every dispatch" bn="প্রতিটি পাঠানোর আগে মান যাচাই" />
            </li>
            <li>
              · <L en="Cash on delivery across Sunamganj Sadar" bn="সুনামগঞ্জ সদর জুড়ে ক্যাশ অন ডেলিভারি" />
            </li>
            <li>
              · <L en="Questions? " bn="প্রশ্ন আছে? " />
              <Link href="/contact" className="font-medium text-forest-700 underline underline-offset-4">
                <L en="Contact support" bn="সাপোর্টে লিখুন" />
              </Link>
            </li>
          </ul>
        </div>
      </details>
    </div>
  );
}
