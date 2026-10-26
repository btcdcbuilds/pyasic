// YCB As-built checks: point clouds vs the IFC design model, in 3D.
// Uses helpers from app.js ($, api, json, toast, fail, icon, uploadFile, state, ...).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const STATUS = {
  ok: { label: "OK", color: [34, 170, 85] },
  check: { label: "Check", color: [245, 158, 11] },
  deviates: { label: "Deviates", color: [220, 38, 38] },
  not_seen: { label: "Not seen", color: [139, 92, 246] },
  outside_scan: { label: "Outside scan", color: [156, 163, 175] },
};
const NEUTRAL = [200, 204, 212];
const SELECTED = [242, 107, 29];
const CAT_COLOR = { defect: 0xdc2626, progress: 0x16a34a, safety: 0xf59e0b, note: 0x2563eb };
const esc = escapeHtml;

const S = {
  scans: [], scan: null, check: null, bims: [], pairs: [], picking: null,
  selected: -1, issues: [], filter: "flagged", polls: new Set(), autoOpen: null,
  points: null, rgbColors: null, devColors: null, dev: null,
  mesh: null, meshInfo: null, markers: null, issueMarkers: null,
};

// ---- three.js scene ---------------------------------------------------------
let renderer, scene, camera, controls, raycaster;
function initViewer() {
  if (renderer) return;
  const host = $("#asbCanvas");
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.append(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.01, 5000);
  camera.up.set(0, 0, 1); // scans and IFC are Z-up
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667085, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(30, -20, 50);
  scene.add(sun);
  S.markers = new THREE.Group();
  S.issueMarkers = new THREE.Group();
  scene.add(S.markers, S.issueMarkers);
  raycaster = new THREE.Raycaster();
  new ResizeObserver(resize).observe(host);
  resize();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) onClick(e);
    down = null;
  });
  (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
}
function resize() {
  const host = $("#asbCanvas");
  const w = host.clientWidth || 600, h = host.clientHeight || 400;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
function setBackground() {
  if (scene) scene.background = new THREE.Color(isDark() ? 0x111827 : 0xeef1f5);
}
function sceneSize() {
  const box = new THREE.Box3();
  for (const o of [S.points, S.mesh]) if (o && o.visible) box.expandByObject(o);
  return box.isEmpty() ? 10 : box.getSize(new THREE.Vector3()).length();
}
function fitView(box) {
  if (!box) {
    box = new THREE.Box3();
    for (const o of [S.points, S.mesh]) if (o && o.visible) box.expandByObject(o);
  }
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
  const d = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.9;
  camera.position.copy(c).add(new THREE.Vector3(0.55, -0.75, 0.45).normalize().multiplyScalar(d));
  camera.near = Math.max(0.01, d / 1000); camera.far = d * 20; camera.updateProjectionMatrix();
  controls.target.copy(c);
}

// ---- data loading -------------------------------------------------------------
async function fetchBuffer(url) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return res.arrayBuffer();
}
function disposeObj(o) { if (!o) return; scene.remove(o); o.geometry?.dispose(); o.material?.dispose(); }

async function loadPoints(scan) {
  disposeObj(S.points); S.points = null; S.dev = null; S.devColors = null;
  const buf = await fetchBuffer(scan.points_url);
  const n = new DataView(buf).getUint32(0, true);
  const pos = new Float32Array(buf, 4, 3 * n);
  S.rgbColors = new Uint8Array(buf, 4 + 12 * n, 3 * n);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(S.rgbColors, 3, true));
  const m = new THREE.PointsMaterial({ size: +$("#pointSize").value, sizeAttenuation: false, vertexColors: true });
  S.points = new THREE.Points(g, m);
  S.points.matrixAutoUpdate = false;
  scene.add(S.points);
}

