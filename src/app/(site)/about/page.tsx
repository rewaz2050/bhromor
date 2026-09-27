import type { Metadata } from "next";
import InfoRail from "@/components/info/info-rail";
import Image from "next/image";
import { ButtonLink, Eyebrow } from "@/components/ui/primitives";
import L from "@/components/i18n/l";
import { IconArrowRight, IconBox, IconLeaf, IconShield, IconTruck } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "About",
  description:
    "PROSANTI (প্রশান্তি) — a premium commerce and rapid local delivery platform built on trust, simplicity and transparent fulfilment.",
};

export default function AboutPage() {
  return (
    <>
      {/* Intro */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20">
        <Eyebrow><L en="About PROSANTI" bn="PROSANTI-র কথা" /></Eyebrow>
        <div className="mt-6 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <h1 className="font-display text-4xl font-medium leading-tight tracking-tight text-forest-900 sm:text-5xl">
              <L en={<>প্রশান্তি — the calm way to shop &amp; receive.</>} bn="প্রশান্তি — নিশ্চিন্তে কেনা, নিশ্চিন্তে পাওয়া।" />
            </h1>
            <div className="mt-6 space-y-5 leading-8 text-ink-soft">
              <p>
                <L
                  en="PROSANTI begins with a small, carefully chosen catalog of premium clothing — but it is designed as a commerce platform, not a clothing store. The same foundation will carry lifestyle products, home goods and entirely new categories as the brand grows."
                  bn="PROSANTI শুরু হচ্ছে অল্প কিছু, যত্নে বাছাই করা ভালো পোশাক দিয়ে — কিন্তু এটা বানানো হয়েছে একটা কমার্স প্ল্যাটফর্ম হিসেবে, শুধু কাপড়ের দোকান হিসেবে নয়। ব্র্যান্ড বড় হলে এই ভিতের ওপরেই আসবে লাইফস্টাইল, ঘরের জিনিস আর একেবারে নতুন ক্যাটাগরি।"
                />
              </p>
              <p>
                <L
                  en={<>Our core promise is simple: discover premium products, order with confidence, and know where your order is until it reaches your door — with a <strong className="text-forest-800">45–50 minute rapid delivery target</strong> inside our service area.</>}
                  bn={<>আমাদের কথা সোজা: ভালো পণ্য খুঁজে নিন, ভরসা করে অর্ডার করুন, আর দরজায় পৌঁছানো পর্যন্ত জানুন অর্ডারটা কোথায় — সার্ভিস এলাকার ভেতরে <strong className="text-forest-800">৪৫–৫০ মিনিটে পৌঁছানোর লক্ষ্য</strong> নিয়ে।</>}
                />
              </p>
            </div>
          </div>
          <div className="arch relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden bg-ivory-200 ring-1 ring-line lg:max-w-none">
            <Image
              src="/images/products/panjabi-detail.jpg"
              alt="Detail of premium green panjabi fabric with tonal embroidery"
              fill
              sizes="(min-width: 1024px) 44vw, 92vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: IconShield,
              title: "Trust first",
              titleBn: "আগে বিশ্বাস",
              text: "Real product information, transparent prices and delivery charges, a clear return policy, and a real support channel.",
              textBn: "পণ্যের আসল তথ্য, পরিষ্কার দাম আর ডেলিভারি চার্জ, সোজা ফেরতের নিয়ম, আর সত্যিকারের একটা সাপোর্ট চ্যানেল।",
            },
            {
              icon: IconTruck,
              title: "Fast, honest delivery",
              titleBn: "দ্রুত, সৎ ডেলিভারি",
              text: "Zone-based charges and arrival estimates — a 45–50 minute target where operations can genuinely hold it.",
              textBn: "জোন ধরে চার্জ আর পৌঁছানোর সময় — যেখানে সত্যিই পারি, সেখানে ৪৫–৫০ মিনিটের লক্ষ্য।",
            },
            {
              icon: IconBox,
              title: "Tracked to the door",
              titleBn: "দরজা পর্যন্ত ট্র্যাক",
              text: "A calm four-step order timeline: placed, confirmed, picked up, delivered — no chasing, no guessing.",
              textBn: "চার ধাপের শান্ত টাইমলাইন: অর্ডার হয়েছে, কনফার্ম, রাইডার নিয়েছে, পৌঁছে গেছে — খোঁজাখুঁজি নেই, আন্দাজ নেই।",
            },
            {
              icon: IconLeaf,
              title: "Curated, not crowded",
              titleBn: "বাছাই করা, ভিড় নয়",
              text: "A deliberately small catalog. Every piece is chosen for quality, so a short shelf never feels empty.",
              textBn: "ইচ্ছা করেই ছোট ক্যাটালগ। প্রতিটি পিস মানের জন্য বাছা, তাই ছোট শেলফও কখনো খালি লাগে না।",
            },
          ].map(({ icon: Icon, title, titleBn, text, textBn }) => (
            <div key={title} className="rounded-3xl bg-paper p-7 ring-1 ring-line">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-100 text-forest-800">
                <Icon className="h-6 w-6" />
              </span>
              <h2 className="font-display mt-5 text-xl font-medium text-forest-900">
                <L en={title} bn={titleBn} />
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                <L en={text} bn={textBn} />
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Ops + CTA */}
      <section className="border-y border-line bg-forest-900">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 text-ivory-100 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="font-display text-3xl font-medium leading-snug">
              <L en="Launching inside a service area we can reliably serve." bn="শুরু সেই এলাকায়, যেখানে কথা রাখতে পারি।" />
            </h2>
            <p className="mt-4 leading-7 text-ivory-100/70">
              <L
                en="We expand our delivery zones only when we can keep the promise — measured, not assumed. Growth is deliberate: build small, launch, measure, learn, improve, scale."
                bn="ডেলিভারি এলাকা তখনই বাড়াই, যখন কথা রাখা যায় — মেপে, আন্দাজে নয়। বড় হওয়াটা ভেবেচিন্তে: ছোট করে বানানো, চালু, মাপা, শেখা, শোধরানো, তারপর বাড়ানো।"
              />
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <ButtonLink href="/shop" variant="gold">
                <L en="Explore the catalog" bn="ক্যাটালগ দেখুন" /> <IconArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/delivery" variant="glass">
                <L en="See delivery zones" bn="ডেলিভারি জোন দেখুন" />
              </ButtonLink>
            </div>
          </div>
          <div className="arch relative aspect-[4/3] overflow-hidden bg-forest-800">
            <Image
              src="/images/products/gamcha.jpg"
              alt="Folded traditional gamcha towels with red and cream weave"
              fill
              sizes="(min-width: 1024px) 44vw, 92vw"
              className="object-cover opacity-90"
            />
          </div>
        </div>
      </section>
      {/* UX plan §11 (R8) — leave with product in view, not a dead end. */}
      <InfoRail />
    </>
  );
}
