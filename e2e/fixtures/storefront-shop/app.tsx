// Isolated browser component fixture, never imported by an application route.
// Browser API interception cannot seed the server-rendered /shop props.
import { createRoot } from "react-dom/client";
import ShopBrowser from "../../../src/components/shop/shop-browser";
import CatalogHydrator from "../../../src/components/shop/catalog-hydrator";
import { CartProvider } from "../../../src/components/cart/cart-provider";
import { LanguageProvider } from "../../../src/components/i18n/language-provider";
import {
  PRODUCTS,
  CATEGORIES,
  DELIVERY_ZONES,
  type Shop,
} from "../../../src/lib/catalog";

const shop: Shop = {
  id: "storefront-qa",
  slug: "storefront-qa",
  name: "QA shop",
  phone: "01700000000",
  zoneIds: DELIVERY_ZONES.map((zone) => zone.id),
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
};
const products = PRODUCTS.map((product) => ({ ...product, shopId: shop.id }));
createRoot(document.getElementById("shop-qa")!).render(
  <LanguageProvider initialLang="en">
    <CartProvider>
      <CatalogHydrator
        products={products}
        categories={CATEGORIES}
        shops={[shop]}
        zones={DELIVERY_ZONES}
      />
      <main>
        <h1>Shop component fixture</h1>
        <ShopBrowser
          products={products}
          categories={CATEGORIES}
          shops={[shop]}
          zones={DELIVERY_ZONES}
          initialCategory="all"
          initialNew={false}
          initialMood="festive"
        />
      </main>
    </CartProvider>
  </LanguageProvider>,
);