async function loadMesh(bimId) {
  if (S.meshInfo?.bimId === bimId && S.mesh) return;
  disposeObj(S.mesh); S.mesh = null;
  setStatus3("Preparing the 3D model…");
  const meta = await api(`/api/bim/${bimId}/mesh`);
  const buf = await fetchBuffer(meta.mesh_url);
  const dv = new DataView(buf);
  const nv = dv.getUint32(0, true), nf = dv.getUint32(4, true);
  const verts = new Float32Array(buf, 8, 3 * nv);
  const faces = new Uint32Array(buf.slice(8 + 12 * nv, 8 + 12 * nv + 12 * nf));
  // Element of every vertex (each element has its own vertices) and bounds.
  const vertEl = new Int32Array(nv).fill(-1);
  const boxes = meta.elements.map((e, i) => {
    const b = new THREE.Box3();
    for (let f = e.face_start; f < e.face_start + e.face_count; f++) {
      for (let k = 0; k < 3; k++) {
        const v = faces[3 * f + k];
        vertEl[v] = i;
        b.expandByPoint(new THREE.Vector3(verts[3 * v], verts[3 * v + 1], verts[3 * v + 2]));
      }
    }
    return b;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  g.setIndex(new THREE.BufferAttribute(faces, 1));
  g.computeVertexNormals();
  g.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(3 * nv), 3, true));
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, opacity: +$("#modelOpacity").value,
    side: THREE.DoubleSide, depthWrite: false,
  });
  S.mesh = new THREE.Mesh(g, m);
  scene.add(S.mesh);
  S.meshInfo = { bimId, meta, vertEl, boxes, faceStarts: meta.elements.map((e) => e.face_start) };
  setStatus3("");
}

function paintMesh() {
  if (!S.mesh) return;
  const statusOf = S.check?.elements ? Object.fromEntries(S.check.elements.map((e) => [e.guid, e.status])) : {};
  const els = S.meshInfo.meta.elements;
  const col = S.mesh.geometry.getAttribute("color");
  const elColor = els.map((e, i) => (i === S.selected ? SELECTED : STATUS[statusOf[e.guid]]?.color || NEUTRAL));
  for (let v = 0; v < S.meshInfo.vertEl.length; v++) {
    const c = elColor[S.meshInfo.vertEl[v]] || NEUTRAL;
    col.array[3 * v] = c[0]; col.array[3 * v + 1] = c[1]; col.array[3 * v + 2] = c[2];
  }
  col.needsUpdate = true;
}

function deviationColors(dev, tol, cutoff) {
  const out = new Uint8Array(dev.length * 3);
  const lerp = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  for (let i = 0; i < dev.length; i++) {
    const d = dev[i];
    let c;
    if (Number.isNaN(d)) c = [150, 150, 150];
    else if (Math.abs(d) <= tol) c = [34, 170, 85];
    else {
      const t = Math.min(1, (Math.abs(d) - tol) / Math.max(1e-6, cutoff - tol));
      c = d > 0 ? lerp([250, 204, 21], [220, 38, 38], t) : lerp([96, 165, 250], [30, 64, 175], t);
    }
    out[3 * i] = c[0]; out[3 * i + 1] = c[1]; out[3 * i + 2] = c[2];
  }
  return out;
}

function applyColorMode() {
  if (!S.points) return;
  const mode = document.querySelector("input[name=colorMode]:checked").value;
  const use = mode === "deviation" && S.devColors ? S.devColors : S.rgbColors;
  S.points.geometry.setAttribute("color", new THREE.BufferAttribute(use, 3, true));
  const legend = $("#asbLegend");
  if (mode === "deviation" && S.check?.summary) {
    const t = S.check.summary.tolerance_mm, c = S.check.summary.cutoff_mm;
    legend.innerHTML = `<div><i style="background:#22aa55"></i>within ±${t} mm</div>
      <div><i style="background:linear-gradient(90deg,#facc15,#dc2626)"></i>outside the model surface, ${t}–${c} mm</div>
      <div><i style="background:linear-gradient(90deg,#60a5fa,#1e40af)"></i>inside the model surface, ${t}–${c} mm</div>
      <div><i style="background:#969696"></i>more than ${c} mm from the model (not in the model)</div>`;
    legend.hidden = false;
  } else legend.hidden = true;
}

// ---- view states ----------------------------------------------------------------
function showOnly(which) {
  // which: "scan" | "model" | "both"
  if (S.points) S.points.visible = which !== "model";
  if (S.mesh) S.mesh.visible = which !== "scan" && $("#showModel").checked;
  S.markers.children.forEach((m) => { m.visible = m.userData.side === which || which === "both"; });
}
function setScanMatrix(T) {
  if (!S.points) return;
  const m = new THREE.Matrix4();
  if (T) m.set(...T.flat()); // row-major 4x4
  S.points.matrix.copy(m);
  S.points.matrixWorldNeedsUpdate = true;
}
function setStatus3(t) { $("#asbStatus").textContent = t; }

// ---- lists ------------------------------------------------------------------------
async function open() {
  initViewer();
  setBackground();
  resize();
  await projectChanged();
}

