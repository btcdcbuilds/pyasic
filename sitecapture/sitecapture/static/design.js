// YCB design requests: clients describe their block and house, the team turns
// it into a brief, an Opus concept plan (DXF/PDF) and the DA drawing set.
// Uses helpers from app.js ($, api, json, toast, fail, icon, uploadFile, ...).
(() => {
  const STEPS = [
    ["submitted", "Submitted"],
    ["in_review", "Brief & review"],
    ["drafting", "Drafting"],
    ["renders", "Renders"],
    ["ready_for_da", "Ready for DA"],
    ["lodged", "Lodged"],
  ];
  const STATUS_LABEL = Object.fromEntries(STEPS);
  const CLIENT_EDITABLE = ["submitted", "in_review"];
  const CLIENT_KINDS = [
    ["survey", "Survey plan"], ["grading", "Grading plan"], ["contour", "Contour plan"],
    ["sketch", "Sketch"], ["drawing", "Existing drawing"], ["photo", "Site photo"], ["other", "Other"],
  ];
  const TEAM_KINDS = [["cad", "CAD drawing"], ["render", "Render"], ["da_set", "DA drawing set"]];
  const KIND_LABEL = Object.fromEntries([...CLIENT_KINDS, ...TEAM_KINDS, ["concept", "Opus concept"]]);
  const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.dwg,.dxf,.ifc,.rvt,.skp,.pln,.zip";

  const SITE_FIELDS = [
    ["address", "Site address", "text", "span2"],
    ["council", "Council", "text"],
    ["zoning", "Zoning / overlays", "text"],
    ["lot_width_m", "Frontage width (m)", "number"],
    ["lot_depth_m", "Block depth (m)", "number"],
    ["lot_area_m2", "Block area (m²)", "number"],
    ["frontage_faces", "Street faces", "select", "", ["", "North", "North-east", "East", "South-east", "South", "South-west", "West", "North-west"]],
    ["slope", "Slope / fall", "text", "", null, "e.g. 1.2 m fall to rear"],
    ["easements", "Easements / services", "text"],
    ["site_notes", "Other site notes", "text", "span2"],
  ];
  const REQ_FIELDS = [
    ["storeys", "Storeys", "select", "", ["", "1", "2", "Split level"]],
    ["bedrooms", "Bedrooms", "number"],
    ["bathrooms", "Bathrooms", "number"],
    ["garage_spaces", "Garage spaces", "number"],
    ["living_areas", "Living areas", "number"],
    ["style", "Style", "text", "", null, "e.g. coastal, modern farmhouse"],
    ["budget", "Build budget", "text", "", null, "e.g. $650k"],
    ["must_haves", "Must-haves", "text", "span2", null, "e.g. butler's pantry, alfresco, home office"],
  ];
  const ROOM_FILL = {
    living: "#fde7d6", kitchen: "#fde7d6", dining: "#fde7d6", alfresco: "#e8f5e9",
    bedroom: "#e3ecfb", study: "#e3ecfb", bathroom: "#dff3f6", ensuite: "#dff3f6", wc: "#dff3f6", laundry: "#dff3f6",
    garage: "#eceef1", storage: "#eceef1", hall: "#f6f6f4", entry: "#f6f6f4", stairs: "#f6f6f4", other: "#f6f6f4",
  };

  const ds = { list: [], current: null, filter: "", clients: null };
  const esc = escapeHtml;
  const staff = () => isStaff();
  const canEdit = (r) => staff() || CLIENT_EDITABLE.includes(r.status);
  const fmtSize = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`);

  // ---- list ------------------------------------------------------------------
  const filterSel = $("#designStatusFilter");
  filterSel.innerHTML += STEPS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  filterSel.onchange = () => { ds.filter = filterSel.value; renderList(); };
  $("#newDesign").onclick = () => renderForm(null);

  async function open() {
    try {
      ds.list = await api("/api/design-requests");
    } catch (e) { return fail(e); }
    renderList();
    if (ds.current) select(ds.current.id);
    else if (ds.list.length) select(ds.list[0].id);
    else if (!staff()) renderForm(null);
  }

  function renderList() {
    const items = ds.list.filter((r) => !ds.filter || r.status === ds.filter);
    $("#designList").innerHTML = items.length
      ? items.map((r) => `
        <li data-id="${r.id}" class="${ds.current?.id === r.id ? "active" : ""}">
          <div class="row-inline" style="justify-content:space-between;gap:8px">
            <span class="dl-title">${esc(r.title)}</span>
            <span class="dstatus ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
          </div>
          <div class="dl-meta">${staff() ? esc(r.client.name || r.client.email) + " · " : ""}Updated ${fmtDate(r.updated_at)} · ${r.file_count} file${r.file_count === 1 ? "" : "s"}</div>
        </li>`).join("")
      : `<li class="empty-li">${ds.list.length ? "No requests with this status" : staff() ? "No design requests yet" : "You haven't started a design yet"}</li>`;
    $("#designList").querySelectorAll("li[data-id]").forEach((li) => li.onclick = () => select(+li.dataset.id));
  }

  async function select(id) {
    try {
      ds.current = await api(`/api/design-requests/${id}`);
    } catch (e) {
      ds.current = null; renderList(); return fail(e);
    }
    const i = ds.list.findIndex((r) => r.id === id);
    if (i >= 0) ds.list[i] = { ...ds.list[i], ...ds.current, file_count: ds.current.files.length };
    renderList();
    renderDetail();
  }

  // ---- new / edit form ----------------------------------------------------------
  function fieldHtml(prefix, [key, label, type, cls = "", options = null, placeholder = ""], values) {
    const v = values[key] ?? "";
    const name = `${prefix}.${key}`;
    let input;
    if (type === "select") {
      input = `<select name="${name}">${options.map((o) => `<option value="${esc(o)}" ${String(v) === o ? "selected" : ""}>${o || "—"}</option>`).join("")}</select>`;
    } else {
      input = `<input type="${type}" name="${name}" value="${esc(v)}" ${type === "number" ? 'min="0" step="any" inputmode="decimal"' : ""} placeholder="${esc(placeholder)}">`;
    }
    return `<label class="field ${cls}">${label}${input}</label>`;
  }

  async function renderForm(req) {
    ds.current = req;
    renderList();
    const site = req?.site || {}, reqs = req?.requirements || {};
    let clientPicker = "";
    if (staff() && !req) {
      if (!ds.clients) ds.clients = await api("/api/clients").catch(() => []);
      clientPicker = `<label class="field span2">Client
        <select name="client_id" required><option value="">Choose a client…</option>
        ${ds.clients.map((c) => `<option value="${c.id}">${esc(c.name || c.email)} (${esc(c.email)})</option>`).join("")}
        </select></label>`;
    }
    $("#designDetail").innerHTML = `
      <form id="designForm" class="dd-form">
        <div class="dd-head">
          <div><h2>${req ? "Edit design request" : "New design request"}</h2>
          <p class="muted">${req ? "" : "Tell us about your block and the home you want. You can add survey plans and sketches on the next step."}</p></div>
        </div>
        <div class="dd-grid">
          <section class="card wide">
            <div class="card-head">${icon("home")}<h3>Project</h3></div>
            <div class="form-grid">
              <label class="field span2">Name for this design<input type="text" name="title" required maxlength="200" value="${esc(req?.title || "")}" placeholder="e.g. Smith family home, Lot 12"></label>
              ${clientPicker}
            </div>
          </section>
          <section class="card">
            <div class="card-head">${icon("map")}<h3>Your block</h3></div>
            <div class="form-grid">${SITE_FIELDS.map((f) => fieldHtml("site", f, site)).join("")}</div>
          </section>
          <section class="card">
            <div class="card-head">${icon("tag")}<h3>What you need</h3></div>
            <div class="form-grid">${REQ_FIELDS.map((f) => fieldHtml("req", f, reqs)).join("")}</div>
          </section>
          <section class="card wide">
            <div class="card-head">${icon("pencil")}<h3>Describe your floor plan</h3></div>
            <textarea name="description" rows="6" maxlength="20000" placeholder="How do you live? e.g. Open-plan kitchen, living and dining at the back opening to the yard. Master suite at the front with walk-in robe. Kids' bedrooms together near a second living room.">${esc(req?.description || "")}</textarea>
            <p class="hint">Anything goes: room wish-list, how rooms connect, views, sun, privacy. You can also upload a hand sketch or an existing plan after saving.</p>
          </section>
        </div>
        <p id="designFormError" class="error"></p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" id="designFormCancel">Cancel</button>
          <button class="btn btn-primary">${req ? "Save changes" : "Save & continue"}</button>
        </div>
      </form>`;
    $("#designFormCancel").onclick = () => (req ? select(req.id) : (ds.current = null, renderList(), renderEmptyDetail()));
    $("#designForm").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { title: fd.get("title").trim(), site: {}, requirements: {}, description: fd.get("description").trim() };
      for (const [k, v] of fd.entries()) {
        const s = String(v).trim();
        if (!s) continue;
        const [group, key] = k.split(".");
        if (!key) continue;
        const def = (group === "site" ? SITE_FIELDS : REQ_FIELDS).find((f) => f[0] === key);
        const val = def[2] === "number" ? Number(s) : s;
        (group === "site" ? body.site : body.requirements)[key] = val;
      }
      if (fd.get("client_id")) body.client_id = +fd.get("client_id");
      try {
        const saved = req
          ? await api(`/api/design-requests/${req.id}`, json("PATCH", body))
          : await api("/api/design-requests", json("POST", body));
        if (!req) ds.list.unshift(saved);
        toast(req ? "Saved" : "Design request created. Add your plans and sketches below.", "ok");
        await select(saved.id);
      } catch (err) { $("#designFormError").textContent = err.message; }
    };
  }

  function renderEmptyDetail() {
    $("#designDetail").innerHTML = `<div class="empty-inner design-empty">${icon("home")}
      <h3>Design your new home with YCB</h3>
      <p>Tell us about your block, upload your survey or grading plans, and sketch or describe the house you want. Our team turns it into drawings ready for your DA.</p></div>`;
  }

  // ---- detail ---------------------------------------------------------------------
  function kv(obj, fields) {
    const rows = fields.filter(([k]) => obj[k] !== undefined && obj[k] !== "")
      .map(([k, label]) => `<dt>${label}</dt><dd>${esc(obj[k])}</dd>`);
    return rows.length ? `<dl class="kv">${rows.join("")}</dl>` : `<p class="hint">Nothing entered yet.</p>`;
  }

  function fileItem(f) {
    const toggle = staff()
      ? `<label class="check" title="Show this file to the client"><input type="checkbox" data-vis="${f.id}" ${f.visible_to_client ? "checked" : ""}> Client can see</label>`
      : "";
    return `<li>${icon("file")}<a href="${f.url}" target="_blank" rel="noopener" title="${esc(f.filename)}">${esc(f.filename)}</a>
      <span class="kind">${KIND_LABEL[f.kind] || f.kind} · ${fmtSize(f.size)}</span><span class="spacer"></span>${toggle}</li>`;
  }

  function fileGroup(title, files, empty) {
    return `<div class="file-group"><h4>${title}</h4>${files.length
      ? `<ul class="file-list">${files.map(fileItem).join("")}</ul>`
      : `<p class="hint">${empty}</p>`}</div>`;
  }

  function uploadRow(kinds, id) {
    return `<div class="upload-row">
      <select id="${id}Kind" aria-label="File type">${kinds.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
      <label class="dropzone compact" data-ddrop>
        <input type="file" id="${id}Input" multiple accept="${ACCEPT}">
        ${icon("upload")}<span><strong>Add files</strong><small>PDF, JPG, PNG, DWG, DXF · drop or click</small></span>
      </label>
    </div>
    <div class="progress" id="${id}Progress" hidden><span class="hint"></span><progress max="100" value="0"></progress></div>`;
  }

  function renderDetail() {
    const r = ds.current;
    const idx = STEPS.findIndex(([s]) => s === r.status);
    const editable = canEdit(r);
    const inputs = r.files.filter((f) => CLIENT_KINDS.some(([k]) => k === f.kind));
    const concept = r.files.filter((f) => f.kind === "concept");
    const deliverables = r.files.filter((f) => TEAM_KINDS.some(([k]) => k === f.kind));

    $("#designDetail").innerHTML = `
      <div class="dd-head">
        <div><h2>${esc(r.title)}</h2>
          <p class="muted">${staff() ? `${esc(r.client.name || r.client.email)} · ` : ""}Started ${fmtDate(r.created_at)}</p></div>
        <span class="spacer"></span>
        ${staff() ? `<select id="designStatus" aria-label="Status">${STEPS.map(([v, l]) => `<option value="${v}" ${v === r.status ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
        ${editable ? `<button class="btn btn-ghost btn-sm" id="designEdit">${icon("pencil")}<span>Edit details</span></button>` : ""}
      </div>
      <ol class="stepper">${STEPS.map(([s, l], i) => `<li class="${i < idx ? "done" : i === idx ? "current" : ""}"><span class="dot">${i < idx ? "✓" : i + 1}</span>${l}</li>`).join("")}</ol>
      ${!staff() && !editable ? `<p class="hint" style="margin-bottom:12px">Our team is drafting your plans, so details are locked. Use the messages below for any changes.</p>` : ""}
      <div class="dd-grid">
        <section class="card">
          <div class="card-head">${icon("map")}<h3>Block</h3></div>
          ${kv(r.site, SITE_FIELDS.map((f) => [f[0], f[1]]))}
        </section>
        <section class="card">
          <div class="card-head">${icon("tag")}<h3>Requirements</h3></div>
          ${kv(r.requirements, REQ_FIELDS.map((f) => [f[0], f[1]]))}
        </section>
        <section class="card wide">
          <div class="card-head">${icon("pencil")}<h3>Floor plan description</h3></div>
          ${r.description ? `<p style="white-space:pre-wrap;margin:0">${esc(r.description)}</p>` : `<p class="hint">No description yet.</p>`}
        </section>
        <section class="card wide">
          <div class="card-head">${icon("file")}<h3>Plans & files</h3></div>
          ${fileGroup(staff() ? "From the client" : "Your plans, sketches & photos", inputs, "No survey, grading plan or sketch uploaded yet.")}
          ${editable ? uploadRow(CLIENT_KINDS, "clientUp") : ""}
          ${staff() ? fileGroup("Opus concept (internal until shared)", concept, "Generate a concept below.") : ""}
          ${fileGroup(staff() ? "Deliverables" : "Drawings from YCB", deliverables, staff() ? "Upload CAD drawings, renders and the DA set here." : "Your drawings will appear here when they're ready.")}
          ${staff() ? uploadRow(TEAM_KINDS, "teamUp") : ""}
        </section>
        ${staff() ? aiCard(r) : ""}
        <section class="card wide">
          <div class="card-head">${icon("chat")}<h3>Messages</h3></div>
          <ul class="comments">${r.comments.length ? r.comments.map((c) => `
            <li class="${c.author_is_staff ? "staff" : ""} ${c.internal ? "internal" : ""}">
              <div class="c-meta">${esc(c.author)}${c.author_is_staff ? " · YCB" : ""} · ${fmtDateTime(c.created_at)}${c.internal ? " · internal note" : ""}</div>
              <div style="white-space:pre-wrap">${esc(c.body)}</div></li>`).join("") : `<li class="hint" style="background:none;border-style:dashed">No messages yet.</li>`}</ul>
          <form class="comment-form" id="commentForm">
            <textarea name="body" rows="3" required maxlength="10000" placeholder="${staff() ? "Message the client, or add an internal note" : "Ask a question or request a change"}"></textarea>
            <div class="row-inline">
              ${staff() ? `<label class="check"><input type="checkbox" name="internal"> Internal note (team only)</label>` : "<span></span>"}
              <button class="btn btn-primary btn-sm">Send</button>
            </div>
          </form>
        </section>
      </div>`;
    wireDetail(r);
  }

  function aiCard(r) {
    const c = r.concept;
    const levels = c?.levels || [];
    return `<section class="card wide">
      <div class="card-head">${icon("spark")}<h3>Opus brief & concept</h3><span class="spacer" style="flex:1"></span>
        <button class="btn btn-ai btn-sm" id="aiConcept">${icon("spark")}<span>${c ? "Regenerate" : "Generate brief & concept"}</span></button></div>
      <p class="hint">Opus reads the block details, description and any PDF or image plans, then writes a design brief, a list of questions for the client, and a concept floor plan exported to DXF and PDF. It is a starting point for drafting: check it, then develop and certify the drawings.</p>
      ${c ? `
        <div class="dd-grid">
          <div>${levels.map((lv) => `<h4 style="margin:4px 0">${esc(lv.name)} · ${c.areas_m2?.[lv.name] ?? "?"} m² of rooms</h4>${conceptSvg(c, lv)}`).join("")}</div>
          <div class="ai-side">
            ${c.checks?.length ? `<h4>Geometry checks</h4><ul class="checks">${c.checks.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : `<p class="hint">Geometry checks: no rooms outside the setbacks and no overlaps.</p>`}
            ${r.ai_questions?.length ? `<h4>Questions for the client</h4><ol class="questions">${r.ai_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
              <button class="btn btn-ghost btn-sm" id="askQuestions">${icon("chat")}<span>Send questions to client</span></button>` : ""}
            ${c.notes?.length ? `<h4>Design notes</h4><ul class="questions">${c.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
          </div>
        </div>
        ${r.ai_brief ? `<details open><summary><strong>Design brief</strong></summary><div class="report">${renderMarkdown(r.ai_brief)}</div></details>` : ""}` : ""}
    </section>`;
  }

  // Plan view of one level: street at the bottom, rear boundary at the top.
  function conceptSvg(c, level) {
    const { width: W, depth: D } = c.lot, sb = c.setbacks, pad = 2.5;
    const Y = (y) => D - y; // flip so +y (rear) is up
    const rooms = level.rooms.map((r) => {
      const fs = Math.max(0.28, Math.min(0.55, r.width / 9));
      return `<g><rect x="${r.x}" y="${Y(r.y + r.depth)}" width="${r.width}" height="${r.depth}" fill="${ROOM_FILL[r.type] || ROOM_FILL.other}" stroke="#1d2433" stroke-width="0.12"/>
        <text x="${r.x + r.width / 2}" y="${Y(r.y + r.depth / 2) - 0.1}" font-size="${fs}" text-anchor="middle" font-weight="600">${esc(r.name)}</text>
        <text x="${r.x + r.width / 2}" y="${Y(r.y + r.depth / 2) + fs}" font-size="${fs * 0.75}" text-anchor="middle" fill="#5b6475">${r.width.toFixed(1)} × ${r.depth.toFixed(1)}</text></g>`;
    }).join("");
    const a = ((c.north_deg || 0) * Math.PI) / 180, nx = W + 1.3, ny = 2.2;
    return `<svg class="concept-svg" viewBox="${-pad} ${-pad} ${W + 2 * pad + 1} ${D + 2 * pad + 1}" font-family="Inter, sans-serif" role="img" aria-label="Concept plan, ${esc(level.name)}">
      <rect x="0" y="0" width="${W}" height="${D}" fill="#fafaf8" stroke="#d1461d" stroke-width="0.15"/>
      <rect x="${sb.left}" y="${Y(D - sb.rear)}" width="${W - sb.left - sb.right}" height="${D - sb.front - sb.rear}" fill="none" stroke="#8a92a3" stroke-width="0.08" stroke-dasharray="0.5 0.35"/>
      ${rooms}
      <line x1="${nx}" y1="${ny}" x2="${nx + Math.sin(a) * 1.4}" y2="${ny - Math.cos(a) * 1.4}" stroke="#1f4fbf" stroke-width="0.15"/>
      <text x="${nx + Math.sin(a) * 1.9}" y="${ny - Math.cos(a) * 1.9 + 0.2}" font-size="0.6" fill="#1f4fbf" text-anchor="middle" font-weight="700">N</text>
      <text x="${W / 2}" y="${D + 1.4}" font-size="0.55" text-anchor="middle" fill="#5b6475">STREET · ${W} m frontage × ${D} m</text>
    </svg>`;
  }

  function wireDetail(r) {
    $("#designEdit") && ($("#designEdit").onclick = () => renderForm(r));
    $("#designStatus") && ($("#designStatus").onchange = async (e) => {
      try {
        await api(`/api/design-requests/${r.id}`, json("PATCH", { status: e.target.value }));
        toast(`Status: ${STATUS_LABEL[e.target.value]}`, "ok");
        select(r.id);
      } catch (err) { fail(err); e.target.value = r.status; }
    });
    document.querySelectorAll("#designDetail [data-vis]").forEach((cb) => cb.onchange = async () => {
      try {
        await api(`/api/design-files/${cb.dataset.vis}`, json("PATCH", { visible_to_client: cb.checked }));
        toast(cb.checked ? "Shared with client" : "Hidden from client", "ok");
        select(r.id);
      } catch (err) { cb.checked = !cb.checked; fail(err); }
    });
    for (const id of ["clientUp", "teamUp"]) {
      const input = $(`#${id}Input`);
      if (!input) continue;
      const zone = input.closest("[data-ddrop]");
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault(); zone.classList.remove("dragover");
        if (e.dataTransfer.files.length) addFiles(r, [...e.dataTransfer.files], $(`#${id}Kind`).value, id);
      });
      input.onchange = () => { if (input.files.length) addFiles(r, [...input.files], $(`#${id}Kind`).value, id); };
    }
    $("#aiConcept") && ($("#aiConcept").onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.classList.add("loading");
      btn.querySelector("span").textContent = "Opus is working… (can take a few minutes)";
      try {
        ds.current = await api(`/api/design-requests/${r.id}/ai-concept`, { method: "POST" });
        toast("Brief and concept ready. Concept files are hidden from the client until you share them.", "ok");
        await select(r.id);
      } catch (err) {
        fail(err);
        btn.disabled = false; btn.classList.remove("loading");
        btn.querySelector("span").textContent = r.concept ? "Regenerate" : "Generate brief & concept";
      }
    });
    $("#askQuestions") && ($("#askQuestions").onclick = () => {
      const ta = $("#commentForm textarea");
      ta.value = "To get your drawings started we need a few details:\n" + r.ai_questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
      ta.focus(); ta.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    $("#commentForm").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api(`/api/design-requests/${r.id}/comments`, json("POST", { body: fd.get("body").trim(), internal: fd.get("internal") === "on" }));
        await select(r.id);
      } catch (err) { fail(err); }
    };
  }

  async function addFiles(r, files, kind, id) {
    const box = $(`#${id}Progress`), bar = box.querySelector("progress"), label = box.querySelector("span");
    box.hidden = false;
    const total = files.reduce((s, f) => s + f.size, 0) || 1;
    let done = 0, added = 0;
    for (const f of files) {
      try {
        const uploadId = await uploadFile(f, (n) => {
          bar.value = ((done + n) / total) * 100;
          label.textContent = `Uploading ${f.name}…`;
        }, `/api/design-requests/${r.id}/uploads`);
        await api(`/api/design-requests/${r.id}/files`, json("POST", { upload_id: uploadId, kind, visible_to_client: true }));
        added++;
      } catch (err) { fail(err); }
      done += f.size;
    }
    box.hidden = true;
    if (added) toast(`${added} file${added === 1 ? "" : "s"} added`, "ok");
    await select(r.id);
  }

  window.Design = { open };
})();
