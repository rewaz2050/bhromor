import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import {readRiderRow} from "../rider-read";
import {listRidersFull,upsertRider,reviewApplication} from "../admin";
import type {DbRider} from "../types";
import {mapRider} from "../mappers";
const row: DbRider={user_id:"u1",contact_email:"rider@example.test",is_online:false,cash_in_hand:0,rating_avg:0,rating_count:0,id:"r1",name:"Rider",phone:"01700000000",vehicle:"bike",status:"active",created_at:"2026-10-25T00:00:00Z",zone_ids:[],earnings_balance:1500};
function fixture(error: unknown=null) {
  const select=vi.fn();
  const mutation: Record<string,unknown>={};
  for(const op of ["update","insert","eq","select"]) mutation[op]=vi.fn(()=>{if(op==="select")select();return mutation;});
  mutation.single=async()=>({data:{id:"r1"},error:null});
  const projection={eq:vi.fn(()=>projection),order:vi.fn(()=>projection),single:async()=>({data:error?null:row,error}),limit:async()=>({data:error?null:[row],error})};
  const rpc=vi.fn(()=>projection),from=vi.fn(()=>mutation);
  return {db:{rpc,from} as unknown as SupabaseClient,rpc,from,select};
}
describe("authorized rider projection",()=>{
  it("reads the actor-bound RPC, never a privileged/table fallback",async()=>{
    const {db,rpc,from}=fixture();expect(await readRiderRow(db,"r1")).toEqual(row);
    expect(rpc).toHaveBeenCalledWith("ps_read_riders");expect(from).not.toHaveBeenCalled();
  });
  it("fails closed when migration or authorization is unavailable",async()=>{
    const {db,from}=fixture({code:"PGRST202"});await expect(readRiderRow(db,"r1")).rejects.toThrow("privacy migration");expect(from).not.toHaveBeenCalled();
  });
  it("roster uses projection while preserving wallet for authorized callers",async()=>{
    const {db,rpc,from}=fixture();expect((await listRidersFull(db))[0].earningsBalance).toBe(1500);
    expect(rpc).toHaveBeenCalledWith("ps_read_riders");expect(from).not.toHaveBeenCalled();
  });
  it("never translates a redacted wallet into a fabricated zero",()=>{
    expect(mapRider({...row,earnings_balance:null} as Parameters<typeof mapRider>[0])).not.toHaveProperty("earningsBalance");
  });
  it("upsert returns only id from the base table, then the authorized projection",async()=>{
    const {db,rpc,from}=fixture();const rider=await upsertRider(db,{id:"r1",name:"Rider",phone:"01700000000",vehicle:"bike",status:"active",zone_ids:[]});
    expect(rider.earningsBalance).toBe(1500);expect(from).toHaveBeenCalledWith("riders");expect(rpc).toHaveBeenCalledWith("ps_read_riders");
  });
  it("review reads back through the same projection",async()=>{
    const {db,rpc}=fixture();expect((await reviewApplication(db,"rider","r1",{status:"active"},{id:"admin"})).id).toBe("r1");expect(rpc).toHaveBeenCalledWith("ps_read_riders");
  });
});
