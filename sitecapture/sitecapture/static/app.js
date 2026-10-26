// YCB Site Capture web UI (no build step).
const $ = (sel) => document.querySelector(sel);
const state = { project: null, drawingId: null, capture: null, mode: "view", cps: [], recall: null, viewer: null, zoom: 1 };

class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : (detail?.message || JSON.stringify(detail)));
    this.status = status; this.detail = detail;
  }
}
async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: "same-origin", ...opts });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch {}
    if (res.status === 401 && !path.startsWith("/api/auth/login")) showLogin();
    throw new ApiError(res.status, detail);
  }
  const type = res.headers.get("content-type") || "";
  return type.includes("json") ? res.json() : res.blob();
}
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const setStatus = (t) => { $("#status").textContent = t; };
function toast(message, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`; el.textContent = message;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), kind === "error" ? 7000 : 4000);
}
const fail = (e) => { setStatus(""); if (e.status !== 401) toast(e.message, "error"); };
const icon = (name, cls = "ic") => `<svg class="${cls}"><use href="#i-${name}"/></svg>`;
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ---- theme ----------------------------------------------------------------
function storageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storageSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  $("#themeBtn use").setAttribute("href", isDark() ? "#i-sun" : "#i-moon");
}
applyTheme(storageGet("ycb-theme"));
$("#themeBtn").onclick = () => { const t = isDark() ? "light" : "dark"; storageSet("ycb-theme", t); applyTheme(t); };

// ---- dialogs (replace browser prompt/alert) --------------------------------
function askForm(title, fields, okLabel = "OK", validate = null) {
  const dlg = $("#formDialog");
  $("#formDialogTitle").textContent = title;
  $("#formDialogOk").textContent = okLabel;
  $("#formDialogError").textContent = "";
  $("#formDialogFields").innerHTML = fields.map((f) =>
    `<label class="field">${escapeHtml(f.label)}<input name="${f.name}" type="${f.type || "text"}" ${f.required === false ? "" : "required"}
      ${f.minlength ? `minlength="${f.minlength}"` : ""} ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ""} placeholder="${escapeHtml(f.placeholder || "")}"></label>`).join("");
  return new Promise((resolve) => {
    const form = $("#formDialogForm");
    form.onsubmit = (e) => {
      if (e.submitter?.value !== "ok") return;
      const values = Object.fromEntries(new FormData(form));
      const problem = validate && validate(values);
      if (problem) { e.preventDefault(); $("#formDialogError").textContent = problem; return; }
      dlg.returnValue = "ok"; dlg._values = values;
    };
    dlg.onclose = () => resolve(dlg.returnValue === "ok" ? dlg._values : null);
    dlg.returnValue = ""; dlg._values = null;
    dlg.showModal();
    dlg.querySelector("input")?.focus();
  });
}

// ---- accounts -------------------------------------------------------------
function showLogin() { $("#loginScreen").hidden = false; }
async function startSession() {
  let me;
  try { me = await api("/api/auth/me"); } catch { return; }
  $("#loginScreen").hidden = true;
  $("#whoami").textContent = me.name || me.email;
  const initials = (me.name || me.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("");
  $("#avatar").textContent = initials || "?";
  $("#usersBtn").hidden = !me.is_admin;
  await loadProjects(storageGet("ycb-project"));
}
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $("#loginError").textContent = "";
  try {
    await api("/api/auth/login", json("POST", { email: fd.get("email"), password: fd.get("password") }));
    e.target.reset();
    await startSession();
  } catch (err) { $("#loginError").textContent = err.message; }
};
$("#userBtn").onclick = (e) => {
  e.stopPropagation();
  const dd = $("#userDropdown"); dd.hidden = !dd.hidden;
  $("#userBtn").setAttribute("aria-expanded", String(!dd.hidden));
};
document.addEventListener("click", () => { $("#userDropdown").hidden = true; $("#userBtn").setAttribute("aria-expanded", "false"); });
$("#logoutBtn").onclick = async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); location.reload(); };
$("#passwordBtn").onclick = async () => {
  const v = await askForm("Change password", [
    { name: "current", label: "Current password", type: "password", autocomplete: "current-password" },
    { name: "next", label: "New password (at least 10 characters)", type: "password", minlength: 10, autocomplete: "new-password" },
  ], "Change password");
  if (!v) return;
  try { await api("/api/auth/password", json("POST", { current_password: v.current, new_password: v.next })); toast("Password changed. Other devices have been signed out.", "ok"); }
  catch (err) { fail(err); }
};
async function loadUsers() {
  const users = await api("/api/users");
  $("#usersTable tbody").innerHTML = users.map((u) => `<tr data-id="${u.id}">
    <td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.name)}</td>
    <td><input type="checkbox" data-field="is_admin" ${u.is_admin ? "checked" : ""} aria-label="Admin"></td>
    <td><input type="checkbox" data-field="is_active" ${u.is_active ? "checked" : ""} aria-label="Active"></td>
    <td><button class="btn btn-ghost btn-sm" data-reset>Reset password</button></td></tr>`).join("");
}
$("#usersBtn").onclick = () => { $("#usersDialog").showModal(); loadUsers().catch(fail); };
$("#usersTable").onchange = async (e) => {
  const field = e.target.dataset.field, id = e.target.closest("tr")?.dataset.id;
  if (!field || !id) return;
  try { await api(`/api/users/${id}`, json("PATCH", { [field]: e.target.checked })); } catch (err) { fail(err); }
  loadUsers().catch(fail);
};
$("#usersTable").onclick = async (e) => {
  if (!("reset" in e.target.dataset)) return;
  const id = e.target.closest("tr").dataset.id;
  const email = e.target.closest("tr").cells[0].textContent;
  const v = await askForm(`Reset password for ${email}`, [
    { name: "pw", label: "New temporary password (10+ characters)", type: "password", minlength: 10, autocomplete: "new-password" },
  ], "Reset password");
  if (!v) return;
  try { await api(`/api/users/${id}`, json("PATCH", { password: v.pw })); toast("Password reset. Give the user their new password.", "ok"); } catch (err) { fail(err); }
};
$("#addUserForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api("/api/users", json("POST", { email: fd.get("email"), name: fd.get("name"), password: fd.get("password"), is_admin: fd.get("is_admin") === "on" }));
    e.target.reset(); loadUsers(); toast("User added.", "ok");
  } catch (err) { fail(err); }
};

// ---- drop zones -----------------------------------------------------------
document.querySelectorAll("[data-drop]").forEach((zone) => {
  const input = zone.querySelector("input[type=file]");
  const list = zone.querySelector(".dz-files");
  const showFiles = () => {
    if (list) list.innerHTML = [...input.files].map((f) => `<span>${escapeHtml(f.name)} · ${(f.size / 1e6).toFixed(1)} MB</span>`).join("");
  };
  input.addEventListener("change", showFiles);
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault(); zone.classList.remove("dragover");
    if (!e.dataTransfer.files.length) return;
    input.files = e.dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

// ---- resumable chunked upload ---------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function uploadKey(file) { return `sc-upload:${state.project.id}:${file.name}:${file.size}:${file.lastModified}`; }

async function uploadFile(file, onProgress) {
  // Resume an earlier attempt of the same file if the server still has it.
  let up = null;
  const saved = storageGet(uploadKey(file));
  if (saved) { try { up = await api(`/api/uploads/${saved}`); } catch { up = null; } }
  if (!up) {
    up = await api(`/api/projects/${state.project.id}/uploads`, json("POST", { filename: file.name, size: file.size }));
    storageSet(uploadKey(file), up.id);
  }
  let offset = up.received;
  onProgress(offset);
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + up.chunk_size);
    let attempt = 0;
    for (;;) {
      try {
        const r = await api(`/api/uploads/${up.id}?offset=${offset}`, { method: "PUT", body: chunk, headers: { "Content-Type": "application/octet-stream" } });
        offset = r.received; break;
      } catch (err) {
        if (err.status === 409 && err.detail?.received != null) { offset = err.detail.received; break; }
        if (err.status && err.status < 500 && err.status !== 408 && err.status !== 429) { storageSet(uploadKey(file), null); throw err; }
        if (++attempt > 8) throw new Error(`${file.name}: upload kept failing; select the file again to resume`);
        setStatus(`Connection problem, retrying (${attempt}/8)…`);
        await sleep(Math.min(30000, 1000 * 2 ** attempt));
      }
    }
    onProgress(offset);
  }
  storageSet(uploadKey(file), null);
  return up.id;
}

// ---- projects -------------------------------------------------------------
async function loadProjects(selectId) {
  const projects = await api("/api/projects");
  const sel = $("#projectSelect");
  sel.innerHTML = '<option value="">Select project…</option>' +
    projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  if (selectId && projects.some((p) => String(p.id) === String(selectId))) { sel.value = selectId; await openProject(selectId); }
  else if (projects.length === 1) { sel.value = projects[0].id; await openProject(projects[0].id); }
  else renderEmpty();
}
async function openProject(id) {
  if (!id) { state.project = null; renderEmpty(); return; }
  state.project = await api(`/api/projects/${id}`);
  storageSet("ycb-project", id);
  const ds = $("#drawingSelect");
  ds.innerHTML = state.project.drawings.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("") ||
    '<option value="">No drawings yet</option>';
  if (!state.drawingId || !state.project.drawings.some((d) => d.id === state.drawingId)) {
    state.drawingId = state.project.drawings[0]?.id ?? null;
  }
  if (state.drawingId) ds.value = state.drawingId;
  const src = state.drawingId ? `/api/drawings/${state.drawingId}/image` : "";
  if ($("#planImg").getAttribute("src") !== src) { $("#planImg").setAttribute("src", src); setZoom(1); }
  renderCaptures();
  $("#bimList").innerHTML = state.project.bim_models.map((b) =>
    `<li>${escapeHtml(b.name)} · ${(b.summary.storeys || []).length} storeys</li>`).join("");
  renderEmpty();
  draw();
}
function renderEmpty() {
  const el = $("#emptyState");
  let html = "";
  if (!state.project) {
    html = `${icon("logo")}<h3>Choose or create a project</h3><p>Pick a project at the top, or create one with <strong>New project</strong>.</p>`;
  } else if (!state.drawingId) {
    html = `${icon("file")}<h3>Add a drawing to start</h3><p>Drop a PDF floor plan into <strong>Drawings</strong> on the left. Each page becomes its own plan.</p>`;
  }
  el.innerHTML = html ? `<div class="empty-inner">${html}</div>` : "";
  el.hidden = !html;
  $("#plan").hidden = !!html;
}
$("#projectSelect").onchange = (e) => openProject(e.target.value).catch(fail);
$("#newProject").onclick = async () => {
  const v = await askForm("New project", [{ name: "name", label: "Project name", placeholder: "e.g. Riverside Apartments, Block A" }], "Create project");
  if (!v?.name?.trim()) return;
  const p = await api("/api/projects", json("POST", { name: v.name.trim() })).catch(fail);
  if (p) { state.drawingId = null; state.capture = null; await loadProjects(p.id); toast(`Project “${p.name}” created.`, "ok"); }
};
$("#drawingSelect").onchange = (e) => { state.drawingId = +e.target.value; state.capture = null; openProject(state.project.id); };

$("#pdfInput").onchange = async (e) => {
  if (!e.target.files[0]) return;
  if (!state.project) { toast("Create or choose a project first.", "error"); e.target.value = ""; return; }
  const file = e.target.files[0];
  try {
    // Chunked like site walks, so large drawing sets get past request size limits.
    const uploadId = await uploadFile(file, (sent) => setStatus(`Uploading drawing… ${Math.round(100 * sent / file.size)}%`));
    setStatus("Rendering drawing…");
    const pages = await api(`/api/projects/${state.project.id}/drawings/from-upload`, json("POST", { upload_id: uploadId }));
    state.drawingId = pages[0].id; setStatus(""); await openProject(state.project.id);
    toast(`${pages.length} drawing page${pages.length > 1 ? "s" : ""} added.`, "ok");
  } catch (err) { fail(err); }
  e.target.value = "";
};
$("#ifcInput").onchange = async (e) => {
  if (!e.target.files[0]) return;
  if (!state.project) { toast("Create or choose a project first.", "error"); e.target.value = ""; return; }
  const fd = new FormData(); fd.append("file", e.target.files[0]);
  setStatus("Reading IFC…");
  try { await api(`/api/projects/${state.project.id}/bim`, { method: "POST", body: fd }); setStatus(""); openProject(state.project.id); toast("BIM model added.", "ok"); }
  catch (err) { fail(err); }
  e.target.value = "";
};

// ---- captures -------------------------------------------------------------
const STATUS = {
  uploaded: ["Uploading", "work"], frames_ready: ["Needs placing", "warn"], positioning: ["Processing", "work"],
  positioned: ["Ready", "ok"], failed: ["Failed", "bad"],
};
function drawingCaptures() {
  return (state.project?.captures || []).filter((c) => c.drawing_id === state.drawingId)
    .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
}
function renderCaptures() {
  const list = drawingCaptures();
  $("#captureCount").textContent = list.length || "";
  $("#captureList").innerHTML = list.slice().reverse().map((c) => {
    const [label, kind] = STATUS[c.status] || [c.status, "work"];
    return `<li data-id="${c.id}" class="${state.capture?.id === c.id ? "active" : ""}">
      <div class="cap-top"><span class="cap-date">${fmtDateTime(c.captured_at)}</span><span class="badge ${kind}">${label}</span></div>
      <div class="cap-meta">${c.placed_count}/${c.frame_count} frames on plan${c.quality != null ? ` · ${(c.quality * 100).toFixed(0)}% tracked` : ""}${c.notes ? ` · ${escapeHtml(c.notes)}` : ""}</div>
      <div class="cap-actions"><button class="btn btn-ghost btn-sm" data-report="${c.id}">${icon("spark", "ic sm")}AI report</button></div>
    </li>`;
  }).join("") || '<li class="empty-li">No walks on this drawing yet.</li>';
  $("#timelineChips").innerHTML = list.map((c) =>
    `<button class="chip ${state.capture?.id === c.id ? "active" : ""}" data-id="${c.id}">${fmtDate(c.captured_at)}</button>`).join("") ||
    '<span class="none">Upload a site walk to start the timeline.</span>';
}
$("#captureList").onclick = async (e) => {
  const btn = e.target.closest("[data-report]");
  if (btn) { e.stopPropagation(); return makeReport(btn.dataset.report); }
  const li = e.target.closest("li[data-id]");
  if (li) selectCapture(+li.dataset.id).catch(fail);
};
$("#timelineChips").onclick = (e) => {
  const chip = e.target.closest(".chip");
  if (chip) selectCapture(+chip.dataset.id).catch(fail);
};
async function selectCapture(id) {
  state.capture = await api(`/api/captures/${id}`);
  state.cps = [...state.capture.control_points];
  const slider = $("#frameSlider");
  slider.max = Math.max(0, state.capture.frames.length - 1);
  slider.value = 0; updateFrameLabel();
  renderCaptures(); draw();
  if (state.capture.frames.length) showFrame(state.capture.frames[0]);
  if (state.mode === "view" && state.capture.status === "frames_ready") {
    toast("This walk isn't on the plan yet. Use Place frames to pin its start and end.");
  }
}
$("#captureForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!state.project || !state.drawingId) return toast("Create a project and add a drawing first.", "error");
  const fd = new FormData(e.target);
  const files = [...e.target.querySelector("input[name=files]").files];
  const total = files.reduce((n, f) => n + f.size, 0);
  const bar = $("#uploadProgress"), label = $("#uploadLabel");
  const button = e.target.querySelector("button[type=submit]");
  $("#uploadProgressWrap").hidden = false; button.disabled = true;
  let done = 0;
  try {
    const ids = [];
    for (const file of files) {
      ids.push(await uploadFile(file, (sent) => {
        bar.value = (done + sent) / total;
        label.textContent = `${file.name}: ${(sent / 1e6).toFixed(0)} / ${(file.size / 1e6).toFixed(0)} MB`;
      }));
      done += file.size;
    }
    label.textContent = "Extracting frames…";
    const capturedAt = fd.get("captured_at");
    const c = await api(`/api/projects/${state.project.id}/captures/from-uploads`, json("POST", {
      upload_ids: ids, drawing_id: state.drawingId, notes: fd.get("notes") || "",
      captured_at: capturedAt ? new Date(capturedAt).toISOString() : null,
    }));
    e.target.reset(); e.target.querySelector(".dz-files").innerHTML = ""; label.textContent = "";
    setStatus("Processing walk…");
    pollCapture(c.id);
  } catch (err) { fail(err); label.textContent = ""; }
  finally { $("#uploadProgressWrap").hidden = true; button.disabled = false; }
};
async function pollCapture(id) {
  const c = await api(`/api/captures/${id}`);
  await openProject(state.project.id);
  if (["uploaded", "positioning"].includes(c.status)) {
    setStatus(`Processing walk… (${(STATUS[c.status] || [c.status])[0].toLowerCase()})`);
    setTimeout(() => pollCapture(id), 4000);
  } else {
    setStatus(""); toast(c.status === "failed" ? "Processing failed. Check the file and try again." : `Walk ready: ${c.frame_count} frames.`, c.status === "failed" ? "error" : "ok");
    selectCapture(id);
  }
}
async function makeReport(id) {
  setStatus("Writing progress report…");
  try {
    const r = await api(`/api/captures/${id}/report`, { method: "POST" });
    $("#reportPanel").hidden = false; $("#reportText").innerHTML = renderMarkdown(r.markdown); setStatus("");
    $("#reportPdf").href = `/api/reports/${r.id}.pdf`;
    $("#reportPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) { fail(err); }
}

// ---- plan: zoom, pan, overlay ---------------------------------------------
function setZoom(z, anchor) {
  const wrap = $("#planWrap");
  const old = state.zoom;
  state.zoom = Math.min(8, Math.max(1, z));
  // Keep the point under the cursor (or the centre) still while zooming.
  const ax = anchor ? anchor.x : wrap.clientWidth / 2, ay = anchor ? anchor.y : wrap.clientHeight / 2;
  const fx = (wrap.scrollLeft + ax) / old, fy = (wrap.scrollTop + ay) / old;
  $("#plan").style.width = `${state.zoom * 100}%`;
  wrap.scrollLeft = fx * state.zoom - ax; wrap.scrollTop = fy * state.zoom - ay;
}
$("#zoomIn").onclick = () => setZoom(state.zoom * 1.25);
$("#zoomOut").onclick = () => setZoom(state.zoom / 1.25);
$("#zoomFit").onclick = () => setZoom(1);
$("#planWrap").addEventListener("wheel", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const r = $("#planWrap").getBoundingClientRect();
  setZoom(state.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), { x: e.clientX - r.left, y: e.clientY - r.top });
}, { passive: false });

function draw() {
  const svg = $("#overlay"), img = $("#planImg");
  svg.setAttribute("viewBox", `0 0 ${img.naturalWidth || 1} ${img.naturalHeight || 1}`);
  const W = img.naturalWidth || 1, H = img.naturalHeight || 1, r = Math.max(W, H) / 220;
  let out = "";
  const frames = state.capture?.frames || [];
  const placed = frames.filter((f) => f.x != null);
  if (placed.length > 1) {
    out += `<polyline fill="none" stroke="var(--point)" stroke-width="${r / 2}" stroke-linejoin="round" opacity="0.55" points="${placed.map((f) => `${f.x * W},${f.y * H}`).join(" ")}"/>`;
  }
  for (const f of placed) out += `<circle data-frame="${f.index}" cx="${f.x * W}" cy="${f.y * H}" r="${r}" fill="var(--point)" stroke="#fff" stroke-width="${r / 3}"/>`;
  if (state.mode === "place") {
    for (const c of state.cps) out += `<circle cx="${c.x * W}" cy="${c.y * H}" r="${r * 1.8}" fill="none" stroke="var(--cp)" stroke-width="${r / 2}"><title>frame ${c.frame_index}</title></circle>`;
  }
  if (state.recall) out += `<circle cx="${state.recall.x * W}" cy="${state.recall.y * H}" r="${r * 2.4}" fill="var(--recall)" fill-opacity="0.18" stroke="var(--recall)" stroke-width="${r / 2}"/>`;
  svg.innerHTML = out;
}
$("#planImg").onload = draw;

// Drag to pan when zoomed in; a short press without movement is a click.
let press = null;
$("#overlay").addEventListener("pointerdown", (e) => {
  const wrap = $("#planWrap");
  press = { x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop, moved: false };
});
window.addEventListener("pointermove", (e) => {
  if (!press) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  if (!press.moved && Math.hypot(dx, dy) > 5 && state.zoom > 1) { press.moved = true; $("#planWrap").classList.add("panning"); }
  if (press.moved) { const wrap = $("#planWrap"); wrap.scrollLeft = press.sl - dx; wrap.scrollTop = press.st - dy; }
});
window.addEventListener("pointerup", () => { $("#planWrap").classList.remove("panning"); setTimeout(() => { press = null; }); });

$("#overlay").onclick = (e) => {
  if (press?.moved) return;
  const svg = $("#overlay"), rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
  if (state.mode === "view") {
    const idx = e.target.dataset.frame;
    if (idx != null) showFrame(state.capture.frames[+idx]);
  } else if (state.mode === "place") {
    if (!state.capture) return toast("Select a capture first.", "error");
    const fi = +$("#frameSlider").value;
    state.cps = state.cps.filter((c) => c.frame_index !== fi).concat([{ frame_index: fi, x, y }]);
    draw();
  } else if (state.mode === "recall" && state.drawingId) {
    recall(x, y).catch(fail);
  }
};
document.querySelectorAll('input[name="mode"]').forEach((el) => el.onchange = () => {
  state.mode = el.value;
  $("#placeBar").hidden = state.mode !== "place";
  $("#recallPanel").hidden = state.mode !== "recall";
  if (state.mode === "recall") toast("Click any spot on the plan to see it on every date.");
  draw();
});

// ---- placing frames -------------------------------------------------------
function updateFrameLabel() {
  const f = state.capture?.frames[+$("#frameSlider").value];
  $("#frameLabel").textContent = f ? `#${f.index} · ${f.timestamp_s.toFixed(0)} s` : "";
}
$("#frameSlider").oninput = () => {
  updateFrameLabel();
  const f = state.capture?.frames[+$("#frameSlider").value];
  if (f) showFrame(f);
};
$("#saveCps").onclick = async () => {
  if (!state.capture) return toast("Select a capture first.", "error");
  try {
    const c = await api(`/api/captures/${state.capture.id}/control-points`, json("PUT", state.cps));
    state.capture = { ...state.capture, ...c };
    const msg = c.alignment_rms != null ? `Aligned to tracked path (error ${c.alignment_rms.toFixed(4)})` : "Frames placed by interpolation";
    setStatus(msg); toast(`${c.placed_count} of ${c.frame_count} frames on the plan.`, "ok");
    openProject(state.project.id); draw();
  } catch (err) { fail(err); }
};
$("#clearCps").onclick = () => { state.cps = []; draw(); };

