"""
Aviva Onboarding Guide — generates a 7-page PDF for new clients.

Pages:
  1. Cover
  2. Step 1 — Sign in / Sign up
  3. Step 2 — Inside your dashboard
  4. Step 3 — Connect Shopify
  5. Step 4 — Add your products
  6. Step 5 — Watch your orders
  7. Need help?

Mock UI screenshots are rendered with PIL in pixel-perfect dark mode
(slate-900 #0F172A bg, indigo-400 #818CF8 accent, SF Pro + SF Mono).
PDF is composed with reportlab; all colors match the live website.

Run: python3 scripts/build_onboarding_pdf.py
Out: public/aviva-onboarding-guide.pdf
"""

import os
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

# ──────────────────────────────────────────────────────────────────
# Paths + fonts
# ──────────────────────────────────────────────────────────────────
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT  = os.path.join(ROOT, "public", "aviva-onboarding-guide.pdf")

FONT_SANS = "/System/Library/Fonts/SFNS.ttf"
FONT_SANS_BOLD = "/System/Library/Fonts/SFNS.ttf"        # same TTC; PIL picks variant via index
FONT_MONO = "/System/Library/Fonts/SFNSMono.ttf"

pdfmetrics.registerFont(TTFont("SF", FONT_SANS))
pdfmetrics.registerFont(TTFont("SFMono", FONT_MONO))

def pil_font(size, mono=False, weight="regular"):
    """Return a PIL ImageFont; falls back to default if file is missing."""
    path = FONT_MONO if mono else FONT_SANS
    try:
        f = ImageFont.truetype(path, size=size)
        if weight == "bold":
            # SF Pro variable; PIL can't set axes, so we just emulate by drawing twice.
            return f
        return f
    except Exception:
        return ImageFont.load_default()

# ──────────────────────────────────────────────────────────────────
# Brand palette (matches the website CSS vars 1:1)
# ──────────────────────────────────────────────────────────────────
# Light page (PDF body)
PAGE_BG       = HexColor("#F8FAFC")   # slate-50
CARD_BG       = HexColor("#FFFFFF")
TEXT_STRONG   = HexColor("#0F172A")   # slate-900
TEXT_BODY     = HexColor("#334155")   # slate-700
TEXT_MUTED    = HexColor("#64748B")   # slate-500
TEXT_FAINT    = HexColor("#94A3B8")   # slate-400
BORDER        = HexColor("#E2E8F0")   # slate-200
BORDER_STRONG = HexColor("#CBD5E1")   # slate-300
ACCENT        = HexColor("#6366F1")   # indigo-500 (CTA)
ACCENT_SOFT   = HexColor("#EEF2FF")   # indigo-50
ACCENT_INK    = HexColor("#FFFFFF")
SUCCESS       = HexColor("#10B981")
SUCCESS_SOFT  = HexColor("#D1FAE5")

# Dark UI (mock screenshots)
DK_BG         = (15, 23, 42)          # #0F172A
DK_ELEV       = (30, 41, 59)          # #1E293B (slate-800)
DK_SOFT       = (24, 35, 56)          # in-between
DK_BORDER     = (51, 65, 85)          # #334155
DK_TEXT       = (241, 245, 249)       # #F1F5F9
DK_MUTED      = (148, 163, 184)       # #94A3B8
DK_FAINT      = (100, 116, 139)       # #64748B
DK_ACCENT     = (129, 140, 248)       # #818CF8 indigo-400
DK_ACCENT_SOFT = (49, 46, 129, 60)    # indigo-900 @ ~25% (overlay)
DK_SUCCESS    = (52, 211, 153)        # emerald-400

PAGE_W, PAGE_H = A4   # 595 x 842 pt


# ══════════════════════════════════════════════════════════════════
# MOCK SCREENSHOT BUILDERS  — every screenshot is a PIL Image
# ══════════════════════════════════════════════════════════════════

def _rounded(draw, xy, radius, fill=None, outline=None, width=1):
    """Tiny helper — rounded_rectangle isn't ergonomic in older PIL."""
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def _aviva_logo(draw, x, y, size=22):
    """Draw the indigo 'A' badge mark inline."""
    # rounded square in indigo
    _rounded(draw, (x, y, x + size, y + size), radius=int(size * 0.22), fill=DK_ACCENT)
    f = pil_font(int(size * 0.7), weight="bold")
    text = "A"
    bbox = draw.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((x + (size - tw) / 2, y + (size - th) / 2 - 2), text, fill=(15, 23, 42), font=f)


