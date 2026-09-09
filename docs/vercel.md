# Vercel — environment variables & project settings

The storefront is already connected at [bhromor-zeta.vercel.app](https://bhromor-zeta.vercel.app). Vercel does **not** read `.env.local` from Git. Keys must be added in the project dashboard (or CLI), then the site must be **redeployed**.

Direct links (this repo’s project):

- [Environment Variables](https://vercel.com/rewaz2050-8233/bhromor/settings/environment-variables)
- [General / Build settings](https://vercel.com/rewaz2050-8233/bhromor/settings/general)
- [Deployments](https://vercel.com/rewaz2050-8233/bhromor/deployments)

Open the **project** (`bhromor`), not the team-wide settings. Team-level variables are a different page and will not show up here.

## New form (Config vs Secret)

Vercel replaced the old “Sensitive” checkbox. Each variable now has a **type**:

| Type | After save | Use for |
|---|---|---|
| **Config** | Value stays readable | `NEXT_PUBLIC_*` keys (URL, anon key, cloud name) |
| **Secret** | Value is write-only (you cannot view it again) | `SUPABASE_SERVICE_ROLE_KEY`, Cloudinary API secret/key |

Save stays disabled until **Name**, **Value**, **type**, and at least one **environment** are all filled.

### Add one variable

1. Open the [Environment Variables](https://vercel.com/rewaz2050-8233/bhromor/settings/environment-variables) page.
2. In **Add New**:
   - **Key** — the name only (`NEXT_PUBLIC_SUPABASE_URL`). Do **not** paste `KEY=value` into this box.
   - **Value** — the value only, no wrapping quotes, no trailing space.
   - **Type** — Config or Secret (table below).
   - **Environments** — tick **Production**, **Preview**, and **Development**.
3. Click **Save**.
4. Repeat for each key.

If the dashboard offers **Import .env**, you can paste the block from `.env.example` (with real values filled in) instead of adding one-by-one.

### Keys this app actually reads

| Key | Type | Required? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Config | Yes, for live mode (`https://….supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | Yes, for live mode |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Yes, for live checkout / admin / seed |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Config | Only for Media → Upload |
| `CLOUDINARY_API_KEY` | Secret | Only for Media → Upload |
| `CLOUDINARY_API_SECRET` | Secret | Only for Media → Upload |
| `NEWSLETTER_SIGNUP_URL` | Config | Optional |

Never put the service-role key in a `NEXT_PUBLIC_` name. Without these keys the site still deploys — it stays in honest **demo** mode (`GET /api/health` → `"mode":"demo"`).

### After saving — you must redeploy

New values apply only to **new** deployments.

1. [Deployments](https://vercel.com/rewaz2050-8233/bhromor/deployments) → latest Production → ⋯ → **Redeploy**.
2. **Uncheck** “Use existing Build Cache”.
3. Confirm. Then open `/api/health` on the live URL: `"mode":"live"` means the Supabase keys were picked up.

## If you changed project settings by mistake

`vercel.json` in the repo pins Framework = Next.js and the npm scripts, so a wrong Build Command in the dashboard cannot stick after the next deploy.

Still reset the dashboard so Override toggles are off:

1. [General settings](https://vercel.com/rewaz2050-8233/bhromor/settings/general) → **Build and Deployment**.
2. Set **Framework Preset** to **Next.js**.
3. Turn **Override** **off** for Build Command, Output Directory, Install Command, and Development Command (Vercel then uses `vercel.json` / Next.js defaults).
4. **Root Directory** must be empty (project lives at the repo root — not `src/`).
5. **Node.js Version** — 20.x or 22.x (not 18).
6. **Production Branch** — `main`.

Do **not** enable the team security policy **Separate Production Secret Values** unless Production and Preview truly use different secrets. That policy blocks saving the same `SUPABASE_SERVICE_ROLE_KEY` on every environment.

## Common reasons Save / the variable “doesn’t work”

- Key field contains `NAME=value` instead of just `NAME`.
- Value wrapped in `"quotes"` or has a leading/trailing space.
- No environment ticked — Save stays grey.
- Added only to Development, then looking at the Production site.
- Forgot to redeploy (or redeployed **with** build cache).
- Looking at Team settings instead of the **bhromor** project.
- `NEXT_PUBLIC_*` changed but an old client bundle is still cached — needs a fresh build, not just a restart.

## CLI alternative (same keys, no dashboard form)

From a machine logged into the Vercel account that owns `bhromor`:

```bash
npx vercel link                         # select the bhromor project
npx vercel env ls

# Config (readable)
printf '%s' 'https://YOUR-PROJECT.supabase.co' | npx vercel env add NEXT_PUBLIC_SUPABASE_URL production --visibility config --yes
printf '%s' 'https://YOUR-PROJECT.supabase.co' | npx vercel env add NEXT_PUBLIC_SUPABASE_URL preview --visibility config --yes
printf '%s' 'https://YOUR-PROJECT.supabase.co' | npx vercel env add NEXT_PUBLIC_SUPABASE_URL development --visibility config --yes

# Secret (write-only after save)
printf '%s' 'YOUR_SERVICE_ROLE_KEY' | npx vercel env add SUPABASE_SERVICE_ROLE_KEY production --visibility secret --yes
```

Do not paste real keys into Git, issues, or chat. After adding, redeploy as above.
