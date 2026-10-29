import { cleanup,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({path:"/vendor/earnings",role:"staff",permissions:[] as string[]}));
vi.mock("next/navigation",()=>({usePathname:()=>state.path,useRouter:()=>({replace:vi.fn()})}));
vi.mock("@/lib/use-vendor",()=>({useVendorSession:()=>({me:{role:state.role,permissions:state.permissions,email:"staff@invalid.test",shop:{id:"shop",name:"Shop"}},status:"authed",error:null,denyReason:null,signOut:vi.fn()}),useVendorThreads:()=>({awaiting:0})}));
import VendorShell from "../vendor-shell";
beforeEach(()=>{state.path="/vendor/earnings";state.role="staff";state.permissions=[];});
afterEach(cleanup);
describe("vendor shell capability visibility",()=>{
  it("does not mount privileged children or earnings navigation for staff",()=>{
    const child=vi.fn();function PrivateChild(){child();return <p>Private earnings</p>;}
    render(<VendorShell><PrivateChild/></VendorShell>);
    expect(child).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("not delegated");
    expect(screen.queryByRole("link",{name:"Earnings"})).toBeNull();
    expect(screen.getByRole("link",{name:"Orders"})).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"Shop settings"})).toBeInTheDocument();
  });
  it("inventory delegation exposes stock-only page, not catalog or finance",()=>{
    state.path="/vendor/inventory";state.permissions=["inventory"];
    render(<VendorShell><p>Stock tool</p></VendorShell>);
    expect(screen.getByText("Stock tool")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"Inventory"})).toBeInTheDocument();
    expect(screen.queryByRole("link",{name:"Products"})).toBeNull();
    expect(screen.queryByRole("link",{name:"Earnings"})).toBeNull();
  });
  it("owner keeps full business navigation",()=>{
    state.role="owner";
    render(<VendorShell><p>Private earnings</p></VendorShell>);
    expect(screen.getByText("Private earnings")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"Earnings"})).toBeInTheDocument();
  });
  it("default staff home does not mount the owner financial dashboard",()=>{
    state.path="/vendor";
    render(<VendorShell><p>Owner dashboard</p></VendorShell>);
    expect(screen.queryByText("Owner dashboard")).toBeNull();
    expect(screen.getByRole("link",{name:"Open orders"})).toBeInTheDocument();
  });
});
