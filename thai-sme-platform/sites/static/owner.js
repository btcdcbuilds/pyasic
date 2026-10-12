// Owner app: one page per business with six tabs. Talks to /owner/api/<slug>/...
(() => {
  "use strict";
  const app = document.getElementById("app");
  if (!app) return;
  const slug = app.dataset.slug;
  const API = `/owner/api/${slug}`;
  const root = document.documentElement;

  let S = null;        // last server summary
  let draft = null;    // website tab's editable copy of the site
  let dirty = false;   // unsaved website edits
  let binds = [];      // input index -> setter
  let bookingFilter = "upcoming";
  let pollTimer = null;

  // ------------------------------------------------------------- utilities
  const isTh = () => root.dataset.ui === "th";
  const L = (th, en) => (isTh() ? th : en);
  const bi = (th, en) => `<span lang="th">${th}</span><span lang="en">${en}</span>`; // static text only
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const baht = (n) => "฿" + Number(n || 0).toLocaleString("en-US");
  const tx = (v) => (v && typeof v === "object" ? (isTh() ? v.th : v.en) || v.en || v.th : v ?? "");
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => {
    const ks = p.split(".");
    let cur = o;
    ks.slice(0, -1).forEach((k) => { if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {}; cur = cur[k]; });
    cur[ks[ks.length - 1]] = v;
  };
  const panel = (name) => app.querySelector(`[data-panel="${name}"]`);

  function toast(msg, bad) {
    const t = document.querySelector(".toast");
    t.textContent = msg;
    t.className = "toast show" + (bad ? " bad" : "");
    clearTimeout(t._h);
    t._h = setTimeout(() => (t.className = "toast"), 3500);
  }

  async function api(path, opts = {}) {
    const headers = { "X-Requested-With": "owner-app", ...(opts.headers || {}) };
    let body = opts.body;
    if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
    const res = await fetch(API + path, { method: opts.method || "GET", headers, body, credentials: "same-origin" });
    if (res.status === 401 || res.redirected) { location.href = "/owner/login"; throw new Error("signed out"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || res.statusText); err.errors = data.errors; throw err; }
    return data;
  }

  async function load(keepDraft) {
    S = await api("/summary");
    if (!keepDraft || !draft) { draft = prepare(clone(S.site)); dirty = false; }
    renderAll();
  }

  // ------------------------------------------------------------- tabs
  function showTab(name) {
    if (!panel(name)) name = "today";
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    app.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
    history.replaceState(null, "", "#" + name);
    window.scrollTo(0, 0);
  }
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (b) showTab(b.dataset.tab);
  });
  document.addEventListener("langchange", () => S && renderAll());
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  function renderAll() {
    renderToday(); renderBookings(); renderWebsite(); renderPhotos();
    if (panel("pricing")) renderPricing();
    renderAI();
  }

  // ------------------------------------------------------------- TODAY
  function suggestions(site) {
    const out = [];
    const photos = (site.photos || []).length;
    if (photos < 3) out.push([bi("เพิ่มรูปอย่างน้อย 3 รูป — รูปจริงช่วยให้ลูกค้าตัดสินใจจอง", "Add at least 3 photos — real photos make people book"), "photos"]);
    if (!site.payments || !site.payments.promptpay_id || site.payments.promptpay_id === "0000000000")
      out.push([bi("ใส่พร้อมเพย์ของร้าน เพื่อรับมัดจำผ่าน QR", "Add your PromptPay number to take deposits by QR"), "website"]);
    if ((site.faq || []).length < 3) out.push([bi("เพิ่มคำถามที่พบบ่อย (ที่จอดรถ, การยกเลิก, เด็ก)", "Add FAQs (parking, cancellation, children)"), "website"]);
    if (site.rooms && (!site.pricing || site.pricing.mode !== "auto")) out.push([bi("เปิดราคาอัตโนมัติ เพื่อได้รายได้มากขึ้นช่วงห้องใกล้เต็ม", "Turn on Auto pricing to earn more when you're nearly full"), "pricing"]);
    if ((site.rooms || []).some((r) => r.confirmed === false)) out.push([bi("ยืนยันประเภทห้องที่เป็นร่าง", "Confirm your draft room types"), "website"]);
    out.push([bi("ให้ AI ช่วยเขียนข้อความแนะนำร้านให้น่าสนใจขึ้น", "Ask AI to make your About text more appealing"), "ai"]);
    return out;
  }

  function renderToday() {
    const st = S.stats;
    const upcoming = S.bookings.filter((b) => b.status !== "cancelled" && (b.date || b.check_in) >= new Date().toISOString().slice(0, 10)).slice(0, 5);
    const kpi = (n, th, en, tab, warn) => `<button class="kpi ${warn && n ? "warn" : ""}" data-go="${tab}"><b>${n}</b>${bi(th, en)}</button>`;
    panel("today").innerHTML = `
      <div class="kpis">
        ${kpi(st.pending, "รอยืนยัน", "To confirm", "bookings", true)}
        ${kpi(st.next7, "การจอง 7 วันข้างหน้า", "Next 7 days", "bookings")}
        ${kpi(st.deposits_due, "มัดจำยังไม่ได้รับ", "Deposits due", "bookings", true)}
        ${st.tonight_occupancy !== undefined ? kpi(st.tonight_occupancy + "%", "ห้องเต็มคืนนี้", "Full tonight", "pricing") : ""}
        ${kpi(st.ai_to_approve, "AI รออนุมัติ", "AI to approve", "ai", true)}
      </div>
      <h2>${bi("การจองที่กำลังจะมาถึง", "Coming up")}</h2>
      ${upcoming.length ? upcoming.map(bookingCard).join("") : `<p class="muted">${bi("ยังไม่มีการจอง", "No bookings yet")}</p>`}
      <h2>${bi("ทำให้เว็บไซต์ดีขึ้น", "Make your website better")}</h2>
      <ul class="todo">${suggestions(S.site).map(([t, tab]) => `<li><button class="link" data-go="${tab}">${t} →</button></li>`).join("")}</ul>`;
  }
  app.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) showTab(go.dataset.go);
  });

  // ------------------------------------------------------------- BOOKINGS
  function bookingWhen(b) {
    if (b.type === "room") return `${b.check_in} → ${b.check_out}`;
    return `${b.date} ${b.time || b.departure || ""}`;
  }
  function contactLink(c) {
    const digits = String(c).replace(/[^\d+]/g, "");
    return digits.length >= 9 ? `<a href="tel:${esc(digits)}">${esc(c)}</a>` : esc(c);
  }
  function bookingCard(b) {
    const status = { pending: bi("รอยืนยัน", "Pending"), confirmed: bi("ยืนยันแล้ว", "Confirmed"), cancelled: bi("ยกเลิก", "Cancelled") }[b.status];
    return `<article class="card booking ${b.status}">
      <div class="row"><strong>${esc(bookingWhen(b))}</strong><span class="badge ${b.status}">${status}</span></div>
      <div>${esc(b.summary)}</div>
      <div class="muted">${esc(b.name)} · ${contactLink(b.contact)} · Ref ${esc(b.ref)}</div>
      ${b.note ? `<div class="note">“${esc(b.note)}”</div>` : ""}
      ${b.total ? `<div>${bi("รวม", "Total")} <b>${baht(b.total)}</b>${b.deposit ? ` · ${bi("มัดจำ", "deposit")} ${baht(b.deposit)} ${b.deposit_paid ? "✅" : "⏳"}` : ""}</div>` : ""}
      <div class="actions">
        ${b.status !== "confirmed" ? `<button class="btn primary small" data-bk="${esc(b.ref)}" data-status="confirmed">${bi("ยืนยัน", "Confirm")}</button>` : ""}
        ${b.status !== "cancelled" ? `<button class="btn ghost small" data-bk="${esc(b.ref)}" data-status="cancelled">${bi("ยกเลิก", "Cancel")}</button>` : ""}
        ${b.deposit ? `<button class="btn ghost small" data-bk="${esc(b.ref)}" data-paid="${b.deposit_paid ? 0 : 1}">${b.deposit_paid ? bi("ยังไม่ได้รับมัดจำ", "Mark deposit unpaid") : bi("ได้รับมัดจำแล้ว", "Deposit received")}</button>` : ""}
      </div></article>`;
  }
  function renderBookings() {
    const today = new Date().toISOString().slice(0, 10);
    const list = S.bookings.filter((b) => {
      const start = b.date || b.check_in;
      if (bookingFilter === "upcoming") return start >= today && b.status !== "cancelled";
      if (bookingFilter === "pending") return b.status === "pending";
      if (bookingFilter === "past") return start < today;
      return true;
    });
    const chip = (k, th, en) => `<button class="chip ${bookingFilter === k ? "on" : ""}" data-filter="${k}">${bi(th, en)}</button>`;
    panel("bookings").innerHTML = `
      <div class="chips">${chip("upcoming", "กำลังจะมา", "Upcoming")}${chip("pending", "รอยืนยัน", "Pending")}${chip("past", "ที่ผ่านมา", "Past")}${chip("all", "ทั้งหมด", "All")}</div>
      ${list.length ? list.map(bookingCard).join("") : `<p class="muted">${bi("ไม่มีรายการ", "Nothing here")}</p>`}`;
  }
  app.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { bookingFilter = f.dataset.filter; renderBookings(); return; }
    const b = e.target.closest("[data-bk]");
    if (!b) return;
    const body = {};
    if (b.dataset.status) {
      if (b.dataset.status === "cancelled" && !confirm(L("ยกเลิกการจองนี้?", "Cancel this booking?"))) return;
      body.status = b.dataset.status;
    }
    if (b.dataset.paid) body.deposit_paid = b.dataset.paid === "1";
    try { await api(`/bookings/${b.dataset.bk}`, { method: "POST", body }); toast(L("บันทึกแล้ว", "Saved")); await load(true); }
    catch (err) { toast(err.message, true); }
  });

  // ------------------------------------------------------------- WEBSITE editor
  // Field: [path, labelTh, labelEn, type]. Types: text, area, int, times, tags, color, code, check
  const F = (path, th, en, type = "text") => ({ path, th, en, type });
  const biF = (path, th, en, type = "text") => [F(path + ".th", th + " (ไทย)", en + " (Thai)", type), F(path + ".en", th + " (อังกฤษ)", en + " (English)", type)];

  function prepare(site) {  // shape the data for editing
    (site.hours || []).forEach((h) => { if (typeof h.time === "string") h.time = { th: h.time, en: h.time }; });
    return site;
  }
  function serialize(site) {  // back to the stored shape
    const s = clone(site);
    (s.hours || []).forEach((h) => { if (h.time && h.time.th === h.time.en) h.time = h.time.th; });
    const used = new Set();
    ["rooms", "services", "tours"].forEach((k) => (s[k] || []).forEach((it) => {
      if (!it.code) {
        let base = String((it.name && it.name.en) || k).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || k;
        let code = base, i = 2;
        while ((s[k] || []).some((o) => o !== it && o.code === code) || used.has(code)) code = `${base}-${i++}`;
        it.code = code;
      }
      used.add(it.code);
    }));
    return s;
  }

  function sections(site) {
    const kind = site.booking.type;
    const out = [
      { key: "basics", th: "ข้อมูลหลัก", en: "Basics", fields: [...biF("name", "ชื่อร้าน", "Business name"), ...biF("tagline", "คำโปรย", "Tagline"), ...biF("about", "เกี่ยวกับเรา", "About us", "area")] },
      { key: "contact", th: "ติดต่อ", en: "Contact", fields: [F("contact.phone", "เบอร์โทร", "Phone"), F("contact.line_id", "LINE ID", "LINE ID"), F("contact.whatsapp", "WhatsApp (เช่น 66812345678)", "WhatsApp (e.g. 66812345678)"), F("contact.email", "อีเมล", "Email"), ...biF("contact.address", "ที่อยู่", "Address", "area"), F("contact.map_query", "คำค้นแผนที่", "Map search text"), F("payments.promptpay_id", "พร้อมเพย์ (เบอร์ 10 หลัก หรือเลข 13 หลัก)", "PromptPay (10-digit mobile or 13-digit ID)")] },
      { key: "hours", th: "เวลาเปิด", en: "Opening hours", list: "hours", item: [...biF("days", "วัน", "Days"), ...biF("time", "เวลา", "Time")], make: () => ({ days: { th: "", en: "" }, time: { th: "", en: "" } }) },
    ];
    if (site.menu || kind === "table" || kind === "pickup") out.push({
      key: "menu", th: "เมนู", en: "Menu", list: "menu", itemTitle: (c) => tx(c.category),
      item: [...biF("category", "หมวด", "Category")],
      child: { list: "items", th: "รายการ", en: "Dishes", item: [...biF("name", "ชื่อเมนู", "Dish"), F("price", "ราคา (บาท)", "Price (฿)", "int"), F("tags", "ป้าย", "Tags", "tags")], make: () => ({ name: { th: "", en: "" }, price: 0, tags: [] }) },
      make: () => ({ category: { th: "", en: "" }, items: [] }),
    });
    if (site.rooms || kind === "room") out.push({
      key: "rooms", th: "ห้องพัก", en: "Rooms", list: "rooms", itemTitle: (r) => tx(r.name),
      item: [...biF("name", "ชื่อห้อง", "Room name"), ...biF("desc", "รายละเอียด", "Description", "area"), F("capacity", "พักได้ (คน)", "Sleeps", "int"), F("units", "จำนวนห้อง", "Number of rooms", "int"), F("rate", "ราคาปกติ/คืน (บาท)", "Base rate / night (฿)", "int"), F("confirmed", "ยืนยันข้อมูลแล้ว", "Details confirmed", "check")],
      make: () => ({ code: "", name: { th: "", en: "" }, desc: { th: "", en: "" }, capacity: 2, units: 1, rate: 1000, confirmed: true }),
    });
    if (site.services || kind === "slot") out.push({
      key: "services", th: "บริการ", en: "Treatments", list: "services", itemTitle: (s) => tx(s.name),
      item: [...biF("name", "ชื่อบริการ", "Treatment")],
      child: { list: "options", th: "ระยะเวลาและราคา", en: "Durations & prices", item: [F("minutes", "นาที", "Minutes", "int"), F("price", "ราคา (บาท)", "Price (฿)", "int")], make: () => ({ minutes: 60, price: 0 }) },
      make: () => ({ code: "", name: { th: "", en: "" }, options: [{ minutes: 60, price: 0 }] }),
    });
    if (site.tours || kind === "seats") out.push({
      key: "tours", th: "ทริป", en: "Trips", list: "tours", itemTitle: (t) => tx(t.name),
      item: [...biF("name", "ชื่อทริป", "Trip"), ...biF("desc", "รายละเอียด", "Description", "area"), F("departures", "เวลาออก (เช่น 07:00, 09:30)", "Departures (e.g. 07:00, 09:30)", "times"), F("price_adult", "ราคาผู้ใหญ่", "Adult price", "int"), F("price_child", "ราคาเด็ก", "Child price", "int"), F("seats", "ที่นั่งต่อรอบ", "Seats per departure", "int")],
      make: () => ({ code: "", name: { th: "", en: "" }, desc: { th: "", en: "" }, departures: ["09:00"], price_adult: 0, price_child: 0, seats: 10 }),
    });
    out.push(
      { key: "highlights", th: "จุดเด่น", en: "Highlights", list: "highlights", item: [F("icon", "ไอคอน (อีโมจิ)", "Icon (emoji)"), F("th", "ข้อความ (ไทย)", "Text (Thai)"), F("en", "ข้อความ (อังกฤษ)", "Text (English)")], make: () => ({ icon: "⭐", th: "", en: "" }) },
      { key: "faq", th: "คำถามที่พบบ่อย", en: "FAQ", list: "faq", itemTitle: (f) => tx(f.q), item: [...biF("q", "คำถาม", "Question"), ...biF("a", "คำตอบ", "Answer", "area")], make: () => ({ q: { th: "", en: "" }, a: { th: "", en: "" } }) },
    );
    if (site.menu) out.push({ key: "delivery", th: "ลิงก์เดลิเวอรี่", en: "Delivery links", list: "delivery", item: [F("name", "แอป", "App"), F("url", "ลิงก์ (https://)", "Link (https://)")], make: () => ({ name: "", url: "https://" }) });
    const bf = [];
    if (kind === "table" || kind === "pickup") bf.push(F("booking.times", "เวลาที่รับจอง", "Booking times", "times"));
    if (kind === "table") bf.push(F("booking.max_party", "จำนวนคนสูงสุด", "Max party size", "int"));
    if (kind === "pickup") bf.push(F("booking.lead_days", "ต้องสั่งล่วงหน้า (วัน)", "Days' notice", "int"));
    if (kind === "slot") bf.push(F("booking.open", "เริ่มรับคิว", "First start time"), F("booking.last_start", "คิวสุดท้าย", "Last start time"), F("booking.step_minutes", "ช่วงเวลา (นาที)", "Slot every (minutes)", "int"), F("booking.max_people", "จำนวนคนต่อการจอง", "Max people per booking", "int"));
    if (kind === "room") bf.push(F("booking.max_nights", "พักสูงสุด (คืน)", "Max nights", "int"));
    if (kind === "room" || kind === "seats") bf.push(F("booking.deposit_percent", "มัดจำ (%)", "Deposit (%)", "int"));
    out.push({ key: "booking", th: "ตั้งค่าการจอง", en: "Booking settings", fields: bf });
    out.push({ key: "theme", th: "สีเว็บไซต์", en: "Website colours", fields: [F("theme.primary", "สีหลัก", "Main colour", "color"), F("theme.accent", "สีรอง", "Accent colour", "color"), F("theme.surface", "สีพื้นหลัง", "Background", "color"), F("theme.ink", "สีตัวอักษร", "Text colour", "color"), F("theme.hero_icon", "ไอคอน", "Icon")] });
    return out;
  }

  function input(obj, f) {
    const i = binds.length;
    const v = getPath(obj, f.path);
    const label = `<span class="lbl">${bi(esc(f.th), esc(f.en))}</span>`;
    let html;
    if (f.type === "area") html = `<textarea data-b="${i}" rows="3">${esc(v)}</textarea>`;
    else if (f.type === "int") html = `<input data-b="${i}" type="number" inputmode="numeric" value="${v ?? ""}">`;
    else if (f.type === "color") html = `<input data-b="${i}" type="color" value="${esc(v || "#000000")}">`;
    else if (f.type === "times") html = `<input data-b="${i}" value="${esc((v || []).join(", "))}" placeholder="09:00, 12:00">`;
    else if (f.type === "check") html = `<input data-b="${i}" type="checkbox" ${v !== false ? "checked" : ""}>`;
    else if (f.type === "tags") {
      const tags = ["spicy", "vegetarian", "vegan", "halal", "new", "popular"];
      const names = { spicy: "🌶️", vegetarian: "🌿", vegan: "🥦", halal: "☪️", new: "🆕", popular: "⭐" };
      html = `<span class="tags">${tags.map((t) => `<label class="tag"><input type="checkbox" data-b="${i}" data-tag="${t}" ${(v || []).includes(t) ? "checked" : ""}>${names[t]} ${t}</label>`).join("")}</span>`;
    } else html = `<input data-b="${i}" value="${esc(v)}">`;
    binds.push({ obj, f });
    return `<label class="field ${f.type}">${label}${html}</label>`;
  }

  function listHtml(arr, spec, owner, path) {
    const items = arr.map((it, idx) => `
      <div class="item">
        <div class="item-head"><strong>${esc(spec.itemTitle ? spec.itemTitle(it) || "…" : "#" + (idx + 1))}</strong>
          <span class="spacer"></span>
          <button class="icon" data-move="${path}|${idx}|-1" title="Up">↑</button>
          <button class="icon" data-move="${path}|${idx}|1" title="Down">↓</button>
          <button class="icon danger" data-del="${path}|${idx}" title="Delete">✕</button></div>
        <div class="grid">${spec.item.map((f) => input(it, f)).join("")}</div>
        ${spec.child ? `<div class="child"><h4>${bi(spec.child.th, spec.child.en)}</h4>${listHtml(it[spec.child.list] || (it[spec.child.list] = []), spec.child, it, path + "|" + idx + "|" + spec.child.list)}</div>` : ""}
      </div>`).join("");
    return `${items}<button class="btn ghost small" data-add="${path}">+ ${bi("เพิ่ม", "Add")}</button>`;
  }

  // path format: "menu" or "menu|2|items"
  function resolveList(path) {
    const parts = path.split("|");
    let arr = draft[parts[0]] || (draft[parts[0]] = []);
    let spec = sections(draft).find((s) => s.list === parts[0]);
    for (let i = 1; i < parts.length; i += 2) {
      const item = arr[Number(parts[i])];
      spec = spec.child;
      arr = item[parts[i + 1]] || (item[parts[i + 1]] = []);
    }
    return { arr, spec };
  }

  function renderWebsite() {
    binds = [];
    const secs = sections(draft);
    const open = panel("website").querySelector("details[open]")?.dataset.key;
    panel("website").innerHTML = `
      <p class="muted">${bi("แก้ไขแล้วกด บันทึก — ทุกการเปลี่ยนแปลงย้อนกลับได้", "Edit, then press Save — every change can be undone")}</p>
      ${secs.map((s) => `<details class="card sec" data-key="${s.key}" ${open === s.key ? "open" : ""}>
        <summary>${bi(s.th, s.en)}</summary>
        ${s.fields ? `<div class="grid">${s.fields.map((f) => input(draft, f)).join("")}</div>` : listHtml(draft[s.list] || (draft[s.list] = []), s, draft, s.list)}
      </details>`).join("")}
      <div class="errors"></div>
      <h3>${bi("ประวัติการแก้ไข", "Change history")}</h3>
      <ul class="history">${S.history.map((h, i) => `<li><span>${esc(h.created_at)} · ${esc(h.author)}${h.note ? " · " + esc(h.note) : ""}</span>${i > 0 ? ` <button class="link" data-restore="${h.id}">${bi("ย้อนกลับไปฉบับนี้", "Restore")}</button>` : ` <em>${bi("ฉบับปัจจุบัน", "current")}</em>`}</li>`).join("")}</ul>
      <div class="savebar ${dirty ? "show" : ""}"><span>${bi("มีการแก้ไขที่ยังไม่บันทึก", "Unsaved changes")}</span>
        <button class="btn ghost small" data-discard>${bi("ยกเลิก", "Discard")}</button>
        <button class="btn primary" data-save>${bi("บันทึก", "Save")}</button></div>`;
  }

  function markDirty() { dirty = true; panel("website").querySelector(".savebar")?.classList.add("show"); }
  panel("website").addEventListener("input", (e) => {
    const el = e.target.closest("[data-b]");
    if (!el) return;
    const { obj, f } = binds[Number(el.dataset.b)];
    let v = el.value;
    if (f.type === "int") v = el.value === "" ? null : parseInt(el.value, 10);
    if (f.type === "times") v = el.value.split(/[,\s]+/).filter(Boolean);
    if (f.type === "check") v = el.checked;
    if (f.type === "tags") {
      const cur = new Set(getPath(obj, f.path) || []);
      el.checked ? cur.add(el.dataset.tag) : cur.delete(el.dataset.tag);
      v = [...cur];
    }
    setPath(obj, f.path, v);
    markDirty();
  });
  panel("website").addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.add) { const { arr, spec } = resolveList(t.dataset.add); arr.push(spec.make()); markDirty(); renderWebsite(); }
    else if (t.dataset.del) {
      const parts = t.dataset.del.split("|"); const idx = Number(parts.pop());
      if (!confirm(L("ลบรายการนี้?", "Delete this item?"))) return;
      resolveList(parts.join("|")).arr.splice(idx, 1); markDirty(); renderWebsite();
    } else if (t.dataset.move) {
      const parts = t.dataset.move.split("|"); const dir = Number(parts.pop()); const idx = Number(parts.pop());
      const { arr } = resolveList(parts.join("|")); const j = idx + dir;
      if (j < 0 || j >= arr.length) return;
      [arr[idx], arr[j]] = [arr[j], arr[idx]]; markDirty(); renderWebsite();
    } else if (t.hasAttribute("data-discard")) { draft = prepare(clone(S.site)); dirty = false; renderWebsite(); }
    else if (t.hasAttribute("data-save")) await saveSite(serialize(draft));
    else if (t.dataset.restore) {
      if (!confirm(L("ย้อนเว็บไซต์กลับไปเป็นฉบับนี้?", "Restore the website to this version?"))) return;
      try { await api("/undo", { method: "POST", body: { version_id: Number(t.dataset.restore) } }); toast(L("ย้อนกลับแล้ว", "Restored")); await load(); }
      catch (err) { toast(err.message, true); }
    }
  });

  async function saveSite(site, quiet) {
    const box = panel("website").querySelector(".errors");
    if (box) box.innerHTML = "";
    try {
      await api("/content", { method: "PUT", body: { site } });
      if (!quiet) toast(L("บันทึกแล้ว เว็บไซต์อัปเดตแล้ว", "Saved — your website is updated"));
      await load();
      return true;
    } catch (err) {
      toast(err.message, true);
      if (box && err.errors) box.innerHTML = `<div class="alert"><strong>${bi("กรุณาแก้ไข:", "Please fix:")}</strong><ul>${err.errors.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
      return false;
    }
  }

  // ------------------------------------------------------------- PHOTOS
  function renderPhotos() {
    const site = S.site;
    const used = new Map();
    (site.photos || []).forEach((p, i) => used.set(p.src, i === 0 ? "main" : "gallery"));
    (site.rooms || []).forEach((r) => (r.photos || []).forEach((p) => used.set(p.src, "room:" + r.code)));
    panel("photos").innerHTML = `
      <label class="upload card">
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
        <span class="big">📷</span>${bi("แตะเพื่อเพิ่มรูป (JPG/PNG/WebP สูงสุด 8MB)", "Tap to add photos (JPG/PNG/WebP, max 8 MB)")}
      </label>
      <p class="muted small">${bi("ใช้เฉพาะรูปที่ร้านเป็นเจ้าของหรือได้รับอนุญาต", "Only use photos you own or have permission to use.")}</p>
      <div class="photo-grid">${S.media.map((src) => {
        const role = used.get(src) || "";
        return `<figure class="photo ${role ? "used" : ""}">
          <img src="${esc(src)}" alt="" loading="lazy">
          ${role ? `<span class="role">${role === "main" ? bi("รูปหลัก", "Main") : role === "gallery" ? bi("แกลเลอรี", "Gallery") : esc(tx((site.rooms.find((r) => "room:" + r.code === role) || {}).name))}</span>` : ""}
          <figcaption>
            <button class="btn small" data-ph="main" data-src="${esc(src)}">${bi("ตั้งเป็นรูปหลัก", "Make main")}</button>
            <button class="btn small ghost" data-ph="${role === "gallery" ? "ungallery" : "gallery"}" data-src="${esc(src)}">${role === "gallery" ? bi("เอาออกจากแกลเลอรี", "Remove from gallery") : bi("ใส่แกลเลอรี", "Add to gallery")}</button>
            ${site.rooms ? `<select data-room-for="${esc(src)}"><option value="">${L("ใช้กับห้อง…", "Use for room…")}</option>${site.rooms.map((r) => `<option value="${esc(r.code)}">${esc(tx(r.name))}</option>`).join("")}</select>` : ""}
            <button class="icon danger" data-ph="delete" data-src="${esc(src)}" title="Delete">🗑</button>
          </figcaption></figure>`;
      }).join("") || `<p class="muted">${bi("ยังไม่มีรูป", "No photos yet")}</p>`}</div>`;
  }

  async function photoChange(fn) {
    if (dirty && !confirm(L("มีการแก้ไขเว็บไซต์ที่ยังไม่บันทึก จะถูกยกเลิก ดำเนินการต่อ?", "Unsaved website edits will be discarded. Continue?"))) return;
    const site = clone(S.site);
    fn(site);
    await saveSite(site);
  }
  panel("photos").addEventListener("change", async (e) => {
    if (e.target.type === "file") {
      const fd = new FormData();
      [...e.target.files].forEach((f) => fd.append("photos", f));
      toast(L("กำลังอัปโหลด…", "Uploading…"));
      try { await api("/photos", { method: "POST", body: fd }); toast(L("อัปโหลดแล้ว", "Uploaded")); await load(true); }
      catch (err) { toast(err.message, true); }
    }
    const sel = e.target.closest("[data-room-for]");
    if (sel && sel.value) {
      const src = sel.dataset.roomFor, code = sel.value;
      await photoChange((s) => { const r = s.rooms.find((x) => x.code === code); r.photos = [{ src }, ...(r.photos || []).filter((p) => p.src !== src)]; });
    }
  });
  panel("photos").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ph]");
    if (!b) return;
    const src = b.dataset.src;
    if (b.dataset.ph === "delete") {
      if (!confirm(L("ลบรูปนี้ถาวร?", "Delete this photo permanently?"))) return;
      try { await api(`/photos/${encodeURIComponent(src.split("/").pop())}`, { method: "DELETE" }); toast(L("ลบแล้ว", "Deleted")); await load(); }
      catch (err) { toast(err.message, true); }
    } else if (b.dataset.ph === "main") await photoChange((s) => { s.photos = [{ src }, ...(s.photos || []).filter((p) => p.src !== src)]; });
    else if (b.dataset.ph === "gallery") await photoChange((s) => { s.photos = [...(s.photos || []), { src }]; });
    else if (b.dataset.ph === "ungallery") await photoChange((s) => { s.photos = (s.photos || []).filter((p) => p.src !== src); });
  });

  // ------------------------------------------------------------- PRICING
  const PRESET_TEXT = {
    conservative: [bi("ระมัดระวัง", "Careful"), bi("ปรับราคาน้อย เน้นให้ห้องเต็ม", "Small moves, keeps rooms filled")],
    balanced: [bi("สมดุล", "Balanced"), bi("แนะนำสำหรับส่วนใหญ่", "Recommended for most hotels")],
    aggressive: [bi("เชิงรุก", "Aggressive"), bi("ขึ้นราคามากเมื่อใกล้เต็ม ลดแรงเมื่อว่าง", "Big rises when nearly full, deeper discounts when empty")],
  };
  function renderPricing() {
    const p = S.site.pricing || {};
    const mode = p.mode || "suggest";
    const preset = p.preset || "balanced";
    const eff = { ...S.presets[preset], ...p };
    const seg = (k, th, en, desc) => `<button class="seg ${mode === k ? "on" : ""}" data-mode="${k}"><b>${bi(th, en)}</b><small>${desc}</small></button>`;
    // Revenue estimate over the calendar for unsold rooms at suggested vs base price.
    let sug = 0, base = 0;
    S.calendar.forEach((r) => r.nights.slice(0, 30).forEach((n) => { const free = n.units - n.booked; sug += free * n.price; base += free * r.base; }));
    panel("pricing").innerHTML = `
      <div class="card">
        <h3>${bi("โหมดราคา", "Pricing mode")}</h3>
        <div class="segs">
          ${seg("off", "ปิด", "Off", bi("ใช้ราคาปกติเสมอ", "Always your base rate"))}
          ${seg("suggest", "แนะนำ", "Suggest", bi("ระบบแนะนำ คุณเลือกเอง", "We suggest, you decide"))}
          ${seg("auto", "อัตโนมัติ", "Auto", bi("เว็บใช้ราคาที่ระบบคำนวณ", "Website uses the smart price"))}
        </div>
      </div>
      <div class="card">
        <h3>${bi("ความเข้มของการปรับราคา", "How aggressive?")}</h3>
        <div class="segs">${Object.keys(S.presets).map((k) => {
          const pr = S.presets[k];
          return `<button class="seg ${preset === k ? "on" : ""}" data-preset="${k}"><b>${PRESET_TEXT[k][0]}</b><small>${PRESET_TEXT[k][1]}</small>
            <small class="muted">${bi("ต่ำสุด", "min")} ${pr.floor_pct}% · ${bi("สูงสุด", "max")} ${pr.ceiling_pct}% · ${bi("เสาร์-อาทิตย์", "weekend")} +${pr.weekend_pct}%</small></button>`;
        }).join("")}</div>
        <details><summary>${bi("ตั้งค่าเอง", "Fine-tune")}</summary>
          <div class="grid">
            <label class="field"><span class="lbl">${bi("ราคาต่ำสุด (% ของราคาปกติ)", "Lowest price (% of base)")}</span><input type="number" min="50" max="100" data-pf="floor_pct" value="${eff.floor_pct}"></label>
            <label class="field"><span class="lbl">${bi("ราคาสูงสุด (% ของราคาปกติ, ไม่เกิน 200)", "Highest price (% of base, max 200)")}</span><input type="number" min="100" max="200" data-pf="ceiling_pct" value="${eff.ceiling_pct}"></label>
            <label class="field"><span class="lbl">${bi("เพิ่มคืนศุกร์-เสาร์ (%)", "Fri/Sat uplift (%)")}</span><input type="number" min="0" max="50" data-pf="weekend_pct" value="${eff.weekend_pct}"></label>
          </div>
          <button class="btn ghost small" data-reset-fine>${bi("ใช้ค่าตามระดับที่เลือก", "Use the preset values")}</button>
        </details>
      </div>
      <div class="card">
        <h3>${bi("ราคาปกติต่อคืน", "Base rate per night")}</h3>
        <div class="grid">${S.site.rooms.map((r) => `<label class="field"><span class="lbl">${esc(tx(r.name))}</span><input type="number" min="1" data-rate="${esc(r.code)}" value="${r.rate}"></label>`).join("")}</div>
      </div>
      <div class="card">
        <h3>${bi("ช่วงเทศกาล / ฤดูกาล", "Seasons & events")}</h3>
        <p class="muted small">${bi("วันที่แบบ เดือน-วัน เช่น 12-20 ถึง 01-10 · ค่าลบ = ลดราคา · ช่วงแรกที่ตรงจะถูกใช้", "Dates as MM-DD, e.g. 12-20 to 01-10 · negative = discount · first match wins")}</p>
        <div class="scroll-x"><table class="seasons"><thead><tr><th>${bi("ชื่อ", "Name")}</th><th>${bi("จาก", "From")}</th><th>${bi("ถึง", "To")}</th><th>%</th><th></th></tr></thead>
        <tbody>${(p.seasons || []).map((s, i) => `<tr data-season="${i}"><td><input data-sf="name" value="${esc(s.name)}"></td><td><input data-sf="from" value="${esc(s.from)}" class="mmdd" inputmode="numeric"></td><td><input data-sf="to" value="${esc(s.to)}" class="mmdd" inputmode="numeric"></td><td><input data-sf="pct" type="number" value="${s.pct}" class="pct"></td><td><button class="icon danger" data-season-del="${i}">✕</button></td></tr>`).join("")}</tbody></table></div>
        <button class="btn ghost small" data-season-add>+ ${bi("เพิ่มช่วง", "Add season")}</button>
      </div>
      <div class="savebar show"><span>${bi("บันทึกการตั้งค่าราคา", "Save pricing settings")}</span><button class="btn primary" data-save-pricing>${bi("บันทึก", "Save")}</button></div>
      <div class="card">
        <h3>${bi("ปฏิทินราคา 45 วัน", "Price calendar — 45 nights")}</h3>
        <p class="muted small">${bi("เลื่อนซ้าย-ขวาเพื่อดูวันอื่น · แตะราคาเพื่อกำหนดราคาเองสำหรับคืนนั้น 📌 = ราคาที่คุณกำหนด", "Swipe for more nights · tap a price to set your own price for that night. 📌 = your fixed price")}</p>
        ${mode !== "off" && sug !== base ? `<p class="insight">💡 ${L(`ถ้าขายห้องที่ว่างใน 30 วันได้ทั้งหมด ราคาที่แนะนำจะได้ ${baht(sug)} เทียบกับ ${baht(base)} ที่ราคาปกติ (ประมาณการ)`, `If every free room in the next 30 nights sells, suggested prices bring ${baht(sug)} vs ${baht(base)} at base rates (estimate)`)}</p>` : ""}
        ${S.calendar.map((r) => `<h4>${esc(tx(r.name))} · ${bi("ปกติ", "base")} ${baht(r.base)}</h4>
          <div class="cal">${r.nights.map((n) => {
            const fixed = n.adjustments.length && n.adjustments[0][0] === "fixed by owner";
            const d = new Date(n.date + "T00:00:00");
            const why = n.adjustments.map((a) => `${a[0]} ${a[1] > 0 ? "+" : ""}${a[1]}%`).join(", ") + (n.clamped ? " (limit)" : "");
            return `<button class="day ${n.price > n.base ? "up" : n.price < n.base ? "down" : ""} ${d.getDay() === 5 || d.getDay() === 6 ? "wknd" : ""}" data-fix="${esc(r.code)}|${n.date}|${n.price}|${fixed ? 1 : 0}" title="${esc(why)}">
              <span class="d">${d.getDate()}/${d.getMonth() + 1}</span><span class="p">${fixed ? "📌" : ""}${baht(n.price)}</span><span class="o">${n.booked}/${n.units}</span></button>`;
          }).join("")}</div>`).join("")}
      </div>`;
  }
  let pricingDraft = null;
  function pd() { if (!pricingDraft) pricingDraft = { pricing: clone(S.site.pricing || {}), rates: {} }; return pricingDraft; }
  if (panel("pricing")) {
    panel("pricing").addEventListener("click", async (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      const d = pd();
      if (t.dataset.mode) { d.pricing.mode = t.dataset.mode; S.site.pricing = { ...(S.site.pricing || {}), mode: t.dataset.mode }; renderPricing(); }
      else if (t.dataset.preset) {
        d.pricing.preset = t.dataset.preset;
        ["floor_pct", "ceiling_pct", "weekend_pct", "occupancy", "last_minute", "early_bird"].forEach((k) => (d.pricing[k] = null));
        S.site.pricing = { ...(S.site.pricing || {}), preset: t.dataset.preset };
        ["floor_pct", "ceiling_pct", "weekend_pct", "occupancy", "last_minute", "early_bird"].forEach((k) => delete S.site.pricing[k]);
        renderPricing();
      } else if (t.hasAttribute("data-reset-fine")) {
        ["floor_pct", "ceiling_pct", "weekend_pct"].forEach((k) => { d.pricing[k] = null; delete S.site.pricing[k]; });
        renderPricing();
      } else if (t.hasAttribute("data-season-add")) {
        d.pricing.seasons = [...(d.pricing.seasons || []), { name: "event", from: "01-01", to: "01-01", pct: 10 }];
        S.site.pricing = { ...(S.site.pricing || {}), seasons: d.pricing.seasons }; renderPricing();
      } else if (t.dataset.seasonDel) {
        d.pricing.seasons = (d.pricing.seasons || []).filter((_, i) => i !== Number(t.dataset.seasonDel));
        S.site.pricing.seasons = d.pricing.seasons; renderPricing();
      } else if (t.hasAttribute("data-save-pricing")) {
        try {
          const body = clone(d);
          delete body.pricing.fixed;  // fixed nights are saved separately; never overwrite them here
          await api("/pricing", { method: "POST", body });
          pricingDraft = null; toast(L("บันทึกการตั้งค่าราคาแล้ว", "Pricing saved")); await load(true);
        } catch (err) { toast((err.errors || [err.message]).join(" · "), true); }
      } else if (t.dataset.fix) {
        const [room, date, price, fixed] = t.dataset.fix.split("|");
        const answer = prompt(L(`ราคาสำหรับคืน ${date} (เว้นว่าง = ให้ระบบคำนวณ)`, `Price for the night of ${date} (leave empty to let the system decide)`), fixed === "1" ? price : "");
        if (answer === null) return;
        const val = answer.trim() === "" ? null : parseInt(answer.replace(/[^\d]/g, ""), 10);
        try { await api("/fixed-price", { method: "POST", body: { room, date, price: val } }); toast(L("บันทึกแล้ว", "Saved")); await load(true); }
        catch (err) { toast((err.errors || [err.message]).join(" · "), true); }
      }
    });
    panel("pricing").addEventListener("input", (e) => {
      const d = pd(), t = e.target;
      if (t.dataset.pf) d.pricing[t.dataset.pf] = t.value === "" ? null : parseInt(t.value, 10);
      if (t.dataset.rate) d.rates[t.dataset.rate] = parseInt(t.value, 10);
      const row = t.closest("[data-season]");
      if (row) {
        const i = Number(row.dataset.season);
        d.pricing.seasons = d.pricing.seasons || clone((S.site.pricing || {}).seasons || []);
        d.pricing.seasons[i][t.dataset.sf] = t.dataset.sf === "pct" ? parseInt(t.value, 10) : t.value;
      }
    });
  }

  // ------------------------------------------------------------- ASK AI
  const EXAMPLES = [
    ["เพิ่มเมนู ต้มยำกุ้ง ราคา 180 บาท ในหมวดแกง", "Add Tom Yum Goong for 180 baht to the curries"],
    ["เปลี่ยนเวลาเปิดเป็น 9:00–22:00 ทุกวัน", "Change opening hours to 9:00–22:00 every day"],
    ["เขียนข้อความแนะนำร้านให้น่าสนใจขึ้น", "Rewrite our About text to sound more inviting"],
    ["เพิ่มคำถาม: มีที่จอดรถไหม — มี ฟรี 10 คัน", "Add FAQ: Is there parking? — Yes, free for 10 cars"],
  ];
  const STATUS = {
    queued: bi("รอดำเนินการ", "Queued"), proposed: bi("รอคุณอนุมัติ", "Waiting for your approval"),
    applied: bi("อัปเดตแล้ว", "Applied"), rejected: bi("ไม่ใช้", "Rejected"),
    needs_human: bi("ทีมงานจะติดต่อกลับ", "Our team will follow up"), failed: bi("ทำไม่สำเร็จ", "Couldn't do it"),
  };
  function renderAI() {
    panel("ai").innerHTML = `
      <div class="card">
        <h3>${bi("ต้องการเปลี่ยนอะไรบนเว็บไซต์?", "What would you like to change?")}</h3>
        <textarea id="ai-text" rows="3" placeholder="${esc(L("พิมพ์ภาษาไทยหรืออังกฤษก็ได้", "Write in Thai or English"))}"></textarea>
        <div class="chips">${EXAMPLES.map((x) => `<button class="chip" data-example="${esc(L(x[0], x[1]))}">${esc(L(x[0], x[1]))}</button>`).join("")}</div>
        <button class="btn primary" data-ai-send>${bi("ส่งให้ AI", "Send to AI")}</button>
        <p class="muted small">${S.ai_enabled
          ? bi("AI จะเสนอการเปลี่ยนแปลง แล้วคุณกดอนุมัติก่อนขึ้นเว็บจริง", "AI proposes the change; nothing goes live until you approve it.")
          : bi("ตอนนี้คำขอจะส่งให้ทีมงานของเราดำเนินการ", "Requests currently go to our team to make the change.")}</p>
      </div>
      ${S.ai_requests.map((r) => `<article class="card ai ${r.status}">
        <div class="row"><span class="badge ${r.status}">${STATUS[r.status] || esc(r.status)}</span><span class="muted small">${esc(r.created_at)}</span></div>
        <p>“${esc(r.text)}”</p>
        ${r.summary ? `<p><b>AI:</b> ${esc(r.summary)}</p>` : ""}
        ${r.error ? `<p class="alert small">${esc(r.error)}</p>` : ""}
        ${r.status === "proposed" ? `<details open><summary>${bi("รายการที่จะเปลี่ยน", "What will change")} (${r.changes.length})</summary><ul class="changes">${r.changes.slice(0, 40).map((c) => `<li>${esc(c)}</li>`).join("")}</ul></details>
          <div class="actions"><button class="btn primary small" data-ai="${r.id}|approve">${bi("อนุมัติ ขึ้นเว็บเลย", "Approve & publish")}</button><button class="btn ghost small" data-ai="${r.id}|reject">${bi("ไม่ใช้", "Reject")}</button></div>` : ""}
      </article>`).join("")}`;
    const pending = S.ai_enabled && S.ai_requests.some((r) => r.status === "queued" && !r.summary);
    clearTimeout(pollTimer);
    if (pending) pollTimer = setTimeout(() => load(true), 4000);
  }
  panel("ai").addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.example) { panel("ai").querySelector("#ai-text").value = t.dataset.example; return; }
    if (t.hasAttribute("data-ai-send")) {
      const text = panel("ai").querySelector("#ai-text").value.trim();
      if (!text) return;
      t.disabled = true;
      try { await api("/ai", { method: "POST", body: { text } }); toast(L("ส่งแล้ว กำลังทำงาน…", "Sent — working on it…")); await load(true); }
      catch (err) { toast(err.message, true); t.disabled = false; }
    }
    if (t.dataset.ai) {
      const [id, action] = t.dataset.ai.split("|");
      try { await api(`/ai/${id}/${action}`, { method: "POST", body: {} }); toast(action === "approve" ? L("ขึ้นเว็บแล้ว", "Published") : L("ไม่ใช้แล้ว", "Rejected")); await load(); }
      catch (err) { toast((err.errors || [err.message]).join(" · "), true); }
    }
  });

  // ------------------------------------------------------------- start
  load().then(() => showTab((location.hash || "#today").slice(1))).catch((e) => toast(e.message, true));
})();
