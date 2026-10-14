"""Generates the app icon (Play Store 512px + Android mipmaps) and the 1024x500 feature graphic.
Usage (from game/): python3 tools/make_art.py   (needs Pillow; run tools/store-assets.mjs first)"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import glob, os

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def icon(S, bg=True, safe=1.0):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        # diagonal split: blue army vs red army
        for y in range(S):
            for_x = int(S * 0.62 - y * 0.24)
            d.line([(0, y), (S, y)], fill=(24, 64, 170, 255))
            d.line([(for_x, y), (S, y)], fill=(196, 34, 40, 255))
        glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse([S * 0.1, S * 0.12, S * 0.9, S * 0.92], fill=(255, 255, 255, 60))
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(S * 0.08)))
    k = S * safe
    o = (S - k) / 2
    P = lambda x, y: (o + x * k, o + y * k)
    d = ImageDraw.Draw(im)
    # helmet dome
    x0, y0 = P(0.2, 0.12); x1, y1 = P(0.8, 0.72)
    d.pieslice([x0, y0, x1, y1], 180, 360, fill=(47, 123, 255, 255), outline=(255, 255, 255, 255), width=max(2, int(k * 0.025)))
    # shine
    sx0, sy0 = P(0.3, 0.2); sx1, sy1 = P(0.5, 0.38)
    d.pieslice([sx0, sy0, sx1, sy1], 190, 280, fill=(160, 200, 255, 255))
    # brim
    bx0, by0 = P(0.12, 0.4); bx1, by1 = P(0.88, 0.5)
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=k * 0.04, fill=(255, 200, 26, 255), outline=(255, 255, 255, 255), width=max(2, int(k * 0.02)))
    # star
    import math
    cx, cy = P(0.5, 0.27)
    r1, r2 = k * 0.09, k * 0.04
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = r1 if i % 2 == 0 else r2
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    d.polygon(pts, fill=(255, 220, 60, 255), outline=(120, 80, 0, 255))
    # the army: a row of small helmets below
    for i, x in enumerate([0.2, 0.35, 0.5, 0.65, 0.8]):
        cx2, cy2 = P(x, 0.8 - (0.03 if i % 2 else 0))
        r = k * 0.075
        d.pieslice([cx2 - r, cy2 - r, cx2 + r, cy2 + r], 180, 360, fill=(47, 123, 255, 255), outline=(255, 255, 255, 255), width=max(1, int(k * 0.012)))
        d.rounded_rectangle([cx2 - r * 1.25, cy2 - r * 0.05, cx2 + r * 1.25, cy2 + r * 0.28], radius=r * 0.15, fill=(255, 200, 26, 255))
    return im

def save_icons():
    big = icon(1024)
    os.makedirs('store', exist_ok=True)
    big.resize((512, 512), Image.LANCZOS).convert('RGB').save('store/icon-512.png')
    res = 'android/app/src/main/res'
    for dpi, (leg, fg) in {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}.items():
        big.resize((leg, leg), Image.LANCZOS).save(f'{res}/mipmap-{dpi}/ic_launcher.png')
        m = Image.new('L', (1024, 1024), 0); ImageDraw.Draw(m).ellipse([0, 0, 1023, 1023], fill=255)
        r = big.copy(); r.putalpha(m); r.resize((leg, leg), Image.LANCZOS).save(f'{res}/mipmap-{dpi}/ic_launcher_round.png')
        icon(fg * 4, bg=False, safe=0.62).resize((fg, fg), Image.LANCZOS).save(f'{res}/mipmap-{dpi}/ic_launcher_foreground.png')
    # splash screens keep their existing sizes
    for p in glob.glob(f'{res}/drawable*/splash.png'):
        W, H = Image.open(p).size
        s = min(W, H)
        bg = Image.new('RGB', (W, H), (13, 21, 48))
        ic = icon(int(s * 0.45))
        bg.paste(ic, ((W - ic.width) // 2, (H - ic.height) // 2 - int(s * 0.08)), ic)
        d = ImageDraw.Draw(bg)
        f = ImageFont.truetype(FONT, int(s * 0.09))
        d.text((W / 2, (H + ic.height) / 2 + s * 0.0), 'ARMY RUSH', font=f, fill=(255, 255, 255), anchor='mt', stroke_width=int(s * 0.007), stroke_fill=(47, 123, 255))
        bg.save(p)

def feature_graphic():
    W, H = 1024, 500
    fg = Image.new('RGB', (W, H), (13, 21, 48))
    shots = sorted(glob.glob('store/screenshots/0[2-6]-*.png'))
    for i, p in enumerate(shots[:5]):
        sh = Image.open(p).convert('RGB')
        sh = sh.crop((0, 300, 1080, 1620)).resize((300, 367))
        x = int(-40 + i * 222)
        fg.paste(sh, (x, 133 - (i % 2) * 30))
    dark = Image.new('RGBA', (W, H), (8, 12, 30, 0))
    dd = ImageDraw.Draw(dark)
    for y in range(H):
        a = int(200 * max(0, 1 - y / 260))
        dd.line([(0, y), (W, y)], fill=(8, 12, 30, a))
    fg = Image.alpha_composite(fg.convert('RGBA'), dark)
    d = ImageDraw.Draw(fg)
    ic = icon(150)
    fg.alpha_composite(ic, (40, 30))
    d.text((210, 52), 'ARMY RUSH', font=ImageFont.truetype(FONT, 78), fill=(255, 255, 255), stroke_width=4, stroke_fill=(47, 123, 255))
    d.text((214, 140), 'Worlds at War', font=ImageFont.truetype(FONT, 34), fill=(255, 200, 26), stroke_width=2, stroke_fill=(40, 20, 0))
    fg.convert('RGB').save('store/feature-graphic-1024x500.png')

save_icons()
feature_graphic()
print('ok')
