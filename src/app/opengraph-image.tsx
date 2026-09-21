import { ImageResponse } from "next/og";
import {
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
  OG_TAGLINE,
  ogDescriptionFor,
  ogFitTitle,
  ogHostname,
} from "@/lib/og-card";
import { ogImageSource } from "@/lib/og-media";
import { siteBaseUrl } from "@/lib/site-url";
import OgCardFrame from "@/components/og/og-card-frame";

/**
 * Share preview for every bare link (WhatsApp/Facebook): the home card.
 * Local hero art is read off disk so no network is needed to paint it.
 */

export const alt = "PROSANTI — premium panjabi, three-piece, lungi and gamcha, at your door in Sunamganj";
export const size = { width: OG_CARD_WIDTH, height: OG_CARD_HEIGHT };
export const contentType = "image/png";

export default async function Image() {
  const hero = await ogImageSource("/images/hero.jpg");
  const title = ogFitTitle("At your door in Sunamganj");
  return new ImageResponse(
    (
      <OgCardFrame
        title={title.text}
        titleSize={title.size}
        description={ogDescriptionFor(
          "Panjabi · Three-piece · Lungi · Gamcha — try at the doorstep, pay cash on delivery",
        )}
        tagline={OG_TAGLINE}
        host={ogHostname(siteBaseUrl())}
        image={hero ? { src: hero, alt: "PROSANTI panjabi editorial" } : null}
      />
    ),
    size,
  );
}