async function projectChanged() {
  if ($("#asbuiltView").hidden) return;
  const p = state.project;
  $("#asbEmpty").hidden = !!S.scan;
  if (!p) { S.scans = []; renderScans(); return; }
  S.bims = p.bim_models || [];
  const walks = (p.captures || []).filter((c) => c.has_model);
  $("#walkScanSelect").innerHTML = walks.length
    ? walks.map((c) => `<option value="${c.id}">360 walk ${fmtDate(c.captured_at)}</option>`).join("")
    : '<option value="">No processed 360 walks yet</option>';
  $("#walkScanBtn").disabled = !walks.length;
  $("#checkModel").innerHTML = S.bims.length
    ? S.bims.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")
    : '<option value="">Add an IFC model on the Sites tab first</option>';
  try { S.scans = await api(`/api/projects/${p.id}/scans`); } catch (e) { return fail(e); }
  if (S.scan && !S.scans.some((s) => s.id === S.scan.id)) clearScan();
  renderScans();
}

function renderScans() {
  $("#scanList").innerHTML = S.scans.map((s) => `
    <li data-id="${s.id}" class="${S.scan?.id === s.id ? "active" : ""}">
      <div class="sl-top"><span class="sl-title">${esc(s.name)}</span>
        <span class="dstatus ${s.status === "ready" ? "ready_for_da" : s.status === "failed" ? "failed" : "submitted"}">${s.status}</span></div>
      <div class="sl-meta">${fmtDate(s.captured_at)} · ${s.source === "capture" ? "from 360 walk" : "scan file"}${s.points ? ` · ${s.points.toLocaleString()} pts` : ""}${s.checks.length ? ` · ${s.checks.length} check${s.checks.length > 1 ? "s" : ""}` : ""}</div>
      ${s.status === "failed" ? `<div class="error">${esc(s.error)}</div>` : ""}
      ${isStaff() ? `<button class="icon-btn sm del" data-del-scan="${s.id}" title="Delete scan">${icon("trash", "ic sm")}</button>` : ""}
    </li>`).join("") || `<li class="empty-li">${isStaff() ? "No scans yet. Add a point cloud above." : "No scans shared yet."}</li>`;
  for (const s of S.scans) if (s.status === "uploaded" || s.status === "processing") pollScan(s.id);
}

function renderChecks() {
  const checks = S.scan?.checks || [];
  $("#checksCard").hidden = !S.scan;
  $("#checkList").innerHTML = checks.map((c) => `
    <li data-id="${c.id}" class="${S.check?.id === c.id ? "active" : ""}">
      <div class="sl-top"><span class="sl-title">${esc(c.bim_model_name || "Model")}</span>
        <span class="dstatus ${c.status === "ready" ? "ready_for_da" : c.status === "failed" ? "failed" : "submitted"}">${c.status}</span></div>
      <div class="sl-meta">${fmtDate(c.created_at)} · ±${c.tolerance_mm} mm${c.summary ? ` · ${c.summary.within_tolerance_pct}% within` : ""}</div>
      ${c.status === "failed" ? `<div class="error">${esc(c.error)}</div>` : ""}
      ${isStaff() ? `<button class="icon-btn sm del" data-del-check="${c.id}" title="Delete check">${icon("trash", "ic sm")}</button>` : ""}
    </li>`).join("") || '<li class="empty-li">No checks yet.</li>';
  for (const c of checks) if (c.status === "queued" || c.status === "running") pollCheck(c.id);
}

function pollScan(id) {
  if (S.polls.has(`s${id}`)) return;
  S.polls.add(`s${id}`);
  const tick = async () => {
    try {
      const s = await api(`/api/scans/${id}`);
      if (s.status === "ready" || s.status === "failed") {
        S.polls.delete(`s${id}`);
        await projectChanged();
        if (s.status === "ready") {
          toast(`${s.name} is ready`, "ok");
          if (S.autoOpen === id) { S.autoOpen = null; selectScan(id); }
        } else toast(`${s.name} could not be read: ${s.error}`, "error");
        return;
      }
    } catch { S.polls.delete(`s${id}`); return; }
    setTimeout(tick, 2500);
  };
  setTimeout(tick, 1500);
}
function pollCheck(id) {
  if (S.polls.has(`c${id}`)) return;
  S.polls.add(`c${id}`);
  const tick = async () => {
    try {
      const c = await api(`/api/checks/${id}`);
      if (c.status === "ready" || c.status === "failed") {
        S.polls.delete(`c${id}`);
        await refreshScan();
        if (c.status === "ready") selectCheck(id); else toast(`Check failed: ${c.error}`, "error");
        return;
      }
    } catch { S.polls.delete(`c${id}`); return; }
    setTimeout(tick, 2500);
  };
  setTimeout(tick, 1500);
}

