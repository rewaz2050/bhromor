import { beforeEach,describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
const state=vi.hoisted(()=>({role:"staff",permissions:[] as string[],calls:[] as unknown[][]}));
vi.mock("@/lib/vendor-auth",()=>({VendorAuthError:class extends Error{},requireVendor:async()=>({
  user:{id:`delegation-${state.role}`,email:"test@invalid.test"},shopId:"shop-1",role:state.role,permissions:state.permissions,
  db:{rpc:async(...args:unknown[])=>{state.calls.push(args);return {data:[{id:"variant",stock:23,reserved:3,available:20}],error:null};}},
})}));
vi.mock("@/lib/db/admin",async()=>({...(await vi.importActual<typeof import("@/lib/db/admin")>("@/lib/db/admin")),
  createProduct:async(...args:unknown[])=>{state.calls.push(args);return {id:"product"};},
  updateProduct:async(...args:unknown[])=>{state.calls.push(args);return {id:"product"};},
}));
vi.mock("@/lib/db/vendor",()=>({
  advanceVendorOrder:async(...args:unknown[])=>{state.calls.push(args);return {id:"PS-1"};},
  verifyPaymentAsVendor:async(...args:unknown[])=>{state.calls.push(args);return {id:"PS-1"};},
  listVendorEarnings:async()=>({}), patchVendorShop:async()=>({}), listVendorProducts:async()=>[],
  createVendorProductCategory:async()=>({}),
}));
vi.mock("@/lib/db/vendor-staff",()=>({updateVendorStaffPermissions:async()=>({}),revokeVendorStaff:async()=>({})}));
vi.mock("@/lib/db/vendor-promos",()=>({promoBoard:async()=>({}),createVendorPromo:async()=>({}),setVendorPromoActive:async()=>({})}));
vi.mock("@/lib/supabase-server",()=>({getSupabaseService:()=>null}));
vi.mock("@/lib/public-cache",()=>({revalidateCatalogCaches:vi.fn()}));
vi.mock("@/lib/customer-push",()=>({notifyCustomerOfStatus:vi.fn(),notifyCustomerOfPayment:vi.fn()}));
vi.mock("@/lib/rider-push",()=>({pushPendingRiderOffers:vi.fn()}));
vi.mock("@/lib/db/coverage-alert",()=>({notifyIfNoCoverage:vi.fn()}));
vi.mock("@/lib/db/engagement",()=>({notifyStaff:vi.fn()}));
import { POST as create } from "../vendor/products/route";
import { PATCH as edit } from "../vendor/products/[id]/route";
import { POST as csv } from "../vendor/products/csv/route";
import { GET as earnings } from "../vendor/earnings/route";
import { POST as promo } from "../vendor/promos/route";
import { PATCH as shop } from "../vendor/shop/route";
import { POST as category } from "../vendor/categories/route";
import { POST as payment } from "../vendor/orders/[id]/payment/route";
import { POST as advance } from "../vendor/orders/[id]/advance/route";
import { PATCH as permissions } from "../vendor/staff/[id]/route";
import { PATCH as stock } from "../vendor/products/[id]/stock/route";
const ctx={params:Promise.resolve({id:"00000000-0000-4000-8000-000000000001"})};
const request=(body:unknown={})=>new Request("http://localhost/api/vendor/test",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{state.role="staff";state.permissions=[];state.calls=[];});
describe("vendor explicit delegation at the real route wrapper",()=>{
  it.each([["create",create],["edit",edit],["CSV import",csv],["earnings",earnings],["promo",promo],["shop profile",shop],["category",category],["team",permissions],["stock",stock]] as const)("default staff cannot use %s (forged role/grants ignored)",async(_name,handler)=>{
    expect((await handler(request({role:"owner",permissions:["catalog","inventory"]}),ctx)).status).toBe(403);
    expect(state.calls).toHaveLength(0);
  });
  it("permits Confirm but denies cancellation/payment by default",async()=>{
    expect((await advance(request({to:"confirmed"}),ctx)).status).toBe(200);
    expect((await advance(request({to:"cancelled"}),ctx)).status).toBe(403);
    expect((await payment(request({action:"verified"}),ctx)).status).toBe(403);
    expect(state.calls).toHaveLength(1);
  });
  it("catalog grant enables catalog writes but not earnings, promos or cashier actions",async()=>{
    state.permissions=["catalog"];
    expect((await create(request({name:"Product"}))).status).toBe(201);
    expect((await earnings(request())).status).toBe(403);
    expect((await promo(request())).status).toBe(403);
    expect((await payment(request({action:"verified"}),ctx)).status).toBe(403);
  });
  it("cashier and cancellation are independently delegated and revocable",async()=>{
    state.permissions=["cashier"];
    expect((await payment(request({action:"verified"}),ctx)).status).toBe(200);
    expect((await advance(request({to:"cancelled"}),ctx)).status).toBe(403);
    state.permissions=["cancellation"];
    expect((await advance(request({to:"cancelled"}),ctx)).status).toBe(200);
    state.permissions=[];
    expect((await advance(request({to:"cancelled"}),ctx)).status).toBe(403);
  });
  it("inventory-only uses its stock RPC, not the catalog editor",async()=>{
    state.permissions=["inventory"];
    expect((await stock(request({variantId:"00000000-0000-4000-8000-000000000002",available:20}),ctx)).status).toBe(200);
    expect(state.calls[0]).toEqual(["ps_vendor_set_available_stock",{p_product_id:"00000000-0000-4000-8000-000000000001",p_variant_id:"00000000-0000-4000-8000-000000000002",p_available:20}]);
    expect((await edit(request({price:1}),ctx)).status).toBe(403);
    expect((await stock(request({variantId:"bad",available:-1}),ctx)).status).toBe(422);
  });
  it("owner retains catalog and financial reports",async()=>{
    state.role="owner";
    expect((await create(request({name:"Product"}))).status).toBe(201);
    expect((await earnings(request())).status).toBe(200);
  });
});