// ---- recall ---------------------------------------------------------------
async function recall(x, y) {
  state.recall = { x, y }; draw();
  const entries = await api(`/api/projects/${state.project.id}/timeline?drawing_id=${state.drawingId}&x=${x}&y=${y}&radius=0.03`);
  $("#recallList").innerHTML = entries.map((e) =>
    `<li data-img="${e.image_url}" data-date="${e.captured_at}"><span>${fmtDate(e.captured_at)}</span>${icon("eye", "ic sm")}</li>`).join("") ||
    '<li class="none">No photos within range of this spot.</li>';
  if (entries.length) showPano(entries[entries.length - 1].image_url, fmtDate(entries[entries.length - 1].captured_at), "this spot");
}
$("#recallList").onclick = (e) => {
  const li = e.target.closest("li[data-img]");
  if (li) showPano(li.dataset.img, fmtDate(li.dataset.date), "this spot");
};
$("#makeTimelapse").onclick = async () => {
  if (!state.recall) return toast("Click a spot on the plan first.", "error");
  const yaw = state.viewer ? state.viewer.getYaw() : 0;
  setStatus("Rendering time-lapse…");
  try {
    const blob = await api(`/api/projects/${state.project.id}/timelapse`, json("POST",
      { drawing_id: state.drawingId, x: state.recall.x, y: state.recall.y, yaw_deg: yaw }));
    const v = $("#timelapseVideo"); v.src = URL.createObjectURL(blob); v.hidden = false; setStatus("");
  } catch (err) { fail(err); }
};