function clearScan() {
  S.scan = null; S.check = null; S.pairs = []; S.selected = -1;
  disposeObj(S.points); S.points = null;
  S.markers.clear(); S.issueMarkers.clear();
  $("#checkPanel").hidden = true; $("#newCheckCard").hidden = true; $("#checksCard").hidden = true;
  $("#asbEmpty").hidden = false;
}

async function selectScan(id) {
  const scan = S.scans.find((s) => s.id === id);
  if (!scan) return;
  if (scan.status !== "ready") { toast(scan.status === "failed" ? scan.error : "Still processing, it will open when ready."); return; }
  stopPicking();
  S.scan = scan; S.check = null; S.pairs = []; S.selected = -1;
  S.markers.clear(); S.issueMarkers.clear();
  $("#asbEmpty").hidden = true;
  renderScans(); renderChecks(); renderPairs();
  $("#newCheckCard").hidden = !isStaff();
  $("#checkPanel").hidden = true;
  setDevEnabled(false);
  setStatus3("Loading scan…");
  try { await loadPoints(scan); } catch (e) { setStatus3(""); return fail(e); }
  setScanMatrix(null);
  showOnly("scan");
  fitView();
  setStatus3(`${scan.viewer_points.toLocaleString()} points shown`);
  const ready = scan.checks.filter((c) => c.status === "ready");
  if (ready.length) selectCheck(ready[ready.length - 1].id);
}

async function refreshScan() {
  if (!S.scan) return;
  S.scan = await api(`/api/scans/${S.scan.id}`);
  const i = S.scans.findIndex((s) => s.id === S.scan.id);
  if (i >= 0) S.scans[i] = S.scan;
  renderScans(); renderChecks();
}

function setDevEnabled(on) {
  const dev = document.querySelector("input[name=colorMode][value=deviation]");
  dev.disabled = !on;
  if (!on) document.querySelector("input[name=colorMode][value=rgb]").checked = true;
}

async function selectCheck(id) {
  stopPicking();
  setStatus3("Loading check…");
  try {
    const check = await api(`/api/checks/${id}`);
    if (check.status !== "ready") { setStatus3(""); renderChecks(); return; }
    await loadMesh(check.bim_model_id);
    S.check = check; S.selected = -1;
    S.dev = new Float32Array(await fetchBuffer(check.deviation_url));
    S.devColors = deviationColors(S.dev, check.summary.tolerance_mm / 1000, check.summary.cutoff_mm / 1000);
    setScanMatrix(check.transform);
    S.markers.clear();
    showOnly("both");
    setDevEnabled(true);
    document.querySelector("input[name=colorMode][value=deviation]").checked = true;
    applyColorMode();
    paintMesh();
    fitView();
    await loadIssues();
    renderChecks();
    renderPanel();
    setStatus3("");
  } catch (e) { setStatus3(""); fail(e); }
}

// ---- picking matching points ------------------------------------------------------
function renderPairs() {
  $("#pairList").innerHTML = S.pairs.map((p, i) => `<li>${i + 1}. scan ${p.scan.map((v) => v.toFixed(2)).join(", ")}
    → ${p.model ? `model ${p.model.map((v) => v.toFixed(2)).join(", ")}` : "<em>click the same point on the model</em>"}
    <button class="linklike" data-del-pair="${i}">remove</button></li>`).join("") || '<li class="hint">No points picked yet.</li>';
  const complete = S.pairs.filter((p) => p.model).length;
  const shared = document.querySelector("input[name=alignMode]:checked").value === "shared";
  $("#runCheck").disabled = !S.scan || !$("#checkModel").value || (!shared && complete < 3);
}
function marker(pos, side, n) {
  const r = sceneSize() * 0.006;
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: side === "scan" ? 0xf26b1d : 0x2563eb, depthTest: false }));
  m.position.set(...pos); m.renderOrder = 10; m.userData = { side, n };
  S.markers.add(m);
}
async function startPicking() {
  if (!$("#checkModel").value) return toast("Add an IFC model on the Sites tab first.", "error");
  S.check = null; $("#checkPanel").hidden = true; setDevEnabled(false); applyColorMode();
  try { await loadMesh(+$("#checkModel").value); } catch (e) { return fail(e); }
  paintMesh();
  setScanMatrix(null);
  const last = S.pairs[S.pairs.length - 1];
  S.picking = last && !last.model ? "model" : "scan";
  updatePickView();
  $("#pickBtn span").textContent = "Stop picking";
}
function updatePickView() {
  if (!S.picking) return;
  showOnly(S.picking);
  fitView();
  $("#pickHint").hidden = false;
  $("#pickHint").innerHTML = S.picking === "scan"
    ? `<strong>Pair ${S.pairs.length + 1}:</strong> click a clear corner or edge on the <strong>scan</strong>`
    : `<strong>Pair ${S.pairs.length}:</strong> now click the <strong>same point on the design model</strong>`;
}
function stopPicking() {
  S.picking = null;
  $("#pickHint").hidden = true;
  $("#pickBtn span").textContent = "Start picking";
  if (S.points && !S.check) showOnly("scan");
}

