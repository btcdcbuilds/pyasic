// Shared script for customer sites: language toggle, live price quote, booking submit.
(function () {
  const root = document.documentElement;

  // ---- Language -------------------------------------------------------------
  function setLang(lang) {
    root.dataset.ui = lang;
    root.lang = lang;
    const btn = document.querySelector(".lang-toggle");
    if (btn) btn.textContent = lang === "th" ? "EN" : "ไทย";
    try { localStorage.setItem("ui-lang", lang); } catch (e) {}
  }
  let initial = new URLSearchParams(location.search).get("lang");
  if (!initial) { try { initial = localStorage.getItem("ui-lang"); } catch (e) {} }
  if (!initial) initial = (navigator.language || "th").toLowerCase().startsWith("th") ? "th" : "en";
  setLang(initial === "en" ? "en" : "th");
  const toggle = document.querySelector(".lang-toggle");
  if (toggle) toggle.addEventListener("click", () => setLang(root.dataset.ui === "th" ? "en" : "th"));

  // ---- Booking form ---------------------------------------------------------
  const form = document.getElementById("booking-form");
  if (!form) return;
  const api = form.dataset.api;
  const quoteBox = form.querySelector(".quote");
  const resultBox = form.querySelector(".result");
  const baht = (n) => "฿" + Number(n).toLocaleString("en-US");
  const L = (th, en) => (root.dataset.ui === "th" ? th : en);

  function payload() {
    const data = Object.fromEntries(new FormData(form).entries());
    data.consent = form.consent.checked ? "true" : "false";
    return data;
  }

  // Keep dependent selects in sync with the chosen tour / treatment.
  function syncOptions(selectName, targetName, attr) {
    const sel = form.elements[selectName], target = form.elements[targetName];
    if (!sel || !target) return;
    const opts = sel.selectedOptions[0].dataset[attr].split(",");
    target.innerHTML = opts.map((o) => `<option>${o}</option>`).join("");
  }
  form.addEventListener("change", (e) => {
    if (e.target.name === "tour") syncOptions("tour", "departure", "departures");
    if (e.target.name === "service") syncOptions("service", "minutes", "minutes");
  });

  // "Choose this room" buttons pre-select the room.
  document.querySelectorAll("[data-pick-room]").forEach((a) =>
    a.addEventListener("click", () => { form.elements.room.value = a.dataset.pickRoom; requestQuote(); }));

  let timer;
  function requestQuote() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const data = payload();
      // Quote needs the booking fields only; fill placeholders for name/contact/consent.
      data.name = data.name || "-"; data.contact = data.contact || "-"; data.consent = "true";
      if (!data.date && !data.check_in) { quoteBox.textContent = ""; return; }
      try {
        const res = await fetch(api + "/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        const q = await res.json();
        if (!res.ok) { quoteBox.innerHTML = `<span class="err">${q.error}</span>`; return; }
        if (q.total) {
          quoteBox.textContent = L("ราคารวม ", "Total ") + baht(q.total) +
            (q.deposit ? L(` · มัดจำ ${baht(q.deposit)}`, ` · deposit ${baht(q.deposit)}`) : "");
        } else { quoteBox.textContent = ""; }
      } catch (e) { quoteBox.textContent = ""; }
    }, 300);
  }
  form.addEventListener("input", requestQuote);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    resultBox.innerHTML = "";
    if (!form.reportValidity()) return;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const res = await fetch(api + "/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      const b = await res.json();
      if (!res.ok) { resultBox.innerHTML = `<p class="err">${b.error}</p>`; return; }
      const dep = b.deposit ? L(`<br>มัดจำ ${baht(b.deposit)} — เราจะส่งลิงก์ชำระเงินพร้อมเพย์ให้ทาง LINE/โทรศัพท์`,
                                 `<br>Deposit ${baht(b.deposit)} — we will send you a PromptPay payment link`) : "";
      resultBox.innerHTML = `<div class="ok"><strong>${L("ส่งคำขอจองแล้ว", "Booking request sent")}</strong> · ${L("รหัส", "Ref")} ${b.ref}<br>${b.summary}${dep}<br>${L("ร้านจะติดต่อกลับเพื่อยืนยัน", "The business will contact you to confirm.")}</div>`;
      form.reset();
      quoteBox.textContent = "";
    } catch (err) {
      resultBox.innerHTML = `<p class="err">${L("ส่งไม่สำเร็จ ลองใหม่อีกครั้ง", "Could not send. Please try again.")}</p>`;
    } finally { btn.disabled = false; }
  });
})();
