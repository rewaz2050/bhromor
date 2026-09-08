import Link from "next/link";
import {
  IconShield,
  IconBox,
  IconTruck,
  IconCheck,
} from "@/components/ui/icons";

const ITEMS = [
  {
    icon: IconShield,
    title: "Cash on delivery",
    text: "Pay when your order arrives.",
    href: "/faq",
  },
  {
    icon: IconBox,
    title: "Quality checked",
    text: "Carefully checked before dispatch.",
    href: "/about",
  },
  {
    icon: IconCheck,
    title: "Exchange guidance",
    text: "Read eligibility before ordering.",
    href: "/returns",
  },
  {
    icon: IconTruck,
    title: "Transparent delivery",
    text: "Area-based fee shown before placing your order.",
    href: "/delivery",
  },
];

export default function CheckoutAssurance() {
  return (
    <section
      aria-label="Order with confidence"
      className="mt-6 grid grid-cols-2 gap-3"
    >
      {ITEMS.map(({ icon: Icon, title, text, href }) => (
        <Link
          key={title}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="group border border-line bg-ivory-100/60 p-4 transition-colors hover:bg-forest-100"
        >
          <Icon className="h-5 w-5 text-gold-600" />
          <h3 className="mt-3 text-xs font-semibold text-forest-900">
            {title}
          </h3>
          <p className="mt-2 text-xs leading-5 text-ink-soft">{text}</p>
          <span className="sr-only"> Opens in a new tab</span>
        </Link>
      ))}
    </section>
  );
}
