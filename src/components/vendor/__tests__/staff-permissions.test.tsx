import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import StaffPermissions from "../staff-permissions";
const member={userId:"staff-1",name:"Samina",handle:"01711111111",loginEmail:"test@invalid.test",role:"staff" as const};
afterEach(cleanup);
describe("owner's explicit staff grant editor",()=>{
  it("starts with no extra access and saves only explicit known checkboxes",async()=>{
    const save=vi.fn(async()=>{});
    render(<StaffPermissions member={member} onSave={save}/>);
    fireEvent.click(screen.getByText("Delegated permissions — Samina"));
    for(const input of screen.getAllByRole("checkbox")) expect(input).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Stock adjustments only (no prices)"));
    fireEvent.click(screen.getByLabelText("Verify/reject own-shop wallet payments"));
    fireEvent.click(screen.getByRole("button",{name:"Save permissions"}));
    await waitFor(()=>expect(save).toHaveBeenCalledExactlyOnceWith("staff-1",["inventory","cashier"]));
    expect(await screen.findByRole("status")).toHaveTextContent("Permissions saved");
  });
  it("can explicitly revoke every delegation without revoking the login",async()=>{
    const save=vi.fn(async()=>{});
    render(<StaffPermissions member={{...member,permissions:["inventory"]}} onSave={save}/>);
    fireEvent.click(screen.getByText("Delegated permissions — Samina"));
    fireEvent.click(screen.getByLabelText("Stock adjustments only (no prices)"));
    fireEvent.click(screen.getByRole("button",{name:"Save permissions"}));
    await waitFor(()=>expect(save).toHaveBeenCalledExactlyOnceWith("staff-1",[]));
  });
});
