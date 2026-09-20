import Script from "next/script";
import { ga4Id, metaPixelId } from "@/lib/analytics";

/**
 * Meta Pixel + GA4 loaders — rendered from the root layout, and rendered as
 * NOTHING when the ids are not configured. Both load `afterInteractive`, so
 * they never compete with the shelf for the first paint. Page views for
 * client-side navigations come from <AnalyticsRouteTracker/>; the base
 * PageView/config calls here cover the first (server-rendered) page.
 */
export default function AnalyticsScripts() {
  const pixel = metaPixelId();
  const ga = ga4Id();
  if (!pixel && !ga) return null;
  return (
    <>
      {pixel ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
        </Script>
      ) : null}
      {ga ? (
        <>
          <Script
            id="ga4-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}',{send_page_view:true});`}
          </Script>
        </>
      ) : null}
    </>
  );
}
