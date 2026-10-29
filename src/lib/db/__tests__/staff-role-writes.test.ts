import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const state=vi.hoisted(()=>({rpc:vi.fn(),forget:vi.fn(),role:"manager",error:null as {code?:string;message:string}|null}));
vi.mock("@/lib/supabase-server",()=>({getSupabaseService:()=>({
 auth:{admin:{listUsers:async()=>({data:{users:[{id:"target",email:"target@example.test",email_confirmed_at:"2026-10-25"}]},error:null})}},
 from:(table:string)=>{
  if(table!=="admin_users")throw new Error("Unexpected table");
  const q={select:()=>q,eq:()=>q,single:async()=>({data:{role:state.role,created_at:"2026-10-25"},error:null}),limit:async()=>({data:[{id:"s1"},{id:"s2"}],error:null})};
  return q;
 },rpc:state.rpc,
})}));
vi.mock("@/lib/staff-auth",()=>({forgetStaffRole:state.forget}));
import {grantStaffRole,revokeStaffRole} from "../admin";
beforeEach(()=>{
 state.role="manager";state.error=null;state.forget.mockClear();state.rpc.mockReset();
 state.rpc.mockImplementation(async()=>({data:{id:"target",role:"manager",created_at:"2026-10-25"},error:state.error}));
});
describe("staff role writes",()=>{
 it("grants through the actor-bound atomic RPC, without table upsert",async()=>{
  expect((await grantStaffRole({id:"actor",role:"admin"},{email:"target@example.test",role:"manager"})).id).toBe("target");
  expect(state.rpc).toHaveBeenCalledWith("ps_change_staff_role",{p_actor_id:"actor",p_target_id:"target",p_role:"manager"});
  expect(state.forget).toHaveBeenCalledWith("target");
 });
 it("revoke uses the same transactional workflow",async()=>{
  await revokeStaffRole({id:"actor",role:"admin"},{email:"target@example.test"});
  expect(state.rpc).toHaveBeenCalledWith("ps_change_staff_role",{p_actor_id:"actor",p_target_id:"target",p_role:null});
 });
 it("fails closed without migration and never falls back to a direct write",async()=>{
  state.error={code:"PGRST202",message:"missing RPC"};
  await expect(grantStaffRole({id:"actor",role:"admin"},{email:"target@example.test",role:"manager"})).rejects.toMatchObject({status:503});
  expect(state.forget).not.toHaveBeenCalled();
 });
 it("maps a current database role denial rather than trusting stale actor rank",async()=>{
  state.error={message:"forbidden: current Admin access required"};
  await expect(grantStaffRole({id:"actor",role:"admin"},{email:"target@example.test",role:"manager"})).rejects.toMatchObject({status:403});
 });
});
