/**
 * POST /api/vendor/media/sign — Cloudinary signature for a shop's own media.
 *
 * The vendor product editor reuses the staff `MediaUploader`, which asks the
 * staff-only /api/media/sign for a signature — a vendor session gets 403
 * ("This account is not staff"), so every product-photo upload failed, and
 * the editor refuses to save a product without a photo (2026-09-27 report:
 * "product add kaj kore na"). The rider app hit the same wall on 2026-09-16
 * and got /api/rider/media/sign; this is the vendor's counterpart.
 *
 * Vendor-gated (vendorRoute: an active shop + a per-vendor rate limit) and
 * the folder is pinned to this shop's own Cloudinary namespace, never another
 * shop or the homepage/brand shelves. A request may select only product media
 * or shop assets; the verified shop id always comes from the server session.
 */

import { isCloudinaryConfigured } from "@/lib/env";
import { apiError, apiJson } from "@/lib/api-response";
import { vendorRoute } from "@/app/api/vendor/_lib";
import {
  sanitizeCloudinaryFolder,
  signCloudinaryUpload,
} from "@/lib/cloudinary-sign";

export const dynamic = "force-dynamic";

/** The only folders a vendor may upload into. */
export const VENDOR_FOLDERS = ["prosanti/products", "prosanti/shops"] as const;
export const VENDOR_DEFAULT_FOLDER = "prosanti/products";

export const POST = vendorRoute(
  "media-sign",
  async (ctx, request) => {
    if (!isCloudinaryConfigured()) {
      return apiError(
        "Image upload is not set up yet — paste an image URL below instead.",
        503,
        { code: "NOT_CONFIGURED" },
      );
    }
    let folder = `prosanti/vendors/${ctx.shopId}/products`;
    let resource: "image" | "video" = "image";
    try {
      const body = (await request.json()) as {
        folder?: unknown;
        resource?: unknown;
      };
      const wanted = sanitizeCloudinaryFolder(body?.folder, VENDOR_DEFAULT_FOLDER);
      const assetKind = (VENDOR_FOLDERS as readonly string[]).includes(wanted) && wanted === "prosanti/shops"
        ? "shop-assets"
        : "products";
      // A shop's uploads are physically namespaced by its server-verified id;
      // a vendor cannot select another shop's folder in the request body.
      folder = `prosanti/vendors/${ctx.shopId}/${assetKind}`;
      if (body?.resource === "video") resource = "video";
    } catch {
      // Empty/invalid body → product-photo defaults.
    }
    return apiJson(signCloudinaryUpload(folder, resource));
  },
  { limit: 60 },
);
