"""
Génère les assets BMP pour les installeurs NSIS et WiX de Tomino.
Lancer : python front/src-tauri/installer/generate_assets.py
"""
from PIL import Image, ImageDraw, ImageFont
import os, math

OUT = os.path.dirname(os.path.abspath(__file__))

# ── Palette ────────────────────────────────────────────────────────────────────
BG        = (10,  10,  10)
GREEN     = (24,  195, 126)
GREEN_DIM = (18,  120,  78)
GOLD      = (201, 168,  76)
WHITE     = (255, 255, 255)
TEXT2     = (150, 160, 175)
LINE      = ( 38,  42,  50)

FONTS = "C:/Windows/Fonts/"

def font(name, size):
    try:
        return ImageFont.truetype(FONTS + name, size)
    except Exception:
        return ImageFont.load_default()

# Families
def F(size, bold=False):
    f = "segoeuib.ttf" if bold else "segoeui.ttf"
    return font(f, size)

# ── Helpers ────────────────────────────────────────────────────────────────────
def grad_h(draw, x1, y1, x2, y2, c1, c2):
    """Dégradé horizontal c1 → c2."""
    w = x2 - x1
    if w <= 0:
        return
    for i in range(w):
        t = i / w
        r = int(c1[0] + t * (c2[0] - c1[0]))
        g = int(c1[1] + t * (c2[1] - c1[1]))
        b = int(c1[2] + t * (c2[2] - c1[2]))
        draw.line([(x1 + i, y1), (x1 + i, y2)], fill=(r, g, b))

def grad_v(draw, x1, y1, x2, y2, c1, c2):
    """Dégradé vertical c1 → c2."""
    h = y2 - y1
    if h <= 0:
        return
    for i in range(h):
        t = i / h
        r = int(c1[0] + t * (c2[0] - c1[0]))
        g = int(c1[1] + t * (c2[1] - c1[1]))
        b = int(c1[2] + t * (c2[2] - c1[2]))
        draw.line([(x1, y1 + i), (x2, y1 + i)], fill=(r, g, b))

def dot_grid(draw, W, H, spacing=18, color=(255,255,255,18)):
    """Grille de points subtile."""
    for x in range(0, W, spacing):
        for y in range(0, H, spacing):
            draw.ellipse([x-1, y-1, x+1, y+1], fill=color[:3])

def save_bmp(img, name):
    path = os.path.join(OUT, name)
    img.convert("RGB").save(path, format="BMP")
    print(f"  OK  {name}  ({img.width}x{img.height})")

def text_w(draw, txt, fnt):
    bb = draw.textbbox((0, 0), txt, font=fnt)
    return bb[2] - bb[0]

def draw_logo(draw, x, y, size=22):
    """TOMINO en blanc + + en or."""
    ft_main = F(size, bold=True)
    ft_plus = F(size, bold=True)
    draw.text((x, y), "TOMINO", font=ft_main, fill=WHITE)
    w = text_w(draw, "TOMINO", ft_main)
    draw.text((x + w + 2, y - 1), "+", font=ft_plus, fill=GOLD)

# ══════════════════════════════════════════════════════════════════════════════
# 1. NSIS Header   150 × 57
# ══════════════════════════════════════════════════════════════════════════════
def make_nsis_header():
    W, H = 150, 57
    img  = Image.new("RGB", (W, H), BG)
    d    = ImageDraw.Draw(img)

    # Fond avec très léger gradient vert en haut à droite
    grad_h(d, 0, 0, W, H, BG, (14, 28, 22))

    # Ligne verte en bas
    grad_h(d, 0, H - 2, W, H, GREEN, GREEN_DIM)

    # Logo centré verticalement
    ft = F(14, bold=True)
    fp = F(14, bold=True)
    tx, ty = 12, (H - 14) // 2 - 2
    d.text((tx, ty), "TOMINO", font=ft, fill=WHITE)
    w = text_w(d, "TOMINO", ft)
    d.text((tx + w + 2, ty - 1), "+", font=fp, fill=GOLD)

    save_bmp(img, "nsis-header.bmp")

