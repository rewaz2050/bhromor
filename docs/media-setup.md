# Media setup — Cloudinary + Google Drive + YouTube

Product er **sokol image ar video** ekhon 3 ta source theke cholbe:

| Source | Kiser jonno | Kivabe add korben |
|---|---|---|
| **Cloudinary** (main) | Product photo + product video upload | Admin panel theke direct upload button |
| **Google Drive link** | Photo ba video — jeta Drive e ache | Share link paste korlei auto-convert |
| **YouTube link** | Product video (watch / Shorts / share link) | Product editor er YouTube field e paste |

Storefront gallery te photo + video + YouTube sob slide akare play hobe.
Card, cart, search, checkout — sob jaygay cover photo dekhabe (video kokhono
cover hobe na). Kono demo/placeholder media rakha hoyni — ja add korben tai
live dekhabe.

Code side er setup **100% sesh**. Niche sudhu apnar koronio step gulo dilam —
serially korben.

---

## Step 1 — Cloudinary free account khulun (5 min)

1. https://cloudinary.com/users/register_free jan, email diye signup korun.
2. Login er por **Dashboard** khulbe. Ekhan theke 3 ta jinish lagbe:
   - **Cloud name** — Dashboard er upore boro kore lekha thake
     (jemon `dxy123abc`). Eta public — URL e dekha jay, somossa nai.
   - **API Key** + **API Secret** — bam pasher **Settings** (gear icon) →
     **API Keys** → ekta key dekhabe. **“Generate New API Key”** dorkar nai —
     default key tai use korben. API Secret er pashe **eye icon** e click
     korle secret dekhabe — eta kauke diben na.
3. Ei 3 ta value ekta safe jaygay copy kore rakhun (jemon phone er notes e).

> Free plan e proti mashe ~25 GB storage/bandwidth credit thake — notun
> shop er jonno onekdin cholbe. Limit sesh hole Cloudinary dashboard e
> mail/notification diye janiye dey.

## Step 2 — Computer e `.env.local` e key bosan (2 min)

Project folder e `.env.example` ache — eta copy kore `.env.local` banan
(jodi age theke thake tahole sudhu Cloudinary part ta update korun):

```bash
cp .env.example .env.local
```

`.env.local` khule sudhu ei 3 ta line e apnar value bosan
(quotes diben na, age-pore space rakhben na):

```ini
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=apnar-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=apnar-secret
```

Supabase er 3 ta key (`NEXT_PUBLIC_SUPABASE_URL` ityadi) apnar age thekei
thakar kotha — ogulo touch korben na.

Tarpor local server restart korun:

```bash
npm run dev
```

## Step 3 — Supabase te notun migration run korun (2 min)

Product video save korar jonno database e ekta chotto update dorkar:

1. Supabase Dashboard → apnar project → bam pashe **SQL editor**.
2. **New query** khule project er ei file er **puro content** paste korun:
   `supabase/migrations/202609110006_media_video.sql`
3. **Run** chap din. Success dekhale sesh.

> Na korle ki hobe: photo upload thik cholbe, kintu video soho product
> save korte gele admin panel e bole dibe je migration age run korte hobe.

## Step 4 — Local e test korun (5 min)

1. Browser e http://localhost:3000/api/health khulun. Ei line ta dekhun:
   `"cloudinary": { "configured": true }` — `true` mane key thik ache.
2. http://localhost:3000/admin/login → staff login korun.
3. **Admin → Media** jan → **Choose image or video** diye ekta photo upload
   korun. Niche library te asle Cloudinary **OK**.
4. Ekta choto MP4 video upload kore dekhun — video icon soho asle **OK**.
5. **Admin → Products → ekta product Edit** korun:
   - Media section e **Upload image / video** diye photo/video add korun.
   - Ba Drive er share link paste korun (Step 6 dekhun).
   - YouTube field e ekta video link paste korun (Step 7 dekhun).
   - Save → storefront product page e gallery te sob slide dekha jabe.

## Step 5 — Vercel e deploy + env bosan

Apni ekhono Vercel e deploy koren ni — tai order ta emon:

1. Code `main` branch e push korun (auto-deploy cholbe).
   Vercel project age theke connect kora ache (`bhromor`).
2. Vercel Dashboard → **bhromor project** → **Settings →
   Environment Variables** → **Add New** kore kore ei key gulo add korun
   (protita te **Production + Preview + Development** — 3 ta tei tick):
   - `NEXT_PUBLIC_SUPABASE_URL` → Type **Config**
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Type **Config**
   - `SUPABASE_SERVICE_ROLE_KEY` → Type **Secret**
   - `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` → Type **Config**
   - `CLOUDINARY_API_KEY` → Type **Secret**
   - `CLOUDINARY_API_SECRET` → Type **Secret**
