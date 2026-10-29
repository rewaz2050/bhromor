// Test-only component harness. No admin authentication bypass or production route.
import { createRoot } from "react-dom/client";
import AdminLiveMap from "../../../src/components/admin/admin-live-map";
import type { Rider } from "../../../src/lib/catalog";
const rider: Rider = { id: "qa-rider", name: "QA rider", phone: "01700000000", lat: 25.08, lng: 91.4, zoneIds: [], isOnline: true, vehicle: "bike", status: "active", cashInHand: 0, ratingAvg: 0, ratingCount: 0 };
createRoot(document.getElementById("map-qa")!).render(
  <>
    <header style={{ position: "sticky", top: 0, zIndex: 30, height: 64, padding: 10, background: "white", borderBottom: "1px solid #ddd" }}>
      <button aria-label="Notifications" style={{ width: 44, height: 44 }} onClick={() => { document.getElementById("notice")!.textContent = "Notifications opened"; }}>🔔</button>
      <span id="notice" style={{ marginLeft: 12 }}>Admin map component QA</span>
    </header>
    <main style={{ padding: 12 }}>
      <h1>Dispatch map regression</h1>
      <p style={{ margin: "24px 0" }}>Synthetic rider and tiles. No real delivery data.</p>
      <div data-testid="map-card"><AdminLiveMap riders={[rider]} orders={[]} deliveries={[]} /></div>
      <div style={{ height: 1000 }}><p>Dispatch lists remain below the map.</p></div>
    </main>
  </>,
);