function onClick(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  raycaster.params.Points.threshold = sceneSize() * 0.002;
  if (S.picking === "scan" && S.points) {
    const hit = raycaster.intersectObject(S.points)[0];
    if (!hit) return;
    S.pairs.push({ scan: hit.point.toArray(), model: null });
    marker(hit.point.toArray(), "scan", S.pairs.length);
    S.picking = "model";
    renderPairs(); updatePickView();
    return;
  }
  if (S.picking === "model" && S.mesh) {
    const hit = raycaster.intersectObject(S.mesh)[0];
    if (!hit) return;
    S.pairs[S.pairs.length - 1].model = hit.point.toArray();
    marker(hit.point.toArray(), "model", S.pairs.length);
    S.picking = "scan";
    renderPairs(); updatePickView();
    return;
  }
  // Normal mode: select a model element.
  if (S.check && S.mesh && S.mesh.visible) {
    const hit = raycaster.intersectObject(S.mesh)[0];
    if (!hit) return;
    selectElement(elementOfFace(hit.faceIndex), hit.point.toArray(), false);
  }
}
function elementOfFace(f) {
  const st = S.meshInfo.faceStarts;
  let lo = 0, hi = st.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (st[mid] <= f) lo = mid; else hi = mid - 1; }
  return lo;
}

