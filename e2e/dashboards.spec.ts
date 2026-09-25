/** Browser contract tests with explicit API fixtures, NOT live Supabase E2E.
 * Use a test server with NEXT_PUBLIC_SUPABASE_URL=https://verification.invalid
 * and NEXT_PUBLIC_SUPABASE_ANON_KEY=verification-only (never production secrets).
 */
import { test, expect, type Page } from '@playwright/test';

const shop = { id: 'shop-1', slug: 'verification-shop', name: 'Verification Shop', phone: '01711111111', address: 'Market Road, Sylhet', zoneIds: ['zone-1'], prepMinutes: 15, commissionPct: 10, status: 'active', isOpen: true, ratingAvg: 0, ratingCount: 0 };
const rider = { id: 'rider-1', name: 'Verification Rider', phone: '01711111112', vehicle: 'bike', zoneIds: ['zone-1'], status: 'active', isOnline: true, cashInHand: 0, currentLoad: 0, ratingAvg: 0, ratingCount: 0 };
const order = { id: 'PS-VERIFY-001', shopId: shop.id, createdAt: Date.now(), customer: { name: 'Test Customer', phone: '01711111114', area: 'Town', address: 'Test house' }, zoneId: 'zone-1', zoneName: 'Town', items: [], subtotal: 10000, deliveryCharge: 0, total: 10000, status: 'pending', payment: 'cod', paymentStatus: 'verified', timeline: [], etaLabel: '45 minutes' };
async function fixtures(page: Page, handler?: (path: string, method: string, body: Record<string, unknown>) => unknown) {
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    const body = req.postData() ? JSON.parse(req.postData()!) : {};
    const custom = handler?.(path, req.method(), body);
    const base: Record<string, unknown> = {
      '/api/account/me': { customer: { id: 'customer-1', name: 'Test Customer', phone: '01711111114' } },
      '/api/account/orders': { orders: [] },
      '/api/contact': { phone: '01711111111' },
      '/api/rider/me': { rider, email: 'rider@verify.invalid' },
      '/api/rider/jobs': { jobs: [] }, '/api/rider/settlements': { settlements: [] },
      '/api/vendor/me': { shop, role: 'owner', email: 'owner@verify.invalid' },
      '/api/vendor/orders': { orders: [] },
      '/api/admin/me': { staff: true, role: 'admin', email: 'admin@verify.invalid' },
      '/api/admin/riders': { riders: [rider] }, '/api/admin/orders': { orders: [] },
      '/api/admin/notifications': { notifications: [], unread: 0 },
      '/api/admin/deliveries': { deliveries: [], awaitingOrders: [] },
    };
    await route.fulfill({ json: custom ?? base[path] ?? {} });
  });
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('customer profile saves a name and refreshes the dashboard identity', async ({page}) => {
  let name = 'Test Customer';
  await fixtures(page, (path, method, body) => {
    if (path === '/api/account/profile' && method === 'PATCH') name = String(body.name);
    if (path === '/api/account/me' || path === '/api/account/profile') return { customer: { id:'customer-1', name, phone:'01711111114' } };
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('/account');
  await page.getByTestId('account-tab-profile').click();
  await page.getByLabel('নাম', {exact:true}).fill('Updated Customer');
  await page.getByRole('button', {name:'তথ্য সেভ করুন'}).click();
  await expect(page.getByRole('status').filter({hasText:'প্রোফাইল সেভ হয়েছে'})).toBeVisible();
  await expect(page.getByTestId('account-hero-name')).toContainText('Updated Customer');
  await expect(page.getByLabel('লগইন ফোন')).toHaveAttribute('readonly', '');
  await fits(page);
});

test('rider profile save and shared invitation acceptance work on mobile', async ({page}) => {
  let current = {...rider}; let accepted = false;
  await fixtures(page, (path, method, body) => {
    if (path === '/api/rider/profile' && method === 'PATCH') current = {...current, ...body};
    if (path === '/api/rider/me' || path === '/api/rider/profile') return { rider: current, email:'rider@verify.invalid' };
    if (path.endsWith('/accept')) { accepted = true; return {accepted:true}; }
    if (path === '/api/rider/jobs') return {jobs:[{id:'assignment-1',orderId:order.id,state:accepted?'accepted':'offered',offeredAt:Date.now(),expiresAt:Date.now()+90000,order:{...order,status:accepted?'courier-assigned':'ready-for-pickup'},pickupShop:shop}]};
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('/rider');
  await page.getByText('আমার রাইডার প্রোফাইল', {exact:true}).click();
  await page.getByLabel('নাম', {exact:true}).fill('Updated Rider');
  await page.getByRole('button', {name:'প্রোফাইল সেভ করুন'}).click();
  await expect(page.getByRole('status').filter({hasText:'প্রোফাইল সেভ হয়েছে'})).toBeVisible();
  await expect(page.getByRole('link', {name:'দোকানে কল'})).toHaveAttribute('href',`tel:${shop.phone}`);
  await expect(page.getByRole('link', {name:'কল দিন',exact:true})).toHaveCount(0);
  await page.getByRole('button', {name:'অর্ডার একসেপ্ট করুন'}).click();
  await expect(page.getByRole('button', {name:'পিকআপ কনফার্ম করুন'})).toBeVisible();
  await expect(page.getByRole('link', {name:'কল দিন',exact:true})).toBeVisible();
  await fits(page);
});

test('shop profile saves and order queue follows Confirm → Ready', async ({page}) => {
  let current = {...shop}; let status = 'pending';
  await fixtures(page, (path, method, body) => {
    if (path === '/api/vendor/shop' && method === 'PATCH') { current = {...current,...body}; return {shop:current}; }
    if (path === '/api/vendor/me') return { shop:current, role:'owner', email:'owner@verify.invalid' };
    if (path.endsWith('/advance')) { status=String(body.to); return {order:{...order,status}}; }
    if (path === '/api/vendor/orders') return {orders:[{...order,status}]};
  });
  await page.goto('/vendor/settings');
  await page.getByLabel('দোকানের নাম *', {exact:true}).fill('Updated Shop');
  await page.getByRole('button',{name:'পরিবর্তন সেভ করুন'}).click();
  await expect(page.getByRole('status')).toContainText('তথ্য সেভ হয়েছে');
  await page.goto('/vendor/orders');
  await page.getByRole('button',{name:'Confirm order',exact:true}).click();
  await page.getByRole('button',{name:'Ready — request riders',exact:true}).click();
  await expect.poll(()=>status).toBe('ready-for-pickup');
  await fits(page);
});

test('admin distinguishes one requesting order from two invitations', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('prosanti.admin.session.v1','1'));
  const ready={...order,status:'ready-for-pickup'};
  await fixtures(page, path => path === '/api/admin/deliveries' ? { awaitingOrders:[], deliveries:['rider-1','rider-2'].map((id,i)=>({id:`assignment-${i}`,orderId:order.id,riderId:id,riderName:`Rider ${i}`,riderPhone:rider.phone,state:'offered',offeredAt:Date.now(),expiresAt:Date.now()+90000,order:ready})) } : undefined);
  await page.goto('/admin/deliveries');
  await expect(page.getByText('1 orders requesting riders · 2 invitations.',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Rider dispatch board'})).toBeVisible();
  await fits(page);
});

test('unauthenticated APIs deny real requests without fixture interception', async ({request}) => {
  for (const path of ['/api/account/profile','/api/rider/profile']) {
    const res=await request.patch(path,{data:{name:'Someone',phone:'01711111114',vehicle:'bike'}});
    expect([401,403]).toContain(res.status());
  }
  for (const path of ['/api/vendor/shop','/api/admin/deliveries']) {
    const res=await request.get(path); expect([401,403]).toContain(res.status());
  }
});
