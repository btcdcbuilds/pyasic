#!/usr/bin/env python3
"""Build the HTML mockup screens. No real prices, sizes or photos are used:
placeholders are labelled. Brand name is the working name from docs/12."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "screens")
UNIT = open(os.path.join(HERE, "unit.svg.txt")).read()
BRAND = "BaanPub"  # working name (docs/12) - not chosen yet


def page(title, body, extra_css=""):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>{title}</title><link rel="stylesheet" href="../common.css"><style>{extra_css}</style></head>
<body><div class="mock">MOCKUP</div>{body}</body></html>"""


# 1. Website home -------------------------------------------------------------
home_css = """
header{display:flex;align-items:center;justify-content:space-between;padding:18px 48px;background:#fff;border-bottom:1px solid var(--line)}
.logo{font-weight:800;font-size:22px}.logo span{color:var(--brand)}
nav a{margin:0 14px;color:var(--ink);text-decoration:none;font-size:15px}
.lang{font-size:13px;color:var(--muted);border:1px solid var(--line);padding:4px 8px;border-radius:6px}
.hero{display:grid;grid-template-columns:1.05fr 1fr;gap:24px;align-items:center;padding:44px 48px 24px}
h1{font-size:42px;line-height:1.15;margin:0 0 14px}h1 em{color:var(--brand);font-style:normal}
.sub{font-size:18px;color:var(--muted);margin-bottom:24px;max-width:560px}
.cta{display:flex;gap:12px;flex-wrap:wrap}
.trust{display:flex;gap:22px;margin-top:22px;font-size:14px;color:var(--muted)}
.heroimg{background:linear-gradient(180deg,#e9f4fb,#fff);border-radius:20px;padding:20px;border:1px solid var(--line);position:relative}
.heroimg .tag{position:absolute;left:18px;top:16px}
.ar{position:absolute;right:18px;bottom:16px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:8px 48px 40px}
.tile{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px}
.tile h3{margin:6px 0 6px;font-size:17px}.tile p{margin:0;color:var(--muted);font-size:14px}
.ico{font-size:26px}
"""
home = f"""
<header><div class="logo">{BRAND}<span>.</span></div>
<nav><a>Products</a><a>Site offices</a><a>Staff accommodation</a><a>Homes</a><a>Screw piles</a><a>Truck hire</a><a>Advice</a></nav>
<div style="display:flex;gap:10px;align-items:center"><span class="lang">ไทย | EN | 中文</span><a class="btn line">LINE</a></div></header>
<section class="hero"><div>
<span class="pill">Fold-out offices · homes · staff accommodation</span>
<h1>Ready-to-use units, <em>delivered and installed</em> on screw piles</h1>
<div class="sub">Pre-wired with lights, power points and a switchboard. AC-ready. Furniture packs available.
Send us a photo of your land and we'll show you the unit on it.</div>
<div class="cta"><a class="btn pri">📐 See it on your land</a><a class="btn line">Chat on LINE</a><a class="btn wa">WhatsApp</a></div>
<div class="trust"><span>🏗️ Screw-pile foundations</span><span>🚚 Delivery &amp; install</span><span>💬 Replies 24/7 (AI assistant + team)</span></div>
</div>
<div class="heroimg"><span class="pill tag">Illustration: real photos after the first container lands</span>{UNIT}
<a class="btn ghost ar">📱 View on my land (AR)</a></div></section>
<section class="tiles">
<div class="tile"><div class="ico">🦺</div><h3>Site offices</h3><p>Contractors, data-centre and factory sites. Relocatable.</p></div>
<div class="tile"><div class="ico">🛏️</div><h3>Staff accommodation</h3><p>Stackable layouts, cost-per-bed calculator.</p></div>
<div class="tile"><div class="ico">🏡</div><h3>Homes &amp; home offices</h3><p>Granny flat, rental room, farm house.</p></div>
<div class="tile"><div class="ico">🪑</div><h3>Furniture &amp; AC</h3><p>Matching packs, AC supplied and installed.</p></div>
</section>"""

