import { describe,expect,it } from "vitest";
import { vendorCan,vendorPermissions,vendorPathAllowed,VENDOR_PERMISSIONS } from "../vendor-permissions";
describe("vendor permission defaults",()=>{
  it("owner keeps all explicit business capabilities; unknown/staff roles do not inherit owner",()=>{
    for(const permission of VENDOR_PERMISSIONS){
      expect(vendorCan({role:"owner"},permission)).toBe(true);
      expect(vendorCan({role:"staff"},permission)).toBe(false);
      expect(vendorCan({role:"unknown",permissions:[permission]},permission)).toBe(false);
    }
  });
  it("requires each explicit grant and ignores unknown/bad permission data",()=>{
    expect(vendorPermissions(["catalog","owner","catalog",false])).toEqual(["catalog"]);
    expect(vendorPermissions("catalog")).toEqual([]);
    expect(vendorCan({role:"staff",permissions:["inventory"]},"inventory")).toBe(true);
    expect(vendorCan({role:"staff",permissions:["inventory"]},"catalog")).toBe(false);
  });
  it("hides privileged pages but preserves staff orders and personal password settings",()=>{
    const staff={role:"staff"};
    for(const path of ["/vendor/earnings","/vendor/promo","/vendor/funnel","/vendor/products/new"]) expect(vendorPathAllowed(staff,path)).toBe(false);
    expect(vendorPathAllowed(staff,"/vendor/orders")).toBe(true);
    expect(vendorPathAllowed(staff,"/vendor/settings")).toBe(true);
    expect(vendorPathAllowed({role:"staff",permissions:["inventory"]},"/vendor/inventory")).toBe(true);
    expect(vendorPathAllowed({role:"staff",permissions:["cashier"]},"/vendor/earnings")).toBe(false);
  });
});
