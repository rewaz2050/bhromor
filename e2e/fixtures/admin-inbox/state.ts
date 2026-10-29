// All authentication/data in this isolated harness is synthetic. Never imported by production.
import { useSyncExternalStore } from "react";
import type { Notif } from "../../../src/lib/notification-store";
let state = { checked: false, live: false, connectionError: null as string | null, error: null as string | null, notifs: [] as Notif[] };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => state;
const change = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
const rows: Notif[] = [{ id: "qa-system", kind: "system", title: "Saved system notice", body: "A previously loaded notice remains available.", at: Date.now(), read: false }, { id: "qa-order", kind: "order", title: "অর্ডারের আপডেট — দীর্ঘ নোটিফিকেশন শিরোনাম", body: "Synthetic notice only; no real order was created.", at: Date.now(), read: false }];
const retryConnection = () => change({ checked: true, live: true, connectionError: null, error: "Simulated inbox request failure" });
const reset = () => change({ error: null, notifs: state.notifs.length ? state.notifs : rows });
export function useStaffLive() {
  const s = useSyncExternalStore(subscribe, snapshot);
  return { live: s.live, checked: s.checked, error: s.connectionError, role: "admin", retry: retryConnection };
}
export function useNotifications() {
  const s = useSyncExternalStore(subscribe, snapshot);
  return { ...s, loading: s.notifs.length === 0, unread: s.notifs.filter(n => !n.read).length, reset, retryConnection,
    readAll: async () => change({ notifs: s.notifs.map(n => ({ ...n, read: true })) }),
    read: async (id: string) => change({ notifs: s.notifs.map(n => n.id === id ? { ...n, read: true } : n) }) };
}
export const useApplicationsPending = () => ({ shops: 0, riders: 0, resets: 0, total: 0 });
export const useOrders = () => ({ orders: [] });
export const useCatalog = () => ({ products: [] });
export const useSettings = () => ({ settings: { lowStockThreshold: 3 } });
export const useReviews = () => ({ reviews: [] });
Object.assign(window, { adminInboxQA: {
  sessionFailure: () => change({ checked: true, live: false, connectionError: "Simulated session failure" }),
  updateFailure: () => change({ error: "Simulated update failure" }),
} });
