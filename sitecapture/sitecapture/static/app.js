// SiteCapture web UI (no build step).
const $ = (sel) => document.querySelector(sel);
const state = { project: null, drawingId: null, capture: null, mode: "view", cps: [], recall: null, viewer: null };

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  const type = res.headers.get("content-type") || "";
  return type.includes("json") ? res.json() : res.blob();
}
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const setStatus = (t) => { $("#status").textContent = t; };
const fail = (e) => { setStatus(""); alert(e.message); };

// ---- projects -------------------------------------------------------------
async function loadProjects(selectId) {
  const projects = await api("/api/projects");
  const sel = $("#projectSelect");
  sel.innerHTML = '<option value="">Select project…</option>' +
    projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  if (selectId) { sel.value = selectId; await openProject(selectId); }
}
async function openProject(id) {
  if (!id) return;
  state.project = await api(`/api/projects/${id}`);
  const ds = $("#drawingSelect");
  ds.innerHTML = state.project.drawings.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
  if (!state.drawingId || !state.project.drawings.some((d) => d.id === state.drawingId)) {
    state.drawingId = state.project.drawings[0]?.id ?? null;
  }
  if (state.drawingId) ds.value = state.drawingId;
  $("#planImg").src = state.drawingId ? `/api/drawings/${state.drawingId}/image` : "";
  renderCaptures();
  $("#bimList").innerHTML = state.project.bim_models.map((b) =>
    `<li>${escapeHtml(b.name)} — ${(b.summary.storeys || []).length} storeys</li>`).join("");
  draw();
}
$("#projectSelect").onchange = (e) => openProject(e.target.value).catch(fail);
$("#newProject").onclick = async () => {
  const name = prompt("Project name");
  if (!name) return;
  const p = await api("/api/projects", json("POST", { name })).catch(fail);
  if (p) loadProjects(p.id);
};
$("#drawingSelect").onchange = (e) => { state.drawingId = +e.target.value; state.capture = null; openProject(state.project.id); };

$("#pdfInput").onchange = async (e) => {
  if (!state.project || !e.target.files[0]) return;
  const fd = new FormData(); fd.append("file", e.target.files[0]);
  setStatus("Rendering drawing…");
  try {
    const pages = await api(`/api/projects/${state.project.id}/drawings`, { method: "POST", body: fd });
    state.drawingId = pages[0].id; setStatus(""); await openProject(state.project.id);
  } catch (err) { fail(err); }
  e.target.value = "";
};
$("#ifcInput").onchange = async (e) => {
  if (!state.project || !e.target.files[0]) return;
  const fd = new FormData(); fd.append("file", e.target.files[0]);
  setStatus("Reading IFC…");
  try { await api(`/api/projects/${state.project.id}/bim`, { method: "POST", body: fd }); setStatus(""); openProject(state.project.id); }
  catch (err) { fail(err); }
  e.target.value = "";
};

// ---- captures -------------------------------------------------------------
function renderCaptures() {
  const list = state.project.captures.filter((c) => c.drawing_id === state.drawingId);
  $("#captureList").innerHTML = list.map((c) => `
    <li data-id="${c.id}" class="${state.capture?.id === c.id ? "active" : ""}">
      <div>${new Date(c.captured_at).toLocaleString()}</div>
      <div class="meta">${c.status} · ${c.placed_count}/${c.frame_count} frames placed${c.quality != null ? ` · SfM ${(c.quality * 100).toFixed(0)}%` : ""}</div>
      <button data-report="${c.id}">AI report</button>
    </li>`).join("") || '<li class="meta">No walks on this drawing yet.</li>';
}
$("#captureList").onclick = async (e) => {
  const reportId = e.target.dataset.report;
  if (reportId) { e.stopPropagation(); return makeReport(reportId); }
  const li = e.target.closest("li[data-id]");
  if (li) selectCapture(+li.dataset.id).catch(fail);
};
async function selectCapture(id) {
  state.capture = await api(`/api/captures/${id}`);
  state.cps = [...state.capture.control_points];
  const slider = $("#frameSlider");
  slider.max = Math.max(0, state.capture.frames.length - 1);
  slider.value = 0; updateFrameLabel();
  renderCaptures(); draw();
  if (state.capture.frames.length) showPano(state.capture.frames[0].image_url);
}
$("#captureForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!state.project || !state.drawingId) return alert("Create a project and upload a drawing first.");
  const fd = new FormData(e.target);
  if (!fd.get("captured_at")) fd.delete("captured_at");
  else fd.set("captured_at", new Date(fd.get("captured_at")).toISOString());
  fd.append("drawing_id", state.drawingId);
  setStatus("Uploading…");
  try {
    const c = await api(`/api/projects/${state.project.id}/captures`, { method: "POST", body: fd });
    e.target.reset(); setStatus("Processing — extracting frames…");
    pollCapture(c.id);
  } catch (err) { fail(err); }
};
async function pollCapture(id) {
  const c = await api(`/api/captures/${id}`);
  await openProject(state.project.id);
  if (["uploaded", "positioning"].includes(c.status)) {
    setStatus(`Capture ${id}: ${c.status}…`);
    setTimeout(() => pollCapture(id), 4000);
  } else {
    setStatus(`Capture ${id}: ${c.status}`);
    selectCapture(id);
  }
}
async function makeReport(id) {
  setStatus("Writing report with Claude…");
  try {
    const r = await api(`/api/captures/${id}/report`, { method: "POST" });
    $("#reportPanel").hidden = false; $("#reportText").textContent = r.markdown; setStatus("");
  } catch (err) { fail(err); }
}

