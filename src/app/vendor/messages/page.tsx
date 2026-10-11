"use client";

/**
 * The shop's inbox (2026-10-11).
 *
 * Until now a customer's only way to reach the shop was to leave the site —
 * the tracker's WhatsApp button, the contact form — and nothing was kept, so
 * the shop could not answer the person who actually asked and had no record
 * when they did. These are the conversations about your own orders, newest
 * first, with the unread count the customer's waiting on.
 */

import { useVendor } from "@/components/vendor/vendor-shell";
import { PageHeader, Skeleton } from "@/components/vendor/vendor-ui";
import MessageInbox from "@/components/messages/message-inbox";

export default function VendorMessagesPage() {
  const me = useVendor();

  return (
    <div>
      <PageHeader
        title="Messages"
        sub="Questions from the people who ordered from you. They re-read themselves while the page is open, so a reply lands without a refresh."
      />
      {!me ? (
        <Skeleton lines={3} />
      ) : (
        <div className="rounded-2xl border border-line bg-paper p-5 sm:p-7">
          <MessageInbox
            basePath="/api/vendor/threads"
            self="shop"
            lang="en"
            emptyHint="No messages yet. When a shopper writes about one of your orders, it appears here."
          />
        </div>
      )}
    </div>
  );
}