def _portal_chrome(W=1100, H=720, page_label="DASHBOARD"):
    """Common chrome: dark bg + left sidebar + top status bar. Returns (img, draw)."""
    img = Image.new("RGB", (W, H), DK_BG)
    d = ImageDraw.Draw(img, "RGBA")

    # Top live ticker
    d.rectangle((0, 0, W, 30), fill=(8, 12, 24))
    d.ellipse((18, 11, 26, 19), fill=DK_SUCCESS)
    f_mono = pil_font(10, mono=True)
    d.text((34, 9), "LIVE  ·  PRESSROOM FLOOR  ·  DELHI", fill=DK_SUCCESS, font=f_mono)
    d.text((300, 9), "ORDERS TODAY 1,258  /  AVG SHIP 8.1s  /  BRANDS LIVE 14",
           fill=(203, 213, 225), font=f_mono)

    # Left sidebar
    SW = 200
    d.rectangle((0, 30, SW, H), fill=(11, 18, 35))
    d.line((SW, 30, SW, H), fill=DK_BORDER, width=1)

    # Logo block
    _aviva_logo(d, 22, 50, size=26)
    f = pil_font(14, weight="bold")
    d.text((58, 50), "AVIVA", fill=DK_TEXT, font=f)
    f_small = pil_font(9, mono=True)
    d.text((58, 67), "INTERNATIONAL", fill=DK_MUTED, font=f_small)

    # Nav items
    nav = [
        ("DASHBOARD", "dashboard"),
        ("MY PRODUCTS", "products"),
        ("ORDERS", "orders"),
        ("WALLET", "wallet"),
        ("SUPPORT", "support"),
    ]
    f_nav = pil_font(11, weight="bold")
    y = 110
    for label, key in nav:
        active = label == page_label
        if active:
            _rounded(d, (12, y - 4, SW - 14, y + 18), radius=6, fill=(49, 46, 129))
        d.text((24, y), label, fill=(DK_TEXT if active else DK_MUTED), font=f_nav)
        y += 36

    # Footer in sidebar
    d.text((22, H - 60), "v1.4.2", fill=DK_FAINT, font=f_small)
    d.text((22, H - 44), "avivainternational05@gmail.com", fill=DK_MUTED, font=f_small)

    return img, d, SW


def screenshot_signup():
    """Step 1 — sign in / sign up form (no sidebar, centered card)."""
    W, H = 1100, 720
    img = Image.new("RGB", (W, H), DK_BG)
    d = ImageDraw.Draw(img, "RGBA")

    # subtle gradient overlay top-left → indigo glow
    for i in range(140):
        a = int(70 * (1 - i / 140))
        d.line((0, i, W, i), fill=(99, 102, 241, a))

    # logo top-left
    _aviva_logo(d, 36, 28, size=28)
    f = pil_font(14, weight="bold")
    d.text((74, 28), "AVIVA", fill=DK_TEXT, font=f)
    d.text((74, 46), "INTERNATIONAL", fill=DK_MUTED, font=pil_font(9, mono=True))

    # centered card
    CW, CH = 460, 520
    cx = (W - CW) // 2
    cy = (H - CH) // 2 + 10
    _rounded(d, (cx, cy, cx + CW, cy + CH), radius=14, fill=DK_ELEV, outline=DK_BORDER, width=1)

    # Eyebrow
    f_mono = pil_font(10, mono=True)
    d.text((cx + 32, cy + 32), "CLIENT  ·  CREATE ACCOUNT", fill=DK_ACCENT, font=f_mono)

    # Title
    f_h = pil_font(26, weight="bold")
    d.text((cx + 32, cy + 50), "Start printing today", fill=DK_TEXT, font=f_h)
    d.text((cx + 32, cy + 86), "Free to join · No credit card required",
           fill=DK_MUTED, font=pil_font(13))

    # Fields
    def field(label, value, yoff, mono=False, placeholder=False):
        d.text((cx + 32, cy + yoff), label, fill=DK_MUTED, font=pil_font(11, mono=True))
        _rounded(d, (cx + 32, cy + yoff + 18, cx + CW - 32, cy + yoff + 56),
                 radius=8, fill=(20, 28, 48), outline=DK_BORDER, width=1)
        col = DK_FAINT if placeholder else DK_TEXT
        d.text((cx + 44, cy + yoff + 30), value, fill=col,
               font=pil_font(13, mono=mono))

    field("BRAND NAME",       "Hashway Clothing",   yoff=130)
    field("EMAIL",            "founder@hashway.in", yoff=210, mono=True)
    field("CREATE PASSWORD",  "••••••••••••",       yoff=290, mono=True)

    # Primary button
    _rounded(d, (cx + 32, cy + 380, cx + CW - 32, cy + 422), radius=8, fill=DK_ACCENT)
    f_btn = pil_font(13, weight="bold")
    d.text((cx + 168, cy + 392), "CREATE ACCOUNT  →", fill=(15, 23, 42), font=f_btn)

    # Switch link
    d.text((cx + 96, cy + 444), "Already have an account?",
           fill=DK_MUTED, font=pil_font(12))
    d.text((cx + 260, cy + 444), "Sign in →",
           fill=DK_ACCENT, font=pil_font(12, weight="bold"))

    return img


