import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/translations";
import {
  IconShield,
  IconBox,
  IconTruck,
  IconCheck,
} from "@/components/ui/icons";

const ITEMS: {
  icon: typeof IconShield;
  titleKey: TranslationKey;
  textKey: TranslationKey;
  href: string;
}[] = [
  {
    icon: IconShield,
    titleKey: "checkoutAssurance.cod",
    textKey: "checkoutAssurance.codText",
    href: "/faq",
  },
  {
    icon: IconBox,
    titleKey: "checkoutAssurance.quality",
    textKey: "checkoutAssurance.qualityText",
    href: "/about",
  },
  {
    icon: IconCheck,
    titleKey: "checkoutAssurance.exchange",
    textKey: "checkoutAssurance.exchangeText",
    href: "/returns",
  },
  {
    icon: IconTruck,
    titleKey: "checkoutAssurance.delivery",
    textKey: "checkoutAssurance.deliveryText",
    href: "/delivery",
  },
];

export default function CheckoutAssurance() {
  const { t } = useLanguage();
  return (
    <section
      aria-label={t("checkoutAssurance.ariaLabel")}
      className="mt-6 grid grid-cols-2 gap-3"
    >
      {ITEMS.map(({ icon: Icon, titleKey, textKey, href }) => (
        <Link
          key={titleKey}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="group border border-line bg-ivory-100/60 p-4 transition-colors hover:bg-forest-100"
        >
          <Icon className="h-5 w-5 text-gold-600" />
          <h3 className="mt-3 text-xs font-semibold text-forest-900">
            {t(titleKey)}
          </h3>
          <p className="mt-2 text-xs leading-5 text-ink-soft">{t(textKey)}</p>
          <span className="sr-only"> {t("checkoutAssurance.newTab")}</span>
        </Link>
      ))}
    </section>
  );
}
