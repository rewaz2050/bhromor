"use client";
import { useEffect, useState } from "react";
import { useVendor } from "@/components/vendor/vendor-shell";
import { useVendorProducts, vendorGet, vendorSend } from "@/lib/use-vendor";
import { vendorCan } from "@/lib/vendor-permissions";
type Variant = { id: string; color: string; size: string; stock: number; reserved: number; available: number };
function VariantStock({ productId }: { productId: string }) {
  const [variants,setVariants] = useState<Variant[]>([]);
  const [error,setError] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [retry,setRetry] = useState(0);
  useEffect(() => {
    let active=true;
    vendorGet<{variants:Variant[]}>(`/api/vendor/products/${encodeURIComponent(productId)}/stock`)
      .then((data) => { if (active) { setVariants(data.variants); setLoading(false); } })
      .catch(() => { if (active) { setError("Could not load stock. Check your access and try again."); setLoading(false); } });
    return () => { active=false; };
  },[productId,retry]);
  if (loading) return <p role="status">Loading stock…</p>;
  if (error) return <div role="alert">{error} <button onClick={() => { setLoading(true); setError(null); setRetry((n) => n+1); }} className="underline">Retry</button></div>;
  return <div className="mt-4 space-y-3">{variants.length===0 && <p>No active variants. Ask the owner to set up the catalog.</p>}{variants.map((variant) => <StockRow key={`${variant.id}:${variant.stock}:${variant.reserved}`} productId={productId} variant={variant} onSaved={(updated) => setVariants((prev) => prev.map((row) => row.id===updated.id ? updated : row))} />)}</div>;
}
function StockRow({ productId,variant,onSaved }: { productId:string; variant:Variant; onSaved:(variant:Variant)=>void }) {
  const [available,setAvailable]=useState(String(variant.available));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const label=[variant.color,variant.size].filter(Boolean).join(" / ") || "Default variant";
  const valid=/^\d+$/.test(available) && Number(available)<=100000;
  return <form className="rounded-xl border border-line bg-paper p-4" onSubmit={async (event) => {
    event.preventDefault(); if (busy || !valid) return;
    setBusy(true); setError(null);
    try { const result=await vendorSend<{variant:Variant}>(`/api/vendor/products/${encodeURIComponent(productId)}/stock`,"PATCH",{variantId:variant.id,available:Number(available)}); onSaved(result.variant); }
    catch { setError("Stock was not confirmed. Refresh before retrying; your access may have changed."); }
    finally { setBusy(false); }
  }}>
    <label className="block text-sm font-medium">{label} — available to sell<input type="number" min={0} max={100000} step={1} value={available} onChange={(e) => setAvailable(e.target.value)} disabled={busy} className="mt-2 block min-h-11 w-full rounded-lg border border-line bg-paper px-3" /></label>
    <p className="mt-2 text-xs text-ink-soft">{variant.reserved} reserved units stay protected. Prices and variant structure do not change.</p>
    <button disabled={busy || !valid} className="mt-3 min-h-11 rounded-full px-4 text-sm ring-1 ring-forest-800 disabled:opacity-50">{busy ? "Saving…" : "Save available stock"}</button>
    {error && <p role="alert" className="mt-2 text-sm text-rose-800">{error}</p>}
  </form>;
}
export default function VendorInventoryPage() {
  const me=useVendor();
  const allowed=!!me && (vendorCan(me,"inventory") || vendorCan(me,"catalog"));
  const { products,loading,error,refresh }=useVendorProducts(allowed);
  const [selected,setSelected]=useState("");
  const product=products.find((row) => row.id===selected) ?? products[0];
  if (!allowed) return <p>Inventory permission is required.</p>;
  return <section className="space-y-4"><h1 className="text-xl font-semibold">Inventory — stock only</h1>
    <p className="text-sm text-ink-soft">Set physical units available to sell. Existing customer reservations are added automatically and cannot be erased.</p>
    {loading ? <p role="status">Loading products…</p> : error ? <div role="alert">{error} <button onClick={() => void refresh()} className="underline">Retry</button></div> : !product ? <p>No products yet.</p> : <>
      <label className="block text-sm font-medium">Product<select className="mt-2 block min-h-11 w-full rounded-lg border border-line bg-paper px-3" value={product.id} onChange={(e) => setSelected(e.target.value)}>{products.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <VariantStock key={`${me.email}:${me.shop.id}:${product.id}`} productId={product.id} />
    </>}
  </section>;
}
