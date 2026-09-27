import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import InfoRail from "@/components/info/info-rail";
import L from "@/components/i18n/l";
import { ButtonLink, Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";

/**
 * /story — the brand story (UX plan §11, R9): image-heavy, chaptered, about
 * the cloth and the people rather than the platform (that is /about). Every
 * picture is an owned editorial or product-detail asset already shipped in
 * /public — nothing stock, nothing invented. Server-rendered; bilingual via
 * the <L> leaf so the page still ships as static HTML.
 */

export const metadata: Metadata = {
  title: "Our Story — PROSANTI",
  description:
    "The cloth, the hands and the calm behind PROSANTI: gamcha and lungi weaves, hand-finished panjabis, local shops in Sunamganj and a delivery you can watch arrive.",
};

const CHAPTERS = [
  {
    id: "cloth",
    eyebrow: { en: "Chapter 1 · The cloth", bn: "পর্ব ১ · কাপড়" },
    title: { en: "Cotton that already knows this weather.", bn: "যে সুতি এই আবহাওয়াকে আগে থেকেই চেনে।" },
    body: {
      en: "A gamcha dries on a veranda in twenty minutes. A lungi check is woven, not printed, so it fades evenly for years. We start from textiles that were made for humid mornings and monsoon afternoons — and choose the pieces that still feel good on the tenth wash.",
      bn: "বারান্দায় একটা গামছা বিশ মিনিটে শুকায়। লুঙ্গির চেক বোনা, ছাপা নয় — তাই বছরের পর বছর সমানভাবে রং হালকা হয়। আমরা শুরু করি সেই কাপড় থেকে যা ভেজা সকাল আর বর্ষার বিকেলের জন্যই তৈরি — আর বাছি সেই পিসগুলো যা দশম ধোয়ার পরেও গায়ে ভালো লাগে।",
    },
    image: {
      src: "/images/products/gamcha.jpg",
      alt: "A hand-woven gamcha in red and white checks",
    },
    detail: {
      src: "/images/products/lungi.jpg",
      alt: "A checked lungi folded flat, showing the woven pattern",
    },
  },
  {
    id: "hands",
    eyebrow: { en: "Chapter 2 · The hands", bn: "পর্ব ২ · হাত" },
    title: { en: "Finished by people, not by a label.", bn: "লেবেল নয়, মানুষের হাতে শেষ হওয়া।" },
    body: {
      en: "The tonal embroidery on a panjabi placket is done after the garment is cut, by someone who will do the next one slightly differently. The gold border on a three-piece is stitched, not glued. Those small irregularities are the point: they are what a photograph of the real piece shows you, and what we ask every shop to photograph honestly.",
      bn: "পাঞ্জাবির প্ল্যাকেটের টোনাল কাজটা কাপড় কাটার পরে হয় — যিনি করেন, পরেরটা একটু অন্যরকম করবেন। থ্রি-পিসের সোনালি পাড় সেলাই করা, আঠা দিয়ে লাগানো নয়। এই ছোট অসমতাগুলোই আসল কথা: আসল পিসের ছবি ঠিক এটাই দেখায়, আর প্রতিটি দোকানকে আমরা বলি সততার সাথে সেটাই তুলতে।",
    },
    image: {
      src: "/images/products/panjabi-detail.jpg",
      alt: "Tonal embroidery on forest-green panjabi cloth",
    },
    detail: {
      src: "/images/products/three-piece-detail.jpg",
      alt: "A hand-finished gold border on emerald fabric",
    },
  },
  {
    id: "town",
    eyebrow: { en: "Chapter 3 · The town", bn: "পর্ব ৩ · শহর" },
    title: { en: "Sunamganj shops, on one shelf.", bn: "সুনামগঞ্জের দোকান, এক তাকে।" },
    body: {
      en: "PROSANTI is not a warehouse. Every product is sold by a named local shop, packed by the shop, and carried by a rider you can watch on the map. The shop's own name is on the order, the shop's own phone answers the question — we just make the shelf calm and the delivery quick.",
      bn: "PROSANTI কোনো গুদাম নয়। প্রতিটি পণ্য বিক্রি করে নাম-জানা একটা স্থানীয় দোকান, প্যাক করে দোকানই, আর নিয়ে আসেন এমন একজন রাইডার যাঁকে আপনি ম্যাপে দেখতে পান। অর্ডারে দোকানের নিজের নাম, প্রশ্নের উত্তর দেয় দোকানের নিজের ফোন — আমরা শুধু তাকটা শান্ত আর ডেলিভারিটা দ্রুত রাখি।",
    },
    image: {
      src: "/images/editorial/journal-heritage.jpg",
      alt: "A man wearing a checked lungi in the quiet morning light of a veranda",
    },
    detail: {
      src: "/images/editorial/prosanti-craft.jpg",
      alt: "Craft detail from the PROSANTI editorial shoot",
    },
  },
] as const;

export default function StoryPage() {
  return (
    <>
      {/* Opening image — full-bleed, the calm of the brand before any words. */}
      <section className="relative isolate overflow-hidden bg-forest-950 text-ivory-50">
        <div className="absolute inset-0">
          <Image
            src="/images/editorial/hero-prosanti.jpg"
            alt="A woman in an emerald three-piece beside a sunlit heritage-home window"
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-70"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-950/40 to-forest-950/10" />
        </div>
        <div className="relative mx-auto flex min-h-[70vh] w-full max-w-7xl flex-col justify-end px-4 pb-14 pt-32 sm:px-6 lg:px-8 lg:pb-20">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.38em] text-gold-200">
            <L en="Our story" bn="আমাদের গল্প" />
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-normal leading-[1.05] tracking-tight sm:text-6xl">
            <L
              en={<>The cloth, the hands, <span className="italic text-gold-200">and the calm.</span></>}
              bn={<>কাপড়, হাত, <span className="italic text-gold-200">আর প্রশান্তি।</span></>}
            />
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-ivory-100/85">
            <L
              en="প্রশান্তি means calm. This is how a shelf of local cloth, a few careful hands and a rider on a map add up to it."
              bn="প্রশান্তি মানে নিশ্চিন্তি। স্থানীয় কাপড়ের একটা তাক, কয়েকটা যত্নশীল হাত আর ম্যাপে একজন রাইডার মিলে কীভাবে সেটা হয় — এই তার গল্প।"
            />
          </p>
        </div>
      </section>

      {/* Chapters — alternate image/text, each with a second detail frame. */}
      {CHAPTERS.map((c, i) => (
        <section
          key={c.id}
          id={c.id}
          aria-labelledby={`story-${c.id}`}
          data-testid={`story-chapter-${c.id}`}
          className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
        >
          <div className={`grid items-center gap-10 lg:grid-cols-12 lg:gap-16 ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
            <div className="relative lg:col-span-7">
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-ivory-100 ring-1 ring-line sm:aspect-[5/4]">
                <Image src={c.image.src} alt={c.image.alt} fill sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
              </div>
              <div className="absolute -bottom-6 right-4 hidden aspect-[3/4] w-32 overflow-hidden bg-ivory-100 shadow-lg ring-1 ring-line sm:block sm:w-44 lg:-right-8">
                <Image src={c.detail.src} alt={c.detail.alt} fill sizes="176px" className="object-cover" />
              </div>
            </div>
            <div className="lg:col-span-5">
              <Eyebrow>
                <L en={c.eyebrow.en} bn={c.eyebrow.bn} />
              </Eyebrow>
              <h2 id={`story-${c.id}`} className="mt-4 font-display text-3xl leading-tight text-forest-900 sm:text-4xl">
                <L en={c.title.en} bn={c.title.bn} />
              </h2>
              <p className="mt-5 text-base leading-8 text-ink-soft">
                <L en={c.body.en} bn={c.body.bn} />
              </p>
            </div>
          </div>
        </section>
      ))}

      {/* Closing — what the calm is for, then the two doors. */}
      <section className="bg-forest-950 text-ivory-50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-24">
          <div className="relative aspect-[4/3] overflow-hidden ring-1 ring-ivory-50/10">
            <Image
              src="/images/editorial/journal-women.jpg"
              alt="A woman in an emerald three-piece beside a sunlit heritage-home window"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.38em] text-gold-200">
              <L en="Chapter 4 · The calm" bn="পর্ব ৪ · প্রশান্তি" />
            </p>
            <h2 className="mt-4 font-display text-3xl leading-tight sm:text-4xl">
              <L en="Order at 4:10. Wear it at 5." bn="৪:১০-এ অর্ডার। ৫টায় গায়ে।" />
            </h2>
            <p className="mt-5 max-w-lg text-base leading-8 text-ivory-100/85">
              <L
                en="Cash on delivery, a tracker link you can send to whoever is home, a rider you can call, and a shop that answers by name. That is the whole idea of প্রশান্তি — nothing to worry about between tapping and wearing."
                bn="ক্যাশ অন ডেলিভারি, বাড়িতে যিনি আছেন তাঁকে পাঠানোর মতো একটা ট্র্যাকার লিংক, ফোন করা যায় এমন রাইডার, আর নাম ধরে উত্তর দেওয়া দোকান। প্রশান্তির পুরো ভাবনাটাই এই — ট্যাপ করা থেকে গায়ে দেওয়া পর্যন্ত চিন্তার কিছু নেই।"
              />
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/shop" className="bg-ivory-100 text-forest-950 hover:bg-gold-200">
                <L en="Shop the shelf" bn="তাক থেকে কিনুন" />
                <IconArrowRight className="h-4 w-4" />
              </ButtonLink>
              <Link
                href="/shops"
                className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-ivory-100/90 underline-offset-4 hover:underline"
              >
                <L en="Meet the shops" bn="দোকানগুলো দেখুন" />
              </Link>
              <Link
                href="/about"
                className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-ivory-100/90 underline-offset-4 hover:underline"
              >
                <L en="How PROSANTI works" bn="PROSANTI কীভাবে কাজ করে" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <InfoRail />
    </>
  );
}