// ---- results panel ------------------------------------------------------------------
function fmtMm(v) { return v == null ? "–" : `${v} mm`; }
function renderPanel() {
  const c = S.check, s = c.summary, a = c.alignment;
  const counts = s.status_counts;
  const guidIndex = Object.fromEntries(S.meshInfo.meta.elements.map((e, i) => [e.guid, i]));
  const rows = c.elements.filter((e) => S.filter === "all" || (S.filter === "flagged" ? ["deviates", "check", "not_seen"].includes(e.status) : e.status === S.filter));
  const order = { deviates: 0, check: 1, not_seen: 2, ok: 3, outside_scan: 4 };
  rows.sort((x, y) => order[x.status] - order[y.status] || (y.median_mm || 0) - (x.median_mm || 0));
  const scaleWarn = !S.scan.metric ? `<p class="warn-box">${icon("spark", "ic sm")} Photo-derived scan: its true scale was estimated during alignment (×${a.scale}). A small uniform scale error can look like, or hide, deviations of a few centimetres across a building. Use LiDAR or phone LiDAR scans for tolerance checks.</p>` : "";
  const alignWarn = a.rms_mm > s.tolerance_mm / 2 ? `<p class="warn-box">Alignment RMS (${a.rms_mm} mm) is more than half the tolerance, so some deviation may be alignment error. Re-pick points spread across the site.</p>` : "";
  $("#checkPanel").hidden = false;
  $("#checkPanel").innerHTML = `
    <div class="asb-panel-grid">
      <section class="card">
        <div class="card-head">${icon("check")}<h3>Result</h3><span class="spacer" style="flex:1"></span>
          ${isStaff() ? `<button class="btn btn-ai btn-sm" id="reportBtn">${icon("spark")}<span>${c.report_markdown ? "Rewrite" : "Write"} QA report with Opus</span></button>` : ""}</div>
        ${scaleWarn}${alignWarn}
        <table class="kv-table">
          <tr><th>Tolerance</th><td>±${s.tolerance_mm} mm</td></tr>
          <tr><th>Scan points within tolerance</th><td><strong>${s.within_tolerance_pct}%</strong> of points near the model</td></tr>
          <tr><th>Points near the model</th><td>${s.near_model_pct}% (within ${s.cutoff_mm} mm)</td></tr>
          <tr><th>Points not in the model</th><td>${s.not_in_model_pct}%</td></tr>
          <tr><th>RMS distance</th><td>${s.rms_mm} mm</td></tr>
          <tr><th>Points analysed</th><td>${s.points_analysed.toLocaleString()}</td></tr>
          <tr><th>Alignment</th><td>${esc(a.method)} · RMS ${a.rms_mm} mm · ${a.iterations} iterations${a.pair_errors_mm ? ` · picked points off by ${a.pair_errors_mm.join(", ")} mm` : ""}</td></tr>
        </table>
      </section>
      <section class="card">
        <div class="card-head">${icon("cube")}<h3>Elements</h3></div>
        <div class="chips status-chips">
          ${[["flagged", "Flagged", counts.deviates + counts.check + counts.not_seen], ["all", "All", s.elements], ...Object.entries(STATUS).map(([k, v]) => [k, v.label, counts[k]])]
            .map(([k, l, n]) => `<button class="chip ${S.filter === k ? "active" : ""}" data-filter="${k}">${k in STATUS ? `<i class="dot" style="background:rgb(${STATUS[k].color})"></i>` : ""}${l} · ${n}</button>`).join("")}
        </div>
        <div class="table-wrap"><table class="el-table">
          <thead><tr><th>Element</th><th>Status</th><th>Within tol.</th><th>Median</th><th>95th pct</th><th>Signed</th><th>Coverage</th>${isStaff() ? "<th></th>" : ""}</tr></thead>
          <tbody>${rows.slice(0, 500).map((e) => `<tr data-el="${guidIndex[e.guid]}" class="${guidIndex[e.guid] === S.selected ? "sel" : ""}">
            <td><div class="el-name">${esc(e.name || e.guid)}</div><div class="el-type">${esc(e.type.replace(/^Ifc/, ""))}${e.storey ? ` · ${esc(e.storey)}` : ""}</div></td>
            <td><span class="st st-${e.status}">${STATUS[e.status].label}</span></td>
            <td>${e.points ? `${e.within_pct}%` : "–"}</td><td>${fmtMm(e.median_mm)}</td><td>${fmtMm(e.p95_mm)}</td><td>${fmtMm(e.signed_median_mm)}</td><td>${e.coverage_pct}%</td>
            ${isStaff() ? `<td><button class="btn btn-ghost btn-sm" data-issue="${guidIndex[e.guid]}">${icon("tag", "ic sm")}Issue</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="8" class="hint">No elements with this status.</td></tr>`}</tbody>
        </table></div>
        ${rows.length > 500 ? `<p class="hint">Showing the first 500 of ${rows.length}.</p>` : ""}
        <details class="defs"><summary>How statuses are decided</summary>
          <ul>
            <li><b>Distance</b>: from each scan point to the nearest design surface. Signed: + means the built surface is outside the modelled one, − inside.</li>
            <li><b>OK</b>: ≥ 80% of the element's scan points within tolerance. <b>Check</b>: 50–80%. <b>Deviates</b>: under 50%.</li>
            <li><b>Not seen</b>: inside the scanned area but under 20% of its best-scanned side has scan points on it. It may be not built yet, hidden, or moved more than ${s.cutoff_mm} mm. Check visually.</li>
            <li><b>Outside scan</b>: less than 20% of the element is in the scanned area.</li>
          </ul></details>
      </section>
      <section class="card">
        <div class="card-head">${icon("tag")}<h3>Issues</h3></div>
        <ul class="issue-list">${S.issues.map((x) => `<li data-issue-id="${x.id}"><span class="cat cat-${x.category}">${x.category === "note" ? "Note" : x.category}</span> ${esc(x.title)}${x.visible_to_client && isStaff() ? ' <span class="shared-pill">SHARED</span>' : ""}</li>`).join("") || `<li class="hint">${isStaff() ? "Select an element and press Issue to raise one." : "No issues shared yet."}</li>`}</ul>
      </section>
      ${c.report_markdown ? `<section class="card wide"><div class="card-head">${icon("spark")}<h3>QA report</h3><span class="spacer" style="flex:1"></span>
        <a class="btn btn-ghost btn-sm" href="/api/checks/${c.id}/report.pdf" target="_blank">${icon("download")}PDF</a></div>
        <div class="report">${renderMarkdown(c.report_markdown)}</div></section>` : ""}
    </div>`;
}

function selectElement(i, point, focus = true) {
  S.selected = i;
  paintMesh();
  if (focus && S.meshInfo.boxes[i]) {
    const b = S.meshInfo.boxes[i].clone().expandByScalar(1.5);
    fitView(b);
  }
  renderPanel();
  document.querySelector(`#checkPanel tr[data-el="${i}"]`)?.scrollIntoView({ block: "nearest" });
  S.lastPoint = point;
}