# 2. See it on your land ------------------------------------------------------
land_css = """
.wrap{display:grid;grid-template-columns:380px 1fr;height:100vh}
aside{background:#fff;border-right:1px solid var(--line);padding:22px;overflow:hidden}
h2{margin:0 0 4px;font-size:22px}.step{border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:12px 0}
.step b{display:block;margin-bottom:6px}.done{border-color:#bfe3cc;background:#f3fbf6}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:6px 4px;text-align:left}
.ok{color:var(--ok);font-weight:700}
main{padding:20px;display:flex;flex-direction:column;gap:12px}
.bar{display:flex;gap:10px;align-items:center}
.canvas{flex:1;background:#fff;border:1px solid var(--line);border-radius:14px;position:relative;overflow:hidden}
.foot{display:flex;gap:16px;font-size:13px}
.chip{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px}
"""
site_svg = """
<svg viewBox="0 0 1000 640" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
<defs><pattern id="g" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#b9cf9e"/><circle cx="4" cy="5" r="1.4" fill="#a6c08a"/><circle cx="10" cy="11" r="1.2" fill="#a6c08a"/></pattern></defs>
<rect width="1000" height="640" fill="url(#g)"/>
<rect x="0" y="560" width="1000" height="80" fill="#9aa3ad"/><text x="20" y="606" fill="#fff" font-size="18">Soi (road)</text>
<rect x="640" y="90" width="240" height="170" fill="#c9b8a6" stroke="#8f7f6f"/><text x="690" y="182" font-size="16" fill="#5b4c3e">Existing house</text>
<circle cx="200" cy="140" r="46" fill="#6f9a52"/><circle cx="250" cy="170" r="34" fill="#7aa75c"/>
<polygon points="80,60 920,60 920,540 80,540" fill="none" stroke="#1f6fff" stroke-width="4" stroke-dasharray="14 8"/>
<rect x="420" y="530" width="120" height="20" fill="#fff"/><text x="436" y="546" font-size="13">Gate 4.0 m ✓</text>
<g><rect x="330" y="300" width="260" height="110" fill="#e8711a" fill-opacity=".55" stroke="#c45a0a" stroke-width="3"/>
<text x="380" y="352" font-size="18" font-weight="700">Office 1</text><text x="380" y="374" font-size="13">UNIT-FX-40 (size from drawings)</text>
<rect x="590" y="330" width="18" height="30" fill="#fff" stroke="#888"/></g>
<g><rect x="140" y="320" width="130" height="90" fill="#e8711a" fill-opacity=".55" stroke="#c45a0a" stroke-width="3"/>
<text x="160" y="362" font-size="16" font-weight="700">Store</text><text x="160" y="382" font-size="12">UNIT-FX-20</text></g>
<g stroke="#111" stroke-width="2"><line x1="270" y1="360" x2="330" y2="360"/><line x1="330" y1="410" x2="330" y2="540" stroke-dasharray="5 4"/></g>
<rect x="268" y="335" width="64" height="20" fill="#fff"/><text x="274" y="350" font-size="13">gap ?.? m</text>
<rect x="336" y="460" width="96" height="20" fill="#fff"/><text x="342" y="475" font-size="13">to fence ?.? m</text>
<path d="M455 540 L455 420" stroke="#1f6f8b" stroke-width="3" stroke-dasharray="8 6" marker-end="url(#a)"/>
<text x="462" y="490" font-size="13" fill="#1f6f8b">crane truck access</text>
<g transform="translate(930,110)"><circle r="22" fill="#fff" stroke="#333"/><path d="M0 -16 L7 6 L0 2 L-7 6Z" fill="#333"/><text x="-5" y="-26" font-size="14">N</text></g>
<rect x="20" y="20" width="230" height="34" fill="#fff" opacity=".9"/><line x1="32" y1="42" x2="182" y2="42" stroke="#000" stroke-width="5"/><text x="190" y="47" font-size="15">10 m</text>
<rect x="0" y="616" width="1000" height="24" fill="#fff"/><text x="10" y="633" font-size="13" fill="#c0392b">Concept layout for planning and quotation only. Not a survey. Not for permit submission unless checked by a licensed engineer.</text>
</svg>"""
land = f"""<div class="wrap"><aside>
<div style="font-weight:800;font-size:18px;margin-bottom:14px">{BRAND}<span style="color:var(--brand)">.</span> · See it on your land</div>
<h2>Your site layout</h2><div class="note">Site S-0001 · illustration below is a drawn example, not a real satellite image</div>
<div class="step done"><b>1 · Photos received ✓</b><span class="note">Location pin, measurement sketch, gate, ground photos</span></div>
<div class="step done"><b>2 · Measurements you confirmed ✓</b>
<table><tr><th>Item</th><th>Value</th><th></th></tr>
<tr><td>Front boundary</td><td>from your sketch</td><td class="ok">✓</td></tr>
<tr><td>Side boundary</td><td>from your sketch</td><td class="ok">✓</td></tr>
<tr><td>Gate width</td><td>4.0 m (example)</td><td class="ok">✓</td></tr></table></div>
<div class="step"><b>3 · Units</b>
<label><input type="checkbox" checked> Office 1 · UNIT-FX-40 · AC-ready</label><br>
<label><input type="checkbox" checked> Store · UNIT-FX-20</label><br>
<span class="note">Drag units on the plan · rotate with R</span></div>
<div class="step"><b>4 · Next</b><a class="btn pri" style="margin-top:6px">Get 3D model + drawings + quote</a>
<div class="note" style="margin-top:8px">Our site engineer builds the CAD model; a checker reviews it before it's sent.</div></div>
</aside><main>
<div class="bar"><span class="chip">Base image: 🛰️ Satellite</span><span class="chip">🚁 Upload drone photo</span><span class="chip">↶ Undo</span><span class="chip">⤢ Fit</span><span class="pill" style="margin-left:auto">Gaps shown once unit sizes are confirmed</span></div>
<div class="canvas">{site_svg}</div>
<div class="foot"><span class="chip">Units: 2</span><span class="chip">Overlaps: none ✓</span><span class="chip">Inside boundary ✓</span><span class="chip">Crane access path: clear</span><span class="chip">📤 Send to LINE</span></div>
</main></div>"""