def screenshot_dashboard():
    """Step 2 — the dashboard the client lands on."""
    img, d, SW = _portal_chrome(page_label="DASHBOARD")
    W, H = img.size

    # Page header
    f_mono = pil_font(10, mono=True)
    d.text((SW + 30, 60), "DASHBOARD", fill=DK_ACCENT, font=f_mono)
    f_h = pil_font(28, weight="bold")
    d.text((SW + 30, 78), "Welcome, Hashway", fill=DK_TEXT, font=f_h)
    d.text((SW + 30, 116), "Connect your store, upload designs, watch orders roll in.",
           fill=DK_MUTED, font=pil_font(13))

    # 4 metric tiles
    tiles = [
        ("ORDERS TODAY",      "12",        DK_ACCENT),
        ("IN PRODUCTION",     "47",        DK_TEXT),
        ("DISPATCHED",        "1,832",     DK_SUCCESS),
        ("WALLET BALANCE",    "₹24,500",   DK_TEXT),
    ]
    tx = SW + 30
    ty = 170
    tile_w = 180
    for i, (label, val, vcolor) in enumerate(tiles):
        x = tx + i * (tile_w + 12)
        _rounded(d, (x, ty, x + tile_w, ty + 100), radius=10,
                 fill=DK_ELEV, outline=DK_BORDER, width=1)
        d.text((x + 16, ty + 16), label, fill=DK_MUTED, font=f_mono)
        d.text((x + 16, ty + 42), val, fill=vcolor, font=pil_font(26, weight="bold"))
        d.text((x + 16, ty + 76), "↑ last 24h", fill=DK_FAINT, font=pil_font(10, mono=True))

    # Big "Connect Shopify" CTA card
    cy = 300
    _rounded(d, (tx, cy, tx + 540, cy + 200), radius=12, fill=(20, 28, 48),
             outline=DK_ACCENT, width=2)
    d.text((tx + 24, cy + 22), "GET STARTED  ·  STEP 1 OF 2",
           fill=DK_ACCENT, font=f_mono)
    d.text((tx + 24, cy + 42), "Connect your Shopify store",
           fill=DK_TEXT, font=pil_font(20, weight="bold"))
    d.text((tx + 24, cy + 78),
           "Paste your store URL + Admin API token. We'll pull your\n"
           "last 200 orders the moment you connect.",
           fill=DK_MUTED, font=pil_font(13))
    _rounded(d, (tx + 24, cy + 148, tx + 200, cy + 178), radius=999, fill=DK_ACCENT)
    d.text((tx + 56, cy + 154), "CONNECT  →",
           fill=(15, 23, 42), font=pil_font(12, weight="bold"))

    # Side card — top-up wallet
    sx = tx + 560
    _rounded(d, (sx, cy, sx + 280, cy + 200), radius=12,
             fill=DK_ELEV, outline=DK_BORDER, width=1)
    d.text((sx + 22, cy + 22), "WALLET",       fill=DK_MUTED, font=f_mono)
    d.text((sx + 22, cy + 42), "₹24,500.00",   fill=DK_TEXT,  font=pil_font(22, weight="bold"))
    d.text((sx + 22, cy + 80), "Top up before each batch.\nPer-order debit on dispatch.",
           fill=DK_MUTED, font=pil_font(12))
    _rounded(d, (sx + 22, cy + 148, sx + 160, cy + 178), radius=999,
             fill=(20, 28, 48), outline=DK_ACCENT, width=1)
    d.text((sx + 38, cy + 154), "+ TOP UP",
           fill=DK_ACCENT, font=pil_font(12, weight="bold"))

    return img


def screenshot_connect_shopify():
    """Step 3 — connect Shopify modal with how-to + form."""
    img, d, SW = _portal_chrome(page_label="ORDERS")
    W, H = img.size

    # dim overlay
    overlay = Image.new("RGBA", (W, H), (15, 23, 42, 200))
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"))
    d = ImageDraw.Draw(img, "RGBA")

    # modal card
    MW, MH = 640, 600
    mx = (W - MW) // 2
    my = (H - MH) // 2
    _rounded(d, (mx, my, mx + MW, my + MH), radius=14, fill=DK_ELEV,
             outline=DK_BORDER, width=1)

    f_mono = pil_font(10, mono=True)
    d.text((mx + 32, my + 30), "🛍  CONNECT SHOPIFY", fill=DK_ACCENT, font=f_mono)
    d.text((mx + 32, my + 50), "Get your Admin API token",
           fill=DK_TEXT, font=pil_font(22, weight="bold"))

    # tabs
    d.text((mx + 32, my + 96), "① How to get it",
           fill=DK_ACCENT, font=pil_font(12, weight="bold"))
    d.line((mx + 32, my + 116, mx + 158, my + 116), fill=DK_ACCENT, width=2)
    d.text((mx + 180, my + 96), "② Connect", fill=DK_MUTED, font=pil_font(12))

    # steps
    steps = [
        ("1", "Shopify admin → Settings → Apps and sales channels → Develop apps."),
        ("2", "Click 'Create an app', name it Aviva Fulfilment."),
        ("3", "Configuration → Admin API scopes → tick read_orders, read_customers."),
        ("4", "Install app → API credentials → reveal the Admin API token (shpat_...)."),
        ("5", "Come back here, hit step ② and paste the domain + token."),
    ]
    sy = my + 150
    for no, body in steps:
        _rounded(d, (mx + 32, sy, mx + 60, sy + 28), radius=14,
                 fill=(49, 46, 129), outline=DK_ACCENT, width=1)
        d.text((mx + 42, sy + 8), no, fill=DK_ACCENT,
               font=pil_font(12, weight="bold"))
        d.text((mx + 76, sy + 6), body, fill=DK_TEXT, font=pil_font(12))
        sy += 50

    # secure footer
    sy += 18
    d.text((mx + 32, sy), "🔒  Token is encrypted at rest, never sent to your browser after this.",
           fill=DK_FAINT, font=pil_font(11))

    return img


