// Isolated component fixture: never imported by an application route.
import { createRoot } from "react-dom/client";
import ProductGallery from "../../../src/components/product/product-gallery";
import { LanguageProvider } from "../../../src/components/i18n/language-provider";
import { PRODUCTS } from "../../../src/lib/catalog";
const svg = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750"><rect width="600" height="750" fill="${color}"/><path d="M0 0L600 750M600 0L0 750" stroke="white" stroke-width="12"/></svg>`)}`;
createRoot(document.getElementById("gallery-qa")!).render(
  <LanguageProvider initialLang={document.documentElement.lang === "bn" ? "bn" : "en"}>
    <main className="mx-auto max-w-sm p-4"><h1>Gallery component QA</h1><a href="#gallery-qa">Background link</a>
      <ProductGallery product={{ ...PRODUCTS[0], media: [{ src: svg("#325242"), alt: "Front fabric" }, { src: svg("#526252"), alt: "Back fabric" }], video: undefined }} />
    </main>
  </LanguageProvider>,
);
