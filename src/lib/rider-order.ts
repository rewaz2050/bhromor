import type { Order } from "./orders";

/** Never send proof codes to the person who must ask the customer for one.
 * Broadcast invitations expose the area and price, not customer contacts.
 */
export function riderOrderView(order: Order, state: string): Order {
  const view = { ...order };
  delete view.deliveryCode;
  delete view.paymentRef;
  delete view.deliveryProofUrl;
  // Notes in status history can contain staff-only/customer information.
  view.timeline = [];
  if (state !== "accepted" && state !== "picked_up") {
    view.customer = { name: "গ্রহণ করলে যোগাযোগের তথ্য দেখবেন", phone: "", area: order.customer.area };
    delete view.lat;
    delete view.lng;
    delete view.rider;
    delete view.returnReason;
    delete view.deliveryFailedReason;
  }
  return view;
}