// ---- issues -----------------------------------------------------------------------
async function loadIssues() {
  S.issues = await api(`/api/checks/${S.check.id}/annotations`);
  S.issueMarkers.clear();
  const r = sceneSize() * 0.008;
  for (const a of S.issues) {
    if (!a.position) continue;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: CAT_COLOR[a.category] || 0x2563eb, depthTest: false }));
    m.position.set(...a.position); m.renderOrder = 11;
    S.issueMarkers.add(m);
  }
}
function raiseIssue(i) {
  const e = S.meshInfo.meta.elements[i];
  const res = S.check.elements.find((x) => x.guid === e.guid);
  const center = S.meshInfo.boxes[i].getCenter(new THREE.Vector3()).toArray();
  const pos = S.selected === i && S.lastPoint ? S.lastPoint : center;
  const dlg = $("#issueDialog"), form = $("#issueForm");
  form.reset();
  $("#issueError").textContent = "";
  $("#issueWhere").textContent = `${e.name || e.guid} · ${e.type.replace(/^Ifc/, "")} · ${STATUS[res.status].label}`;
  form.elements.title.value = res.status === "deviates" || res.status === "check"
    ? `${e.name || e.type.replace(/^Ifc/, "")}: median ${res.median_mm} mm from design`
    : res.status === "not_seen" ? `${e.name || e.type.replace(/^Ifc/, "")}: not seen in scan` : `${e.name || e.type.replace(/^Ifc/, "")}`;
  form.elements.body.value = res.points ? `${res.within_pct}% of ${res.points.toLocaleString()} scan points within ±${S.check.summary.tolerance_mm} mm; 95th percentile ${fmtMm(res.p95_mm)}; signed median ${fmtMm(res.signed_median_mm)}.` : "";
  form.onsubmit = async (ev) => {
    if (ev.submitter?.value !== "ok") return;
    ev.preventDefault();
    const fd = new FormData(form);
    try {
      await api(`/api/checks/${S.check.id}/annotations`, json("POST", {
        position: pos, element_guid: e.guid, category: fd.get("category"), title: fd.get("title"),
        body: fd.get("body"), visible_to_client: fd.get("visible_to_client") === "on",
      }));
      dlg.close();
      toast("Issue saved", "ok");
      await loadIssues(); renderPanel();
      if (typeof loadAnnotations === "function") loadAnnotations().catch(() => {});
    } catch (err) { $("#issueError").textContent = err.message; }
  };
  dlg.showModal();
}

async function openIssue(a) {
  try {
    const check = await api(`/api/checks/${a.check_id}`);
    await open();
    if (S.scan?.id !== check.scan_id) await selectScan(check.scan_id);
    if (S.check?.id !== check.id) await selectCheck(check.id);
    if (a.position) {
      const p = new THREE.Vector3(...a.position);
      fitView(new THREE.Box3(p.clone().subScalar(2), p.clone().addScalar(2)));
    }
  } catch (e) { fail(e); }
}