3. **Deployments** → latest → **⋯ → Redeploy** → **“Use existing Build
   Cache” UNCHECK** kore confirm.
4. Live URL e `/api/health` khulun: `"mode":"live"` + Cloudinary
   `configured:true` — duitai thakte hobe.
5. Live `/admin/login` e staff login kore Media te ekta upload test korun.

> Details: [docs/vercel.md](vercel.md) (Config vs Secret form niye) ar
> [docs/go-live.md](go-live.md) (full launch checklist).

---

## Step 6 — Google Drive link kivabe use korben

Kono photo ba video Drive e thakle alada kore download/upload kora lagbe na:

1. Drive e file ta te **right-click → Share → Share**.
2. **“Restricted”** theke change kore **“Anyone with the link”** korun
   (Viewer holei cholbe). **Done**.
3. **Copy link** → Admin panel e paste korun:
   - Photo hole: Product editor er **Media** box e paste → **A photo**
     select kora thakbe → **Add**. Link ta auto direct-image link hoye jabe.
   - Video hole: same box e paste → **A video** select korun → **Add**.
     Storefront e Google player diye play hobe.
   - Ba **Admin → Media** page er “Add hosted media by link” box eo same
     vabe add kora jay.

**3 ta sotorkota:**

- Share **“Anyone with the link” na korle** storefront e photo/video
  vangga dekhabe (403 error). Eta sobcheye common vul.
- Drive file **delete/move korle ba share off korle** site thekeo chole jabe.
  Main product photo sob somoy **Cloudinary te upload kora nirapod** —
  Drive backup/bulk er jonno valo.
- Khub boro video (1 GB+) Drive player e slow hote pare — marketing video
  YouTube e deoa valo.

## Step 7 — YouTube video kivabe use korben

1. Video **Public** ba **Unlisted** thakte hobe (Private hole cholbe na).
2. Link copy korun — je kono format cholbe:
   `youtube.com/watch?v=…` · `youtu.be/…` · **Shorts** link · live link.
3. **Admin → Products → Edit → 4 · Media → YouTube video** field e paste
   korun. Pashe thumbnail preview asle bujhben link thik ache.
4. **Save** → product page gallery er sesh slide e video play button asbe.
   Customer tap na kora porjonto player load hoy na (fast page).

## Step 8 — Protidin er kaj: product e photo/video add kora

**Admin → Products → New/Edit → 4 · Media section:**

1. **Upload image / video** button → file select → Cloudinary te upload hoye
   list e add hobe (photo 10 MB, video 100 MB porjonto).
2. Ba link paste kore **Add** (Cloudinary / Drive / direct link).
3. Prothom photo (**#1 Cover**) tai card/search/cart/checkout — sob jaygay
   dekhay. Onno photo ke cover banate chaile tar **Cover** button chap din.
4. Video kokhono cover hote parbe na — sudhu gallery er vitore play hobe.
5. YouTube video alada field e (Step 7).
6. **Save changes** → sathe sathe storefront e live.

**Admin → Media (library):** sob product/category/brand te babohrito media +
apnar nijer “added” shelf. Ekhane upload ba link add kore **Copy URL** niye
onno jaygay (jemon category image) babohar korte paren.

**Category image:** Admin → Categories → image field e Cloudinary/Drive link —
Drive hole age Media page e add kore converted link copy kore nin.

---

## Verify checklist (deploy er por)

- [ ] `/api/health` → `"mode":"live"`, cloudinary `configured:true`
- [ ] Admin → Media → photo upload hoy + video upload hoy
- [ ] Product editor → Drive photo link + Drive video link add hoy
- [ ] Product editor → YouTube link e thumbnail preview ase
- [ ] Storefront product page → gallery te photo/video/YouTube sob chole
- [ ] Shop page card + cart + search e cover photo thik dekha jay
- [ ] Phone (mobile data) diye ekbar product page khule video play test

## Somossa hole (troubleshooting)

| Somossa | Karon + somadhan |
|---|---|
| Upload e “not configured yet” | Key vul / Vercel e env add er por **redeploy (cache off)** hoy ni |
| Drive photo vangga (403) | File **Anyone with the link** na — Share setting bodlan |
| Drive video cholche na | Share setting + file ta video format (MP4/WebM/MOV) kina dekhun |
| YouTube “video id” error | Private video ba vul link — Public/Unlisted link din |
| Save e “migration 006” lekha | Supabase SQL editor e Step 3 er migration run korun |
| “First media must be a photo” | List er prothom ta video — kono photo te **Cover** chap din |
| Live site e purono obostha | Vercel redeploy cache-off kore abar korun |

Kono step e atkale amake sudhu bolben **kon step + ki lekha dekhacche**
(screenshot thakle aro valo) — ami thik kore dibo.