// ---- plan overlay ---------------------------------------------------------
function draw() {
  const svg = $("#overlay"), img = $("#planImg");
  svg.setAttribute("viewBox", `0 0 ${img.naturalWidth || 1} ${img.naturalHeight || 1}`);
  const W = img.naturalWidth || 1, H = img.naturalHeight || 1, r = Math.max(W, H) / 250;
  let out = "";
  const frames = state.capture?.frames || [];
  const placed = frames.filter((f) => f.x != null);
  if (placed.length > 1) {
    out += `<polyline fill="none" stroke="var(--point)" stroke-width="${r / 2}" opacity="0.5" points="${placed.map((f) => `${f.x * W},${f.y * H}`).join(" ")}"/>`;
  }
  for (const f of placed) out += `<circle data-frame="${f.index}" cx="${f.x * W}" cy="${f.y * H}" r="${r}" fill="var(--point)"/>`;
  if (state.mode === "place") {
    for (const c of state.cps) out += `<circle cx="${c.x * W}" cy="${c.y * H}" r="${r * 1.6}" fill="none" stroke="var(--cp)" stroke-width="${r / 2}"><title>frame ${c.frame_index}</title></circle>`;
  }
  if (state.recall) out += `<circle cx="${state.recall.x * W}" cy="${state.recall.y * H}" r="${r * 2}" fill="none" stroke="var(--recall)" stroke-width="${r / 2}"/>`;
  svg.innerHTML = out;
}
$("#planImg").onload = draw;
$("#overlay").onclick = (e) => {
  const svg = $("#overlay"), rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
  if (state.mode === "view") {
    const idx = e.target.dataset.frame;
    if (idx != null) showPano(state.capture.frames[+idx].image_url);
  } else if (state.mode === "place" && state.capture) {
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
  draw();
});

// ---- placing frames -------------------------------------------------------
function updateFrameLabel() {
  const f = state.capture?.frames[+$("#frameSlider").value];
  $("#frameLabel").textContent = f ? `#${f.index} (${f.timestamp_s.toFixed(0)} s)` : "";
}
$("#frameSlider").oninput = () => {
  updateFrameLabel();
  const f = state.capture?.frames[+$("#frameSlider").value];
  if (f) showPano(f.image_url);
};
$("#saveCps").onclick = async () => {
  if (!state.capture) return;
  try {
    const c = await api(`/api/captures/${state.capture.id}/control-points`, json("PUT", state.cps));
    state.capture = { ...state.capture, ...c };
    setStatus(c.alignment_rms != null ? `Aligned to SfM path (RMS ${c.alignment_rms.toFixed(4)})` : "Frames placed by interpolation");
    openProject(state.project.id); draw();
  } catch (err) { fail(err); }
};
$("#clearCps").onclick = () => { state.cps = []; draw(); };

// ---- recall ---------------------------------------------------------------
async function recall(x, y) {
  state.recall = { x, y }; draw();
  const entries = await api(`/api/projects/${state.project.id}/timeline?drawing_id=${state.drawingId}&x=${x}&y=${y}&radius=0.03`);
  $("#recallList").innerHTML = entries.map((e) =>
    `<li data-img="${e.image_url}">${new Date(e.captured_at).toLocaleDateString()}</li>`).join("") ||
    "<li>No photos within range of this spot.</li>";
  if (entries.length) showPano(entries[entries.length - 1].image_url);
}
$("#recallList").onclick = (e) => { if (e.target.dataset.img) showPano(e.target.dataset.img); };
$("#makeTimelapse").onclick = async () => {
  if (!state.recall) return;
  const yaw = state.viewer ? state.viewer.getYaw() : 0;
  setStatus("Rendering time-lapse…");
  try {
    const blob = await api(`/api/projects/${state.project.id}/timelapse`, json("POST",
      { drawing_id: state.drawingId, x: state.recall.x, y: state.recall.y, yaw_deg: yaw }));
    const v = $("#timelapseVideo"); v.src = URL.createObjectURL(blob); v.hidden = false; setStatus("");
  } catch (err) { fail(err); }
};

// ---- 360 viewer -----------------------------------------------------------
function showPano(url) {
  if (typeof pannellum === "undefined") {
    // Viewer library unavailable (offline / CDN blocked): show the flat panorama.
    $("#pano").innerHTML = `<img src="${url}" alt="360 frame" style="width:100%;height:100%;object-fit:contain">`;
    return;
  }
  const yaw = state.viewer ? state.viewer.getYaw() : 0;
  if (state.viewer) state.viewer.destroy();
  state.viewer = pannellum.viewer("pano", { type: "equirectangular", panorama: url, autoLoad: true, yaw, showZoomCtrl: true });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

loadProjects().catch(fail);
