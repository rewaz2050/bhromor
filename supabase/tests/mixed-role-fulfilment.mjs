import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export async function verifyMixedRoleFulfilment({db,as,uuid,scalar,rows}) {
 const root=async()=>{await db.exec('reset role');await as(null);};
 const acting=async(id)=>{await root();await as(id);await db.exec('set role authenticated');};
 const before=process.env.VERIFY_MIXED_ROLE_BEFORE==='1';
 if(!before) {
   const sql=readFileSync(new URL('../migrations/202610260002_scoped_shop_fulfilment.sql',import.meta.url),'utf8');
   await db.exec(sql);await db.exec(sql);
 }
 const rpc=before?'ps_advance_order':'ps_vendor_advance_order';
 const order=async(shop,status='pending',paymentStatus='verified')=>{
  await root();return scalar("insert into orders(shop_id,status,payment,payment_status,delivery_code) values($1,$2,'bkash',$3,'4821') returning id",[shop,status,paymentStatus]);
 };
 const foreign=await scalar("insert into shops(name,status) values('Other business','active') returning id");
 try {
  for(const platformRole of ['manager','admin','super_admin']) {
   for(const shopRole of ['owner','staff']) {
    await root();
    const user=await uuid();await db.query('insert into admin_users(id,role) values($1,$2)',[user,platformRole]);
    const shop=await scalar("insert into shops(name,status) values('Mixed role shop','active') returning id");
    await db.query("insert into vendor_users(user_id,shop_id,role,permissions) values($1,$2,$3,'{}')",[user,shop,shopRole]);
    const id=await order(shop);await acting(user);
    for(const target of ['confirmed','preparing','ready-for-pickup']) {
     const note=target==='confirmed'?'[Shop fulfilment override] forged note':null;
     const result=await scalar(`select (${rpc}($1,$2,$3)).delivery_code`,[id,target,note]);
     assert.equal(result,null);
    }
    await root();assert.equal(await scalar('select status from orders where id=$1',[id]),'ready-for-pickup');
    const history=await rows('select note,changed_by from order_status_history where order_id=$1',[id]);
    assert(history.every(row=>row.changed_by===user && !(row.note??'').includes('override') && !(row.note??'').includes('forged')));
    const other=await order(foreign);await acting(user);
    await assert.rejects(db.query(`select ${rpc}($1,'confirmed',null)`,[other]),/forbidden/);
    await assert.rejects(db.query('select ps_advance_order_scoped($1,\'confirmed\',null,true)',[other]),/permission denied/);
    const cancelled=await order(shop,'confirmed');await acting(user);
    if(shopRole==='staff') {
      await assert.rejects(db.query(`select ${rpc}($1,'cancelled',null)`,[cancelled]),/cancellation permission/);
      await root();await db.query("update vendor_users set permissions=ARRAY['cancellation'] where user_id=$1",[user]);await acting(user);
    }
    await db.query(`select ${rpc}($1,'cancelled',null)`,[cancelled]);
    const unpaid=await order(shop,'confirmed','pending_verification');await acting(user);
    await assert.rejects(db.query(`select ${rpc}($1,'ready-for-pickup',null)`,[unpaid]),/payment not verified/);
    const dispatch=await order(shop,'ready-for-pickup');await acting(user);
    for(const to of ['courier-assigned','out-for-delivery','delivered']) await assert.rejects(db.query(`select ${rpc}($1,$2,null)`,[dispatch,to]),/forbidden/);
    // The platform lane is unchanged: Manager cannot impersonate any shop;
    // Admin/Super Admin must record an exception reason, even for their shop.
    const platform=await order(shop);await acting(user);
    if(platformRole==='manager') await assert.rejects(db.query("select ps_advance_order($1,'confirmed',null)",[platform]),/forbidden/);
    else {
      await assert.rejects(db.query("select ps_advance_order($1,'confirmed',null)",[platform]),/override reason/);
      await db.query("select ps_advance_order($1,'confirmed','Shop unavailable; verified emergency request')",[platform]);
    }
    const inactive=await order(shop);await root();await db.query("update shops set status='suspended' where id=$1",[shop]);await acting(user);
    await assert.rejects(db.query(`select ${rpc}($1,'confirmed',null)`,[inactive]),/forbidden/);
    console.log(`PASS: ${platformRole}+${shopRole}: own fulfilment, explicit cancellation, foreign/dispatch/payment/inactive denials, unchanged platform exception lane`);
   }
  }
  await root();const pure=await uuid();await db.query("insert into admin_users(id,role) values($1,'super_admin')",[pure]);
  const other=await order(foreign);await acting(pure);
  await assert.rejects(db.query(`select ${rpc}($1,'confirmed',null)`,[other]),/forbidden/);
  await root();await db.exec('set role anon');await assert.rejects(db.query(`select ${rpc}($1,'confirmed',null)`,[other]),/permission denied/);
  await root();await db.exec('set role service_role');
  await assert.rejects(db.query("select ps_advance_order_scoped($1,'confirmed',null,true)",[other]),/permission denied/);
  console.log('PASS: platform rank alone grants no shop-scoped entry; anonymous and private service calls denied');
  await root();
  for(const file of ['check-migrations-all.sql','check-migrations-from-0928.sql']) {
   const checks=await rows(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
   const found=checks.filter(r=>r.migration==='202610260002_scoped_shop_fulfilment.sql');
   if(file==='check-migrations-all.sql') assert.equal(found.length,0);
   else assert(found.length===1 && found[0].status.startsWith('OK'));
  }
  console.log('PASS: mixed-role migration repeat-safe and both migration checklists verify its entry points');
 } finally {await root();}
}