# ══════════════════════════════════════════════════════════════════════════════
# 2. NSIS Sidebar   164 × 314
# ══════════════════════════════════════════════════════════════════════════════
def make_nsis_sidebar():
    W, H = 164, 314
    img  = Image.new("RGB", (W, H), BG)
    d    = ImageDraw.Draw(img)

    # Fond dégradé vertical sombre → légèrement vert
    grad_v(d, 0, 0, W, H, BG, (10, 24, 18))

    # Bande verte fine à droite
    grad_v(d, W - 3, 0, W, H, GREEN, GREEN_DIM)

    # Points décoratifs discrets
    dot_grid(d, W - 4, H, spacing=20, color=(255, 255, 255))

    # Grand logo "TOMINO" avec "+" or
    ft_big  = F(26, bold=True)
    ft_plus = F(26, bold=True)
    tx = 16
    ty = 52
    d.text((tx, ty), "TOMINO", font=ft_big, fill=WHITE)
    bw = text_w(d, "TOMINO", ft_big)
    d.text((tx + bw + 3, ty - 2), "+", font=ft_plus, fill=GOLD)

    # Ligne décorative sous le logo
    d.rectangle([tx, ty + 36, tx + 120, ty + 37], fill=GREEN)

    # Tagline
    ft_tag = F(11)
    d.text((tx, ty + 46), "Supervision de patrimoine", font=ft_tag, fill=TEXT2)
    d.text((tx, ty + 60), "financier personnel.", font=ft_tag, fill=TEXT2)

    # Cercle décoratif bas
    cx, cy, r = W // 2, H - 68, 38
    for i in range(3):
        alpha = 0.06 - i * 0.015
        col   = tuple(int(c * alpha + BG[j] * (1 - alpha)) for j, c in enumerate(GREEN))
        d.ellipse([cx - r - i*14, cy - r - i*14, cx + r + i*14, cy + r + i*14],
                  outline=col, width=1)

    # Version en bas
    ft_ver = F(9)
    ver_txt = "v0.1.7"
    vw  = text_w(d, ver_txt, ft_ver)
    d.text(((W - vw) // 2, H - 22), ver_txt, font=ft_ver, fill=(60, 65, 75))

    save_bmp(img, "nsis-sidebar.bmp")

# ══════════════════════════════════════════════════════════════════════════════
# 3. WiX Banner   493 × 58
# ══════════════════════════════════════════════════════════════════════════════
def make_wix_banner():
    W, H = 493, 58
    img  = Image.new("RGB", (W, H), BG)
    d    = ImageDraw.Draw(img)

    # Fond dégradé horizontal léger
    grad_h(d, 0, 0, W, H, BG, (14, 24, 20))

    # Ligne verte en bas
    grad_h(d, 0, H - 2, W, H, GREEN, GREEN_DIM)

    # Logo
    ft  = F(18, bold=True)
    fp  = F(18, bold=True)
    tx, ty = 20, (H - 20) // 2 - 2
    d.text((tx, ty), "TOMINO", font=ft, fill=WHITE)
    bw  = text_w(d, "TOMINO", ft)
    d.text((tx + bw + 3, ty - 2), "+", font=fp, fill=GOLD)

    # Séparateur vertical subtil
    sep_x = tx + bw + 28
    d.rectangle([sep_x, 14, sep_x + 1, H - 14], fill=LINE)

    # Tagline droite
    ft_tag = F(11)
    tag    = "Supervision de patrimoine financier personnel"
    tw     = text_w(d, tag, ft_tag)
    d.text((sep_x + 16, (H - 13) // 2), tag, font=ft_tag, fill=TEXT2)

    save_bmp(img, "wix-banner.bmp")

# ══════════════════════════════════════════════════════════════════════════════
# 4. WiX Dialog   493 × 312
# ══════════════════════════════════════════════════════════════════════════════
def make_wix_dialog():
    W, H = 493, 312
    img  = Image.new("RGB", (W, H), BG)
    d    = ImageDraw.Draw(img)

    # Fond dégradé sombre
    grad_v(d, 0, 0, W, H, BG, (10, 22, 17))

    # Grille de points discrets
    dot_grid(d, W, H, spacing=24, color=(255, 255, 255))

    # Grand cercle décoratif bas-droite
    for i in range(4):
        r  = 180 + i * 40
        cx = W - 30
        cy = H + 20
        alpha = max(0.0, 0.07 - i * 0.015)
        col   = tuple(int(c * alpha + BG[j] * (1 - alpha)) for j, c in enumerate(GREEN))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=1)

    # TOMINO grand
    ft_big  = F(52, bold=True)
    ft_plus = F(52, bold=True)
    tx = 38
    ty = 90
    d.text((tx, ty), "TOMINO", font=ft_big, fill=WHITE)
    bw = text_w(d, "TOMINO", ft_big)
    d.text((tx + bw + 4, ty - 4), "+", font=ft_plus, fill=GOLD)

    # Trait vert sous le logo
    d.rectangle([tx, ty + 66, tx + 260, ty + 68], fill=GREEN)

    # Tagline
    ft_tag = F(14)
    d.text((tx, ty + 80), "Supervision de patrimoine financier", font=ft_tag, fill=TEXT2)
    d.text((tx, ty + 98), "personnel.", font=ft_tag, fill=TEXT2)

    # Ligne verte en bas
    grad_h(d, 0, H - 3, W, H, GREEN, GREEN_DIM)

    # Bande noire semi-transparente bas
    for i in range(50):
        t   = i / 50
        col = tuple(int(BG[j] * t + c * (1 - t)) for j, c in enumerate((10, 22, 17)))
        d.line([(0, H - 53 + i), (W, H - 53 + i)], fill=col)

    # Version bas-droite
    ft_ver = F(10)
    ver    = "v0.1.7"
    vw     = text_w(d, ver, ft_ver)
    d.text((W - vw - 18, H - 22), ver, font=ft_ver, fill=(55, 62, 72))

    save_bmp(img, "wix-dialog.bmp")

# ── Main ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Génération des assets installeur Tomino...")
    make_nsis_header()
    make_nsis_sidebar()
    make_wix_banner()
    make_wix_dialog()
    print("Terminé.")
