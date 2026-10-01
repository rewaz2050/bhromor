"use client";

const vapidBytes = (key: string) => Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
export async function setupRiderPush(): Promise<string | null> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "এই ফোনে push notification support নেই।";
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return "Notification permission দেওয়া হয়নি।";
  const status = await fetch("/api/rider/push", { cache: "no-store" }).then((r) => r.json()) as { configured?: boolean; publicKey?: string | null };
  if (!status.configured || !status.publicKey) return "Server push এখনো configure করা হয়নি।";
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(status.publicKey) });
  const json = subscription.toJSON();
  const response = await fetch("/api/rider/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
  if (!response.ok) return "Push save করা যায়নি—admin-কে migration check করতে বলুন।";
  return null;
}
