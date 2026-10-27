import { describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { updateVendorStaffPermissions } from "../vendor-staff";
const fixture=(found=true)=>{
  const filters:unknown[][]=[]; const updates:unknown[]=[];
  const q={eq:(...args:unknown[])=>{filters.push(args);return q;},select:()=>q,maybeSingle:async()=>({data:found?{user_id:"staff-1",shop_id:"shop-1",role:"staff",permissions:["catalog","cashier"]}:null,error:null})};
  return {filters,updates,db:{from:()=>({update:(value:unknown)=>{updates.push(value);return q;}})} as never};
};
describe("owner staff delegation DAL",()=>{
  it("rejects non-owner before writing",async()=>{
    const {db,updates}=fixture();
    await expect(updateVendorStaffPermissions(db,"shop-1","staff","staff-1",{permissions:["catalog"]})).rejects.toMatchObject({status:403});
    expect(updates).toHaveLength(0);
  });
  it.each([{permissions:["owner"]},{permissions:"catalog"},{permissions:[true]},null])("rejects invalid grants %j",async(raw)=>{
    const {db,updates}=fixture();
    await expect(updateVendorStaffPermissions(db,"shop-1","owner","staff-1",raw)).rejects.toMatchObject({status:422});
    expect(updates).toHaveLength(0);
  });
  it("canonicalizes grants and scopes updates to staff of this shop",async()=>{
    const {db,updates,filters}=fixture();
    const result=await updateVendorStaffPermissions(db,"shop-1","owner","staff-1",{permissions:["cashier","catalog","catalog"]});
    expect(updates).toEqual([{permissions:["catalog","cashier"]}]);
    expect(filters).toEqual([["shop_id","shop-1"],["user_id","staff-1"],["role","staff"]]);
    expect(result.permissions).toEqual(["catalog","cashier"]);
  });
  it("an owner or foreign-shop target is not silently updated",async()=>{
    const {db}=fixture(false);
    await expect(updateVendorStaffPermissions(db,"shop-1","owner","other-owner",{permissions:[]})).rejects.toMatchObject({status:404});
  });
});