// ---- events -----------------------------------------------------------------------
$("#scanList").onclick = async (e) => {
  const del = e.target.closest("[data-del-scan]");
  if (del) {
    e.stopPropagation();
    if (!confirm("Delete this scan and its checks?")) return;
    try { await api(`/api/scans/${del.dataset.delScan}`, { method: "DELETE" }); if (S.scan?.id === +del.dataset.delScan) clearScan(); await projectChanged(); } catch (err) { fail(err); }
    return;
  }
  const li = e.target.closest("li[data-id]");
  if (li) selectScan(+li.dataset.id);
};
$("#checkList").onclick = async (e) => {
  const del = e.target.closest("[data-del-check]");
  if (del) {
    e.stopPropagation();
    if (!confirm("Delete this check and its issues?")) return;
    try { await api(`/api/checks/${del.dataset.delCheck}`, { method: "DELETE" }); if (S.check?.id === +del.dataset.delCheck) { S.check = null; $("#checkPanel").hidden = true; } await refreshScan(); } catch (err) { fail(err); }
    return;
  }
  const li = e.target.closest("li[data-id]");
  if (li) selectCheck(+li.dataset.id);
};
$("#scanInput").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !state.project) return;
  const box = $("#scanProgress"), bar = box.querySelector("progress"), label = box.querySelector("span");
  box.hidden = false;
  try {
    const id = await uploadFile(file, (n) => { bar.value = (n / file.size) * 100; label.textContent = `Uploading ${file.name}…`; });
    label.textContent = "Reading point cloud…";
    const scan = await api(`/api/projects/${state.project.id}/scans`, json("POST", { upload_id: id, name: file.name.replace(/\.[^.]+$/, "") }));
    toast(scan.status === "ready" ? "Scan ready" : "Scan uploaded, processing…", "ok");
    S.autoOpen = scan.id;
    await projectChanged();
    if (scan.status === "ready") selectScan(scan.id);
  } catch (err) { fail(err); }
  box.hidden = true;
};
$("#walkScanBtn").onclick = async () => {
  const id = $("#walkScanSelect").value;
  if (!id) return;
  try { await api(`/api/captures/${id}/scan`, { method: "POST" }); toast("Point cloud from the walk is being prepared", "ok"); await projectChanged(); }
  catch (err) { fail(err); }
};
$("#pickBtn").onclick = () => (S.picking ? stopPicking() : startPicking());
$("#clearPairs").onclick = () => { S.pairs = []; S.markers.clear(); renderPairs(); if (S.picking) { S.picking = "scan"; updatePickView(); } };
$("#pairList").onclick = (e) => {
  const b = e.target.closest("[data-del-pair]"); if (!b) return;
  const i = +b.dataset.delPair;
  S.pairs.splice(i, 1);
  S.markers.children.filter((m) => m.userData.n === i + 1).forEach((m) => S.markers.remove(m));
  S.markers.children.forEach((m) => { if (m.userData.n > i + 1) m.userData.n -= 1; });
  renderPairs();
  if (S.picking) { const last = S.pairs[S.pairs.length - 1]; S.picking = last && !last.model ? "model" : "scan"; updatePickView(); }
};
document.querySelectorAll("input[name=alignMode]").forEach((r) => r.onchange = () => {
  const shared = document.querySelector("input[name=alignMode]:checked").value === "shared";
  $("#pickBox").hidden = shared; $("#sharedHint").hidden = !shared;
  if (shared) stopPicking();
  renderPairs();
});
$("#checkModel").onchange = () => { S.pairs = []; S.markers.clear(); renderPairs(); stopPicking(); };
$("#runCheck").onclick = async () => {
  const shared = document.querySelector("input[name=alignMode]:checked").value === "shared";
  const pairs = shared ? [] : S.pairs.filter((p) => p.model).map((p) => [p.scan, p.model]);
  stopPicking();
  const btn = $("#runCheck"); btn.disabled = true; btn.textContent = "Running…";
  try {
    const c = await api(`/api/scans/${S.scan.id}/checks`, json("POST", {
      bim_model_id: +$("#checkModel").value, pairs, tolerance_mm: +$("#checkTolerance").value || 25,
    }));
    await refreshScan();
    if (c.status === "ready") selectCheck(c.id);
    else if (c.status === "failed") toast(`Check failed: ${c.error}`, "error");
  } catch (err) { fail(err); }
  btn.textContent = "Run check"; renderPairs();
};
$("#checkPanel").onclick = async (e) => {
  const chip = e.target.closest("[data-filter]");
  if (chip) { S.filter = chip.dataset.filter; renderPanel(); return; }
  const issue = e.target.closest("[data-issue]");
  if (issue) { e.stopPropagation(); raiseIssue(+issue.dataset.issue); return; }
  const li = e.target.closest("[data-issue-id]");
  if (li) { const a = S.issues.find((x) => x.id === +li.dataset.issueId); if (a?.position) { const p = new THREE.Vector3(...a.position); fitView(new THREE.Box3(p.clone().subScalar(2), p.clone().addScalar(2))); } return; }
  const row = e.target.closest("tr[data-el]");
  if (row) { selectElement(+row.dataset.el, null, true); return; }
  if (e.target.closest("#reportBtn")) {
    const btn = $("#reportBtn"); btn.disabled = true; btn.classList.add("loading");
    btn.querySelector("span").textContent = "Opus is writing…";
    try { S.check = { ...S.check, ...(await api(`/api/checks/${S.check.id}/report`, { method: "POST" })) }; renderPanel(); toast("Report ready", "ok"); }
    catch (err) { fail(err); btn.disabled = false; btn.classList.remove("loading"); btn.querySelector("span").textContent = "Write QA report with Opus"; }
  }
};
document.querySelectorAll("input[name=colorMode]").forEach((r) => r.onchange = applyColorMode);
$("#showModel").onchange = () => { if (S.mesh) S.mesh.visible = $("#showModel").checked && S.picking !== "scan"; };
$("#modelOpacity").oninput = () => { if (S.mesh) S.mesh.material.opacity = +$("#modelOpacity").value; };
$("#pointSize").oninput = () => { if (S.points) S.points.material.size = +$("#pointSize").value; };
$("#themeBtn").addEventListener("click", () => setTimeout(setBackground));

window.AsBuilt = { open, projectChanged, openIssue };
if (!$("#asbuiltView").hidden) open();
