import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
const state=vi.hoisted(()=>({role:"manager"}));
vi.mock("@/lib/use-staff-live",()=>({useStaffLive:()=>({live:true,checked:true,role:state.role})}));
vi.mock("@/lib/use-zones",()=>({useZones:()=>({zones:[]})}));
vi.mock("@/lib/use-riders",()=>({useRiders:()=>({
 riders:[{id:"r1",name:"Operational Rider",phone:"01700000000",vehicle:"bicycle",zoneIds:[],status:"active",isOnline:true,cashInHand:0,ratingAvg:0,ratingCount:0}],
 live:true,loading:false,error:null,settleClaims:[],dispatch:{cashCap:500000},
})}));
import AdminRidersPage from "../riders/page";
afterEach(cleanup);
describe("rider control visibility",()=>{
 it("Manager retains operational roster without create/edit lifecycle controls",()=>{
  state.role="manager";render(<AdminRidersPage/>);
  expect(screen.getByText("Operational Rider")).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"New rider"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Edit"})).not.toBeInTheDocument();
 });
 it.each(["admin","super_admin"])("%s retains authorized rider intake and edit",role=>{
  state.role=role;render(<AdminRidersPage/>);
  expect(screen.getByRole("button",{name:"New rider"})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Edit"})).toBeInTheDocument();
 });
});