# 3. Configurator -------------------------------------------------------------
cfg_css = """
.wrap{display:grid;grid-template-columns:1.2fr 1fr;gap:24px;padding:28px 40px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px}
h2{margin:0 0 12px}.opts label{display:flex;justify-content:space-between;align-items:center;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:8px 0;font-size:15px}
.opts label.on{border-color:var(--brand);background:#fff8f2}
.sku{font-size:12px;color:var(--muted);font-family:ui-monospace,monospace}
.price{font-size:13px}.sum td{padding:8px 0;border-bottom:1px solid var(--line);font-size:15px}
.seg{display:flex;gap:8px;margin-bottom:10px}.seg span{border:1px solid var(--line);border-radius:10px;padding:10px 14px}.seg .on{border-color:var(--brand);background:#fff8f2;font-weight:700}
"""
opt = lambda on, name, sku: f'<label class="{"on" if on else ""}"><span><input type="checkbox" {"checked" if on else ""}> {name}<br><span class="sku">{sku}</span></span><span class="price tbd">price list pending</span></label>'
cfg = f"""<header style="display:flex;justify-content:space-between;padding:18px 40px;background:#fff;border-bottom:1px solid var(--line)"><b style="font-size:20px">{BRAND}<span style="color:var(--brand)">.</span> · Build your unit</b><span class="note">Step 2 of 4</span></header>
<div class="wrap"><div class="card"><h2>1 · Size</h2>
<div class="seg"><span>UNIT-FX-20 · 20ft class</span><span class="on">UNIT-FX-40 · 40ft class</span></div>
<div class="note">Dimensions shown once supplier drawings are in: <span class="tbd">TBD</span></div>
<h2 style="margin-top:20px">2 · Options</h2><div class="opts">
{opt(True,"AC-ready (bracket, pipe sleeve, dedicated circuit)","OPT-ACR-40")}
{opt(False,"AC supplied &amp; installed (licensed partner)","OPT-ACI-40")}
{opt(True,"Upgraded insulation (rock wool)","OPT-INS-40")}
{opt(False,"Wet room (toilet, shower, basin)","OPT-WET-40")}
{opt(True,"Security grilles + security door","OPT-SEC-40")}
{opt(True,"Site office furniture pack","FURN-F-SITE")}
{opt(True,"Screw-pile kit (engineer-specified)","PILE-KIT-40")}
</div></div>
<div><div class="card" style="text-align:center">{UNIT}<div class="note">Illustration · 3D model and AR view will use the real drawings</div>
<div style="margin-top:10px;display:flex;gap:8px;justify-content:center"><a class="btn ghost">🔄 3D view</a><a class="btn ghost">📱 View on my land (AR)</a></div></div>
<div class="card" style="margin-top:16px"><h2>Your estimate</h2>
<table class="sum" style="width:100%;border-collapse:collapse">
<tr><td>UNIT-FX-40 + 5 options</td><td class="tbd" style="text-align:right">pending</td></tr>
<tr><td>Delivery (postcode 20230)</td><td class="tbd" style="text-align:right">pending</td></tr>
<tr><td>Installation on screw piles</td><td class="tbd" style="text-align:right">pending</td></tr>
<tr><td>VAT 7%</td><td style="text-align:right">calculated</td></tr></table>
<p class="note">Prices come only from our price list and appear here once it's set. Final quote is checked before it's sent.</p>
<div style="display:flex;gap:10px"><a class="btn pri">Get formal quote</a><a class="btn line">Ask on LINE</a></div></div></div></div>"""

