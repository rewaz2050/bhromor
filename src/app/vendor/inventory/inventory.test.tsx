import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({permissions:["inventory"] as string[],get:vi.fn(),send:vi.fn()}));
vi.mock("@/components/vendor/vendor-shell",()=>({useVendor:()=>({role:"staff",permissions:state.permissions,email:"staff@invalid.test",shop:{id:"shop"}})}));
vi.mock("@/lib/use-vendor",()=>({useVendorProducts:()=>({products:[{id:"product",name:"Product"}],loading:false,error:null,refresh:vi.fn()}),vendorGet:state.get,vendorSend:state.send}));
import VendorInventoryPage from "./page";
beforeEach(()=>{
  state.permissions=["inventory"];state.get.mockReset().mockResolvedValue({variants:[{id:"variant",color:"Green",size:"M",stock:10,reserved:3,available:7}]});
  state.send.mockReset().mockResolvedValue({variant:{id:"variant",color:"Green",size:"M",stock:8,reserved:3,available:5}});
});
afterEach(cleanup);
describe("delegated stock-only workbench",()=>{
  it("sends available units, not a new price or reservation count",async()=>{
    render(<VendorInventoryPage/>);
    const input=await screen.findByLabelText("Green / M — available to sell");
    expect(input).toHaveValue(7);
    expect(screen.getByText(/3 reserved units stay protected/)).toBeInTheDocument();
    fireEvent.change(input,{target:{value:"5"}});
    fireEvent.click(screen.getByRole("button",{name:"Save available stock"}));
    await waitFor(()=>expect(state.send).toHaveBeenCalledExactlyOnceWith("/api/vendor/products/product/stock","PATCH",{variantId:"variant",available:5}));
    await waitFor(()=>expect(screen.getByLabelText("Green / M — available to sell")).toHaveValue(5));
  });
  it("default staff cannot read or mutate the stock workbench",()=>{
    state.permissions=[];render(<VendorInventoryPage/>);
    expect(screen.getByText("Inventory permission is required.")).toBeInTheDocument();
    expect(state.get).not.toHaveBeenCalled();expect(state.send).not.toHaveBeenCalled();
  });
});
