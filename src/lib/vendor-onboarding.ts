/**
 * Vendor onboarding checklist (round 4, 2026-09-26) — pure.
 *
 * A freshly approved shop lands on an empty dashboard; this turns "what
 * now?" into five concrete steps with links. No payout / bKash step yet:
 * PROSANTI settles vendors offline until a merchant account exists.
 */

import type { Product, Shop } from "./catalog";

export type ChecklistStepId =
  | "contact"
  | "tagline"
  | "products"
  | "photo"
  | "open";

export interface ChecklistStep {
  id: ChecklistStepId;
  title: string;
  detail: string;
  done: boolean;
  /** Where the step is completed; null = completed right on the dashboard. */
  href: string | null;
  cta: string;
}

export const FIRST_PRODUCTS_TARGET = 3;

const isLive = (p: Product): boolean => p.status !== "draft";

export const vendorChecklist = (
  shop: Pick<Shop, "phone" | "address" | "tagline" | "isOpen">,
  products: Product[],
): ChecklistStep[] => {
  const live = products.filter(isLive);
  const withPhoto = live.filter((p) => Array.isArray(p.media) && p.media.length > 0);
  const contactDone = shop.phone.trim().length > 0 && (shop.address ?? "").trim().length > 0;
  const productsDone = live.length >= FIRST_PRODUCTS_TARGET;
  return [
    {
      id: "contact",
      title: "Phone number and pickup address",
      detail: "Riders call this number and drive to this address for every pickup.",
      done: contactDone,
      href: "/vendor/settings",
      cta: "Open shop settings",
    },
    {
      id: "tagline",
      title: "A one-line tagline",
      detail: "Shown under your shop name on the storefront — what you make, in a sentence.",
      done: (shop.tagline ?? "").trim().length > 0,
      href: "/vendor/settings",
      cta: "Write a tagline",
    },
    {
      id: "products",
      title: `Your first ${FIRST_PRODUCTS_TARGET} products`,
      detail: productsDone
        ? `${live.length} products are live.`
        : `${live.length} of ${FIRST_PRODUCTS_TARGET} live — a shop with a few pieces converts far better than one with a single item.`,
      done: productsDone,
      href: "/vendor/products",
      cta: live.length === 0 ? "Add a product" : "Add another product",
    },
    {
      id: "photo",
      title: "A photo on every product",
      detail: withPhoto.length === live.length && live.length > 0
        ? "Every live product has a photo."
        : `${live.length - withPhoto.length} live product${live.length - withPhoto.length === 1 ? "" : "s"} without a photo — customers skip those.`,
      done: live.length > 0 && withPhoto.length === live.length,
      href: "/vendor/products",
      cta: "Add photos",
    },
    {
      id: "open",
      title: "Switch the shop to Open",
      detail: "Closed shops stay on the storefront but cannot take orders.",
      done: shop.isOpen,
      href: null,
      cta: "Open the shop",
    },
  ];
};

export const checklistProgress = (steps: ChecklistStep[]): { done: number; total: number; complete: boolean } => {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: done === steps.length };
};