# 4. LINE chat (phone) --------------------------------------------------------
phone_css = """
body{background:#d9dee5;display:flex;justify-content:center;align-items:center;min-height:100vh}
.phone{width:390px;height:844px;background:#8ca3c1;border-radius:44px;overflow:hidden;border:10px solid #111;display:flex;flex-direction:column;position:relative}
.top{background:#222b38;color:#fff;padding:44px 16px 12px;display:flex;align-items:center;gap:10px}
.av{width:36px;height:36px;border-radius:50%;background:var(--brand);display:flex;align-items:center;justify-content:center;font-weight:800}
.msgs{flex:1;padding:12px;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;overflow:hidden}
.b{max-width:78%;padding:9px 12px;border-radius:16px;font-size:14px;line-height:1.35}
.them{background:#fff;align-self:flex-start;border-top-left-radius:4px}.me{background:#a8e27a;align-self:flex-end;border-top-right-radius:4px}
.b table{border-collapse:collapse;font-size:12px;margin-top:4px}.b td{border:1px solid #ddd;padding:2px 6px}
.img{width:200px;height:120px;border-radius:10px;background:#b9cf9e;position:relative;overflow:hidden}
.bar2{background:#fff;padding:10px 12px;display:flex;gap:8px}.bar2 div{flex:1;background:#f1f3f6;border-radius:18px;padding:8px 12px;color:#999;font-size:14px}
.rich{display:grid;grid-template-columns:repeat(3,1fr);background:#fff;border-top:1px solid #ddd}.rich div{padding:10px 4px;text-align:center;font-size:12px;border-right:1px solid #eee}
"""
line = f"""<div class="phone"><div class="top"><div class="av">B</div><div><b>{BRAND} · Khun [Name]</b><div style="font-size:11px;opacity:.8">LINE Official Account · AI assistant + team</div></div></div>
<div class="msgs">
<div class="b them">สวัสดีครับ ผม[Name] ผู้ช่วย AI ของ {BRAND} ครับ 😊 อยากคุยกับทีมงานบอกได้เลยนะครับ<br>สนใจใช้งานแบบไหนครับ?</div>
<div class="b me">สำนักงานไซต์งานครับ 2 ตู้ ที่ชลบุรี</div>
<div class="b them">ได้เลยครับ! เพื่อวางผังบนที่ดินของคุณ รบกวนส่ง 📍ตำแหน่ง, 📝รูปขนาดที่ดิน และ 🚪รูปประตู/ถนนครับ<br><span style="font-size:11px;color:#888">นโยบายความเป็นส่วนตัว: [link]</span></div>
<div class="b me">📍 Location · 🖼️ 3 photos</div>
<div class="b them">ผมอ่านขนาดจากรูปได้ตามนี้ครับ ถูกต้องไหมครับ?
<table><tr><td>หน้าที่ดิน</td><td>(จากรูป)</td></tr><tr><td>ด้านข้าง</td><td>(จากรูป)</td></tr><tr><td>ประตู</td><td>4.0 ม.</td></tr></table></div>
<div class="b me">ถูกต้องครับ ✅</div>
<div class="b them">นี่คือผังเบื้องต้นครับ 👇<div class="img">
<svg viewBox="0 0 200 120"><rect width="200" height="120" fill="#b9cf9e"/><rect x="10" y="10" width="180" height="96" fill="none" stroke="#1f6fff" stroke-dasharray="5 3" stroke-width="2"/><rect x="70" y="50" width="70" height="28" fill="#e8711a" opacity=".7"/><rect x="25" y="55" width="34" height="22" fill="#e8711a" opacity=".7"/><rect y="106" width="200" height="14" fill="#9aa3ad"/></svg></div>
<span style="font-size:11px;color:#888">ผังแนวคิดเพื่อประเมินราคาเท่านั้น</span><br>ต่อไปจะส่งแบบ 3D และใบเสนอราคาให้ครับ</div>
</div>
<div class="rich"><div>🏠 สินค้า</div><div>📐 วางผัง</div><div>🧾 ขอใบเสนอราคา</div></div>
<div class="bar2"><div>Aa</div></div></div>"""