// ---- 360 viewer -----------------------------------------------------------
function showFrame(f) {
  const when = state.capture ? fmtDate(state.capture.captured_at) : "";
  showPano(f.image_url, when, `frame ${f.index + 1} of ${state.capture?.frames.length ?? "?"}`);
}
function showPano(url, title = "360 view", sub = "") {
  $("#viewerTitle").textContent = title; $("#viewerSub").textContent = sub;
  if (typeof pannellum === "undefined") {
    // Viewer library unavailable (offline / CDN blocked): show the flat panorama.
    $("#pano").innerHTML = `<img src="${url}" alt="360 frame" style="width:100%;height:100%;object-fit:contain">`;
    return;
  }
  const yaw = state.viewer ? state.viewer.getYaw() : 0;
  if (state.viewer) state.viewer.destroy();
  $("#pano").innerHTML = "";
  state.viewer = pannellum.viewer("pano", { type: "equirectangular", panorama: url, autoLoad: true, yaw, showZoomCtrl: true });
}

// ---- helpers --------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Small Markdown renderer for AI reports: headings, lists, tables, bold. Escapes first.
function renderMarkdown(md) {
  const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
  const lines = md.split(/\r?\n/);
  let html = "", i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-+/.test(lines[i + 1] || "")) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      html += "<table><thead><tr>" + cells(line).map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>";
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) { html += "<tr>" + cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>"; i++; }
      html += "</tbody></table>"; continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      html += "<ul>";
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`; i++; }
      html += "</ul>"; continue;
    }
    if (line.trim()) html += `<p>${inline(line)}</p>`;
    i++;
  }
  return html;
}

startSession();
