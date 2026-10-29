// Isolated real-Leaflet harness; no application route or authentication bypass.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../../../src/components/i18n/language-provider";
import MapPinPicker from "../../../src/components/checkout/map-pin-picker";
import { RiderTileMap } from "../../../src/components/track/rider-tile-map";
import type { LatLng } from "../../../src/lib/sunamganj";
function App() {
  const [pin, setPin] = useState<LatLng | null>(null);
  return <LanguageProvider initialLang={document.documentElement.lang === "bn" ? "bn" : "en"}>
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <h1>Delivery maps component QA</h1><p>Synthetic coordinates. No real customer or rider.</p>
      <section data-testid="checkout-map"><MapPinPicker value={pin} onChange={setPin} /><p data-testid="selected-pin">{pin ? "Pin selected" : "No pin selected"}</p></section>
      <section data-testid="tracker-map" className="h-80"><RiderTileMap destination={{ lat: 25.07, lng: 91.4 }} rider={{ lat: 25.08, lng: 91.41 }} stale /></section>
    </main>
  </LanguageProvider>;
}
createRoot(document.getElementById("delivery-maps-qa")!).render(<App />);