# 5. Owner approvals (Telegram-style) -----------------------------------------
tg = f"""<div class="phone" style="background:#c9d7e6"><div class="top" style="background:#2b5278"><div class="av" style="background:#1f6f8b">OM</div><div><b>Ops Manager</b><div style="font-size:11px;opacity:.8">{BRAND} · your AI team</div></div></div>
<div class="msgs">
<div class="b them"><b>☀️ Morning brief</b><br>• Approvals waiting: <b>2</b><br>• New leads yesterday: (from CRM)<br>• Jobs stuck &gt;1 day: 0<br>• 0% duty check: <b style="color:#c0392b">BLOCKED</b> (waiting on broker #2)</div>
<div class="b them"><b>🧾 Approval #A-0007: quote</b><br>Customer: (contractor, Chonburi)<br>2 units + options + install<br>Total: <i>from price list</i> (above your limit)<br>QA check: ✅ passed<br>Recommendation: approve<br>
<div style="display:flex;gap:6px;margin-top:8px"><span class="btn" style="background:#2e8b57;color:#fff;padding:6px 14px">YES</span><span class="btn" style="background:#c0392b;color:#fff;padding:6px 14px">NO</span><span class="btn ghost" style="padding:6px 14px">CHANGE</span></div></div>
<div class="b me">YES</div>
<div class="b them">✅ Logged. Sales &amp; Support is sending the quote now.</div>
<div class="b them"><b>⚠️ Supplier message (draft)</b><br>Supply &amp; Customs drafted a reply to the factory about Form E. Chinese + English attached.<br><span class="btn ghost" style="padding:5px 12px;margin-top:6px">Review draft</span></div>
</div><div class="bar2"><div>Message</div></div></div>"""

screens = {
    "01-website-home.html": page("Website home", home, home_css),
    "02-see-it-on-your-land.html": page("See it on your land", land, land_css),
    "03-configurator.html": page("Configurator", cfg, cfg_css),
    "04-line-chat.html": page("LINE chat", line, phone_css),
    "05-owner-approvals.html": page("Owner approvals", tg, phone_css),
}
for name, html in screens.items():
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(html)
print("\n".join(screens))
