#!/usr/bin/env python3
"""Extract the PROSANTI emblem from the cream-background artwork.

Source: file_00000000b59081fa895b43e61079fe57.png (1254x1254, opaque cream bg)
Outputs:
  public/brand/logo-emblem.png  — emblem only (y < wordmark), transparent bg
  public/brand/logo-lockup.png  — full artwork trimmed (cream bg kept, og/social)
  src/app/icon.png              — square 256px favicon with the emblem
"""
import numpy as np
from PIL import Image

SRC = "file_00000000b59081fa895b43e61079fe57.png"
im = Image.open(SRC).convert("RGB")
arr = np.asarray(im).astype(np.float64)
H, W, _ = arr.shape

# ---- 1. Fit a smooth per-channel background model (quadratic in x,y),
# robust to the dark strokes via iterative re-weighting. ----------------
ys, xs = np.mgrid[0:H, 0:W]
nx = (xs / W) * 2 - 1
ny = (ys / H) * 2 - 1
X = np.stack([np.ones_like(nx), nx, ny, nx * ny, nx * nx, ny * ny], axis=-1)
Xf = X.reshape(-1, 6)

bg = arr.copy()
w = np.ones(H * W)
for _ in range(4):
    coef = []
    for c in range(3):
        yv = arr[:, :, c].reshape(-1)
        Aw = Xf * w[:, None]
        bw = yv * w
        coef.append(np.linalg.lstsq(Aw, bw, rcond=None)[0])
    bg = np.stack([(Xf @ coef[c]).reshape(H, W) for c in range(3)], axis=-1)
    resid = np.linalg.norm(arr - bg, axis=-1).reshape(-1)
    w = 1.0 / (1.0 + (resid / 18.0) ** 2)

d = np.linalg.norm(arr - bg, axis=-1)
hist, edges = np.histogram(d, bins=200, range=(0, 260))
peak = float(edges[int(np.argmax(hist))])
print(f"canvas {W}x{H}; bg residual peak ~{peak:.1f}")

# ---- 2. Alpha ramp (fast ramp to minimise halo on the crop).
D0 = min(peak + 22, 40)   # noise floor -> transparent
D1 = D0 + 70              # anything further -> fully opaque
alpha = np.clip((d - D0) / (D1 - D0), 0.0, 1.0)

# ---- 3. Unpremultiply (de-spill): C' = (C - (1-a)*B) / a
out = np.zeros((H, W, 4))
keep = alpha > 0.02
c_ = arr - (1.0 - alpha[:, :, None]) * bg
c_ = np.clip(c_ / np.maximum(alpha[:, :, None], 0.02), 0, 255)
for i in range(3):
    out[:, :, i] = np.where(keep, c_[:, :, i], 0.0)
out[:, :, 3] = alpha * 255
rgba = Image.fromarray(np.rint(out).astype(np.uint8), "RGBA")

# ---- 4. Emblem crop: only the artwork ABOVE the wordmark line (y < 704).
am = (np.asarray(rgba)[:704, :, 3].astype(np.float64) / 255.0) > 0.5
rowcnt = am.sum(axis=1)
colcnt = am.sum(axis=0)
ry = np.where(rowcnt >= 3)[0]
cx = np.where(colcnt >= 3)[0]
y0, y1 = ry.min(), ry.max()
x0, x1 = cx.min(), cx.max()
PAD = 14
y0, y1 = max(y0 - PAD, 0), min(y1 + PAD, H)
x0, x1 = max(x0 - PAD, 0), min(x1 + PAD, W)
print(f"emblem bbox: x {x0}-{x1} (w {x1-x0}), y {y0}-{y1} (h {y1-y0})")

crop = rgba.crop((x0, y0, x1, y1))
crop.save("public/brand/logo-emblem.png")
print("wrote public/brand/logo-emblem.png", crop.size)

# ---- 5. Full lockup (cream bg kept), trimmed to real artwork.
df = d
mask = df > peak + 60      # solid ink only — ignores paper shading/specks
rows = mask.sum(axis=1) >= 6
cols = mask.sum(axis=0) >= 6
ly = np.where(rows)[0]
lx = np.where(cols)[0]
P = 36
ly0, ly1 = max(ly.min() - P, 0), min(ly.max() + P, H)
lx0, lx1 = max(lx.min() - P, 0), min(lx.max() + P, W)
print(f"lockup bbox: x {lx0}-{lx1} (w {lx1-lx0}), y {ly0}-{ly1} (h {ly1-ly0})")
lockup = im.crop((lx0, ly0, lx1, ly1))
lockup.save("public/brand/logo-lockup.png")
print("wrote public/brand/logo-lockup.png", lockup.size)

# ---- 6. Favicon: square 256px, transparent, emblem centered.
S = 256
disp_w = 180
disp_h = round(disp_w * crop.size[1] / crop.size[0])
icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
e = crop.resize((disp_w, disp_h), Image.LANCZOS)
icon.alpha_composite(e, ((S - disp_w) // 2, (S - disp_h) // 2))
icon.save("src/app/icon.png")
print("wrote src/app/icon.png", icon.size)

# ---- 7. Sanity report ------------------------------------------------
a = np.asarray(crop)[:, :, 3]
print(f"emblem: opaque px {(a>200).sum()}, semi px {((a>0)&(a<=200)).sum()}, "
      f"max alpha {a.max()}, mean alpha {a.mean():.1f}")