def screenshot_add_products():
    """Step 4 — Add Products modal (card layout + designs)."""
    img, d, SW = _portal_chrome(page_label="MY PRODUCTS")
    W, H = img.size

    overlay = Image.new("RGBA", (W, H), (15, 23, 42, 200))
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"))
    d = ImageDraw.Draw(img, "RGBA")

    MW, MH = 780, 640
    mx = (W - MW) // 2
    my = (H - MH) // 2 - 10
    _rounded(d, (mx, my, mx + MW, my + MH), radius=14, fill=DK_ELEV,
             outline=DK_BORDER, width=1)

    f_mono = pil_font(10, mono=True)
    d.text((mx + 32, my + 28), "ADD PRODUCTS", fill=DK_ACCENT, font=f_mono)
    d.text((mx + 32, my + 48), "1 product · 2 designs",
           fill=DK_TEXT, font=pil_font(22, weight="bold"))
    d.text((mx + 32, my + 80),
           "Upload one or many designs per product. Each design needs a print width × height.",
           fill=DK_MUTED, font=pil_font(12))

    # the card
    cx, cy = mx + 28, my + 118
    cw = MW - 56
    _rounded(d, (cx, cy, cx + cw, cy + 460), radius=12, fill=(20, 28, 48),
             outline=DK_BORDER, width=1)

    # card head
    _rounded(d, (cx + 16, cy + 16, cx + 60, cy + 38), radius=4, fill=(49, 46, 129))
    d.text((cx + 28, cy + 21), "01", fill=DK_ACCENT, font=pil_font(10, mono=True))
    _rounded(d, (cx + 68, cy + 16, cx + 124, cy + 38), radius=4,
             fill=(20, 60, 50), outline=DK_SUCCESS, width=1)
    d.text((cx + 82, cy + 21), "READY", fill=DK_SUCCESS, font=pil_font(10, mono=True))

    # field row 1
    def field(x, y, w, label, value, mono=False):
        d.text((x, y), label, fill=DK_MUTED, font=pil_font(10, mono=True))
        _rounded(d, (x, y + 16, x + w, y + 48), radius=6,
                 fill=DK_BG, outline=DK_BORDER, width=1)
        d.text((x + 12, y + 26), value, fill=DK_TEXT, font=pil_font(12, mono=mono))

    fy = cy + 60
    field(cx + 16,  fy, 220, "PRODUCT NAME",  "Lotus crew tee")
    field(cx + 248, fy, 140, "SELLING PRICE", "₹699", mono=True)
    field(cx + 400, fy, 180, "CATEGORY",      "Oversized boxy")
    field(cx + 592, fy, 132, "SIZES",         "S · M · L · XL")

    # designs block
    dy = fy + 80
    d.text((cx + 16, dy), "DESIGNS  ·  PNG / JPEG up to 10 MB each",
           fill=DK_ACCENT, font=pil_font(10, mono=True))
    d.text((cx + 320, dy), "We print at the exact W × H you set below.",
           fill=DK_FAINT, font=pil_font(10))

    # design row 1
    dry = dy + 22
    _rounded(d, (cx + 16, dry, cx + cw - 16, dry + 96), radius=10,
             fill=DK_BG, outline=DK_BORDER, width=1)
    # thumb
    _rounded(d, (cx + 28, dry + 12, cx + 100, dry + 84), radius=8,
             fill=(45, 55, 72))
    # fake lotus shape
    d.ellipse((cx + 44, dry + 30, cx + 84, dry + 70), outline=DK_ACCENT, width=2)
    d.line((cx + 64, dry + 30, cx + 64, dry + 70), fill=DK_ACCENT, width=2)
    # name
    d.text((cx + 116, dry + 18), "lotus-front.png", fill=DK_TEXT,
           font=pil_font(12, weight="bold"))
    d.text((cx + 116, dry + 36), "1.4 MB",  fill=DK_MUTED, font=pil_font(11))
    # W H inputs
    def dim(x, y, label, value):
        d.text((x, y), label, fill=DK_MUTED, font=pil_font(9, mono=True))
        _rounded(d, (x, y + 12, x + 80, y + 38), radius=6,
                 fill=DK_ELEV, outline=DK_BORDER, width=1)
        d.text((x + 12, y + 18), value, fill=DK_TEXT, font=pil_font(12, mono=True))
    dim(cx + cw - 220, dry + 28, "WIDTH (in)",  '11.5"')
    dim(cx + cw - 124, dry + 28, "HEIGHT (in)", '13.0"')

    # design row 2
    dry2 = dry + 112
    _rounded(d, (cx + 16, dry2, cx + cw - 16, dry2 + 96), radius=10,
             fill=DK_BG, outline=DK_BORDER, width=1)
    _rounded(d, (cx + 28, dry2 + 12, cx + 100, dry2 + 84), radius=8,
             fill=(45, 55, 72))
    d.text((cx + 50, dry2 + 38), "AVIVA", fill=DK_ACCENT,
           font=pil_font(12, mono=True, weight="bold"))
    d.text((cx + 116, dry2 + 18), "back-print.jpg", fill=DK_TEXT,
           font=pil_font(12, weight="bold"))
    d.text((cx + 116, dry2 + 36), "920 KB", fill=DK_MUTED, font=pil_font(11))
    dim(cx + cw - 220, dry2 + 28, "WIDTH (in)",  '4.0"')
    dim(cx + cw - 124, dry2 + 28, "HEIGHT (in)", '4.0"')

    # add design button (dashed outline)
    add_y = dry2 + 112
    _rounded(d, (cx + 16, add_y, cx + cw - 16, add_y + 44),
             radius=10, fill=None, outline=DK_ACCENT, width=2)
    d.text((cx + cw // 2 - 70, add_y + 14), "+  ADD ANOTHER DESIGN",
           fill=DK_ACCENT, font=pil_font(12, weight="bold"))

    # save button
    _rounded(d, (mx + MW - 220, my + MH - 60, mx + MW - 32, my + MH - 24),
             radius=8, fill=DK_ACCENT)
    d.text((mx + MW - 178, my + MH - 50), "SAVE PRODUCTS  →",
           fill=(15, 23, 42), font=pil_font(12, weight="bold"))
    _rounded(d, (mx + 32, my + MH - 60, mx + 124, my + MH - 24),
             radius=8, fill=None, outline=DK_BORDER, width=1)
    d.text((mx + 60, my + MH - 50), "Cancel", fill=DK_MUTED, font=pil_font(12))

    return img


def screenshot_orders():
    """Step 5 — orders table with status chips."""
    img, d, SW = _portal_chrome(page_label="ORDERS")
    W, H = img.size

    f_mono = pil_font(10, mono=True)
    d.text((SW + 30, 60), "ORDERS  ·  LIVE",       fill=DK_ACCENT, font=f_mono)
    d.text((SW + 30, 78), "1,832 dispatched · 47 in production",
           fill=DK_TEXT, font=pil_font(22, weight="bold"))

    # pill row + sync now
    px = SW + 30
    py = 124
    for i, (lbl, on) in enumerate([("ALL 1,832", True), ("NEW 12", False),
                                    ("PRINTING 21", False), ("PACKED 14", False),
                                    ("DISPATCHED 1,785", False)]):
        bw = 12 + len(lbl) * 7
        _rounded(d, (px, py, px + bw, py + 26), radius=999,
                 fill=DK_ACCENT if on else (20, 28, 48),
                 outline=DK_BORDER if not on else None, width=1)
        d.text((px + 10, py + 8), lbl,
               fill=(15, 23, 42) if on else DK_TEXT, font=pil_font(10, mono=True))
        px += bw + 8

    # right side: "Last synced 6 s ago · Sync now"
    sx = W - 200
    d.text((sx, py + 4), "↻ Last synced 6 s ago",
           fill=DK_MUTED, font=pil_font(10, mono=True))

    # table
    tx, ty = SW + 30, py + 60
    tw = W - tx - 30
    th = 460
    _rounded(d, (tx, ty, tx + tw, ty + th), radius=12,
             fill=DK_ELEV, outline=DK_BORDER, width=1)

    # header row
    cols = [("ORDER",      80),
            ("CUSTOMER",   200),
            ("ITEMS",      60),
            ("TOTAL",      90),
            ("STATUS",     130),
            ("CREATED",    120)]
    _rounded(d, (tx, ty, tx + tw, ty + 40), radius=12,
             fill=(11, 18, 35))
    hx = tx + 16
    for col, w in cols:
        d.text((hx, ty + 14), col, fill=DK_MUTED, font=pil_font(10, mono=True))
        hx += w

    # rows
    rows = [
        ("#10821",  "Riya Sharma · Mumbai",   "3",  "₹1,485",  "DISPATCHED", "20 May", "live"),
        ("#10820",  "Aman Khanna · Delhi",    "1",  "₹545",    "PACKED",     "20 May", "draft"),
        ("#10819",  "Ishaan Roy · Bengaluru", "2",  "₹890",    "PRINTING",   "20 May", "draft"),
        ("#10818",  "Naina Mehta · Pune",     "5",  "₹2,225",  "DISPATCHED", "19 May", "live"),
        ("#10817",  "Kabir Singh · Jaipur",   "1",  "₹445",    "DISPATCHED", "19 May", "live"),
        ("#10816",  "Sara Iyer · Chennai",    "2",  "₹890",    "NEW",        "19 May", "new"),
        ("#10815",  "Vir Banerjee · Kolkata", "1",  "₹545",    "DISPATCHED", "18 May", "live"),
        ("#10814",  "Tara Joshi · Hyderabad", "4",  "₹1,780",  "DISPATCHED", "18 May", "live"),
    ]
    ry = ty + 50
    for r in rows:
        rx = tx + 16
        # order #
        d.text((rx, ry + 4), r[0], fill=DK_TEXT, font=pil_font(12, mono=True, weight="bold"))
        rx += cols[0][1]
        # customer (two lines)
        d.text((rx, ry + 4),  r[1].split(" · ")[0], fill=DK_TEXT,  font=pil_font(12))
        d.text((rx, ry + 20), r[1].split(" · ")[1], fill=DK_FAINT, font=pil_font(10))
        rx += cols[1][1]
        # items
        d.text((rx, ry + 4), r[2], fill=DK_TEXT, font=pil_font(12, mono=True))
        rx += cols[2][1]
        # total
        d.text((rx, ry + 4), r[3], fill=DK_TEXT,
               font=pil_font(12, mono=True, weight="bold"))
        rx += cols[3][1]
        # status chip
        status = r[4]; tone = r[6]
        col_fill, col_text = {
            "live":  ((20, 60, 50),  DK_SUCCESS),
            "draft": ((30, 41, 59),  DK_MUTED),
            "new":   ((49, 46, 129), DK_ACCENT),
        }[tone]
        cw_chip = 16 + len(status) * 6
        _rounded(d, (rx, ry + 4, rx + cw_chip, ry + 24), radius=999, fill=col_fill,
                 outline=col_text, width=1)
        d.text((rx + 10, ry + 9), status, fill=col_text, font=pil_font(9, mono=True))
        rx += cols[4][1]
        # date
        d.text((rx, ry + 4), r[5], fill=DK_MUTED, font=pil_font(11, mono=True))
        # separator
        d.line((tx + 12, ry + 42, tx + tw - 12, ry + 42), fill=DK_BORDER, width=1)
        ry += 50

    return img


# ══════════════════════════════════════════════════════════════════
# PDF BUILDER
# ══════════════════════════════════════════════════════════════════

def img_to_reader(pil_img):
    """PIL Image → ImageReader for reportlab."""
    buf = BytesIO()
    pil_img.save(buf, format="PNG", optimize=True)
    buf.seek(0)
    return ImageReader(buf)


def draw_page_chrome(c, page_no, total):
    """Light page bg + footer + page number on every page."""
    c.setFillColor(PAGE_BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Top mini header
    c.setFillColor(TEXT_FAINT)
    c.setFont("SFMono", 7.5)
    c.drawString(36, PAGE_H - 28, "AVIVA  INTERNATIONAL  ·  CLIENT  ONBOARDING  GUIDE")
    c.drawRightString(PAGE_W - 36, PAGE_H - 28, f"PAGE  {page_no:02d}  /  {total:02d}")
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(36, PAGE_H - 36, PAGE_W - 36, PAGE_H - 36)

    # Footer
    c.setFillColor(TEXT_FAINT)
    c.setFont("SFMono", 7.5)
    c.drawString(36, 24, "avivainternational.co")
    c.drawRightString(PAGE_W - 36, 24, "PRESSROOM FLOOR  ·  DELHI")


def page_cover(c):
    """Page 1 — cover."""
    draw_page_chrome(c, 1, 7)

    # big logo
    cx = PAGE_W / 2
    # rounded square
    sz = 96
    c.setFillColor(ACCENT)
    c.roundRect(cx - sz / 2, PAGE_H - 230, sz, sz, 22, fill=1, stroke=0)
    c.setFillColor(TEXT_STRONG)
    c.setFont("SF", 64)
    c.drawCentredString(cx, PAGE_H - 218, "A")

    # title
    c.setFillColor(TEXT_STRONG)
    c.setFont("SF", 38)
    c.drawCentredString(cx, PAGE_H - 290, "Welcome to Aviva")

    c.setFillColor(TEXT_BODY)
    c.setFont("SF", 14)
    c.drawCentredString(cx, PAGE_H - 318, "Your 5-step onboarding guide.")

    # eyebrow
    c.setFillColor(ACCENT)
    c.setFont("SFMono", 9)
    c.drawCentredString(cx, PAGE_H - 260, "PRINT-ON-DEMAND  ·  MADE IN DELHI")

    # the 5 steps stacked
    steps = [
        ("01", "Sign in",          "Create your account in 30 seconds."),
        ("02", "Inside the dash",  "Meet your dashboard, sidebar, and metrics."),
        ("03", "Connect Shopify",  "Paste your store + token. We pull 200 orders."),
        ("04", "Add products",     "Upload designs with width × height in inches."),
        ("05", "See orders",       "Every order flows in live. No spreadsheets."),
    ]
    y = PAGE_H - 400
    for no, title, sub in steps:
        c.setStrokeColor(BORDER)
        c.setFillColor(CARD_BG)
        c.roundRect(80, y - 50, PAGE_W - 160, 50, 10, fill=1, stroke=1)

        # number badge
        c.setFillColor(ACCENT_SOFT)
        c.roundRect(96, y - 40, 30, 30, 6, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        c.setFont("SFMono", 13)
        c.drawCentredString(111, y - 30, no)

        c.setFillColor(TEXT_STRONG)
        c.setFont("SF", 14)
        c.drawString(140, y - 24, title)
        c.setFillColor(TEXT_MUTED)
        c.setFont("SF", 11)
        c.drawString(140, y - 40, sub)

        y -= 60

    # bottom line
    c.setFillColor(TEXT_MUTED)
    c.setFont("SF", 10)
    c.drawCentredString(cx, 68,
                        "Read this once, keep it open while you onboard. ~7 minutes total.")
    c.setFillColor(TEXT_FAINT)
    c.setFont("SFMono", 8)
    c.drawCentredString(cx, 52, "v1.0  ·  2026  ·  avivainternational05@gmail.com")

    c.showPage()


def step_page(c, page_no, total, step_no, title, subtitle, screenshot, steps):
    """Generic step page: eyebrow, title, screenshot, numbered steps."""
    draw_page_chrome(c, page_no, total)

    # Eyebrow + title
    c.setFillColor(ACCENT)
    c.setFont("SFMono", 9)
    c.drawString(36, PAGE_H - 64, f"STEP  {step_no}  OF  5")

    c.setFillColor(TEXT_STRONG)
    c.setFont("SF", 28)
    c.drawString(36, PAGE_H - 92, title)

    c.setFillColor(TEXT_BODY)
    c.setFont("SF", 12)
    c.drawString(36, PAGE_H - 112, subtitle)

    # Screenshot — fit within column
    iw, ih = screenshot.size
    target_w = PAGE_W - 72
    scale = target_w / iw
    target_h = ih * scale
    # Cap height so we keep room for steps
    max_h = 290
    if target_h > max_h:
        scale = max_h / ih
        target_w = iw * scale
        target_h = ih * scale
    sx = (PAGE_W - target_w) / 2
    sy = PAGE_H - 130 - target_h

    # Screenshot frame
    c.saveState()
    c.setStrokeColor(BORDER_STRONG)
    c.setLineWidth(0.6)
    c.roundRect(sx - 4, sy - 4, target_w + 8, target_h + 8, 10, fill=0, stroke=1)
    c.drawImage(img_to_reader(screenshot), sx, sy, width=target_w, height=target_h,
                preserveAspectRatio=True, mask='auto')
    c.restoreState()

    # Steps below screenshot
    y = sy - 28
    for i, (head, body) in enumerate(steps, 1):
        # circle number
        c.setFillColor(ACCENT)
        c.circle(50, y, 10, fill=1, stroke=0)
        c.setFillColor(ACCENT_INK)
        c.setFont("SF", 11)
        c.drawCentredString(50, y - 3.5, str(i))

        # head
        c.setFillColor(TEXT_STRONG)
        c.setFont("SF", 12)
        c.drawString(72, y + 1, head)

        # body
        c.setFillColor(TEXT_BODY)
        c.setFont("SF", 10.5)
        # wrap manually
        words = body.split()
        line = ""
        bx = 72
        by = y - 14
        max_w = PAGE_W - 36 - bx
        for w in words:
            test = (line + " " + w).strip()
            if c.stringWidth(test, "SF", 10.5) > max_w:
                c.drawString(bx, by, line)
                line = w
                by -= 12
            else:
                line = test
        if line:
            c.drawString(bx, by, line)
            by -= 12

        y = by - 14

    c.showPage()


def page_help(c, page_no, total):
    """Last page — support contacts."""
    draw_page_chrome(c, page_no, total)

    c.setFillColor(ACCENT)
    c.setFont("SFMono", 9)
    c.drawString(36, PAGE_H - 64, "NEED  HELP?")

    c.setFillColor(TEXT_STRONG)
    c.setFont("SF", 28)
    c.drawString(36, PAGE_H - 94, "We've got your back.")

    c.setFillColor(TEXT_BODY)
    c.setFont("SF", 12)
    c.drawString(36, PAGE_H - 114,
                 "Stuck on any step? Reach us — we usually reply within an hour.")

    # Contact cards
    contacts = [
        ("WHATSAPP",
         "+91 92177 65507",
         "Quickest. Send a screenshot of where you got stuck.",
         "Mon – Sat  ·  10 am – 8 pm  IST"),
        ("EMAIL",
         "avivainternational05@gmail.com",
         "Best for invoices, GST, longer questions.",
         "Replies within 1 working day"),
        ("CLIENT PORTAL",
         "avivainternational.co  →  Client Login",
         "Live order status, designs, wallet, support tickets.",
         "24 × 7 access"),
    ]
    y = PAGE_H - 170
    for tag, headline, body, hours in contacts:
        c.setStrokeColor(BORDER)
        c.setFillColor(CARD_BG)
        c.roundRect(36, y - 110, PAGE_W - 72, 110, 10, fill=1, stroke=1)

        # tag pill
        c.setFillColor(ACCENT_SOFT)
        c.roundRect(52, y - 26, 70, 16, 8, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        c.setFont("SFMono", 8)
        c.drawCentredString(87, y - 22, tag)

        c.setFillColor(TEXT_STRONG)
        c.setFont("SF", 17)
        c.drawString(52, y - 50, headline)

        c.setFillColor(TEXT_BODY)
        c.setFont("SF", 11)
        c.drawString(52, y - 70, body)

        c.setFillColor(TEXT_MUTED)
        c.setFont("SFMono", 8.5)
        c.drawString(52, y - 90, hours)

        y -= 124

    # Sign-off
    c.setFillColor(TEXT_MUTED)
    c.setFont("SF", 11)
    c.drawCentredString(PAGE_W / 2, 90,
                        "That's it. Sign in, connect Shopify, upload a design —")
    c.drawCentredString(PAGE_W / 2, 76,
                        "and your first order is on its way to the press.")

    c.setFillColor(ACCENT)
    c.setFont("SF", 12)
    c.drawCentredString(PAGE_W / 2, 58, "Welcome to the Pressroom Floor.")

    c.showPage()


# ══════════════════════════════════════════════════════════════════
# BUILD
# ══════════════════════════════════════════════════════════════════

def build():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    print("Rendering screenshots…")
    shots = {
        "signup":   screenshot_signup(),
        "dash":     screenshot_dashboard(),
        "shopify":  screenshot_connect_shopify(),
        "addprod":  screenshot_add_products(),
        "orders":   screenshot_orders(),
    }

    print("Composing PDF…")
    c = canvas.Canvas(OUT, pagesize=A4)
    c.setTitle("Aviva Onboarding Guide")
    c.setAuthor("Aviva International")
    c.setSubject("How to onboard onto avivainternational.co")

    page_cover(c)

    step_page(c, 2, 7, 1,
              "Sign in or sign up",
              "Your account takes 30 seconds. No email verification.",
              shots["signup"],
              [
                  ("Open avivainternational.co",
                   "Either on your laptop or phone. The 'CLIENT LOGIN' button is in the top-right."),
                  ("Click 'Create account'",
                   "First-time only. Already signed up? Use 'Sign in' instead — same screen."),
                  ("Fill three things",
                   "Brand name (e.g. Hashway Clothing). Your email. A password — at least 8 characters."),
                  ("Hit 'Create account'",
                   "We log you in straight away — no email confirmation link to chase."),
              ])

    step_page(c, 3, 7, 2,
              "Inside your dashboard",
              "This is what you'll see every time you sign in.",
              shots["dash"],
              [
                  ("The left sidebar",
                   "Five pages: Dashboard, My Products, Orders, Wallet, Support. Click any to jump."),
                  ("The four metric tiles",
                   "Orders today · In production · Dispatched · Wallet balance. They update live."),
                  ("The big indigo card",
                   "On day one this asks you to connect Shopify. Click it to move to Step 3."),
                  ("The wallet box on the right",
                   "Top up before each batch. We debit per order on dispatch — no monthly fees."),
              ])

    step_page(c, 4, 7, 3,
              "Connect your Shopify store",
              "We pull your last 200 orders the moment you connect.",
              shots["shopify"],
              [
                  ("Open the modal",
                   "Click 'Connect Shopify' on the dashboard, or go to Orders → Connect."),
                  ("Get your Admin API token from Shopify",
                   "Settings → Apps → Develop apps → Create app 'Aviva Fulfilment'. Tick scopes "
                   "read_orders and read_customers, then install."),
                  ("Copy the token",
                   "It starts with shpat_. Keep it private — never share it on WhatsApp screenshots."),
                  ("Switch to tab ② and paste",
                   "Your *.myshopify.com domain + the token. Hit Connect. Done — last 200 orders sync immediately."),
              ])

    step_page(c, 5, 7, 4,
              "Add your products",
              "One card per product. As many designs as you want per card.",
              shots["addprod"],
              [
                  ("Click 'Add Products' on My Products",
                   "A modal opens. Each product is a card you fill in top-to-bottom."),
                  ("Fill the basics",
                   "Product name. Selling price (₹). Pick a blank: oversized boxy / acid wash / waffle. Tick sizes."),
                  ("Upload designs",
                   "Click '+ Add Design', pick a PNG or JPEG up to 10 MB. Enter the exact "
                   "WIDTH × HEIGHT in inches — that's the size we'll print at."),
                  ("Need more than one design?",
                   "Hit '+ ADD ANOTHER DESIGN' inside the same card. Front + back + sleeve — stack them all."),
                  ("Paste your Shopify link, then Save",
                   "The product appears under My Products with thumbnails of every design and its dimensions."),
              ])

    step_page(c, 6, 7, 5,
              "Watch your orders roll in",
              "Real Shopify orders, real-time. Filter, search, follow the status.",
              shots["orders"],
              [
                  ("Open the Orders page",
                   "Every Shopify order auto-syncs in. No CSV uploads, no copy-paste."),
                  ("Read the status chip",
                   "NEW → PRINTING → PACKED → DISPATCHED → DELIVERED. We update it as your order moves through the floor."),
                  ("Use the pills to filter",
                   "ALL · NEW · PRINTING · PACKED · DISPATCHED. Counts update live."),
                  ("Click any row to see details",
                   "Customer, items, address, AWB once dispatched. Everything in one place."),
              ])

    page_help(c, 7, 7)

    c.save()
    print(f"✓  Wrote {OUT}  ({os.path.getsize(OUT) / 1024:.1f} KB)")


if __name__ == "__main__":
    build()
