// Marketplace Listing Helper — code shared by the Facebook panel (content.js)
// and the full-page manager (manager.js). Plain classic script: top-level names
// are visible to whichever script is loaded after it.

const DATA_KEY = "mlh_data";
const DEFAULT_HEADERS = ["id", "title", "price", "category", "condition", "description", "photos", "status", "listed"];
const CONDITIONS = ["New", "Used - Like new", "Used - Good", "Used - Fair"];
const RENEW_DAYS = 7;
const META_KEY = "mlh_meta";
const BACKUP_CHANGES = 5;   // remind after this many unsaved changes…
const BACKUP_DAYS = 7;      // …or this many days since the last export
const DEFAULT_META = {
  changes: 0,
  lastExport: null,
  footer: null, // name of the template auto-added to descriptions when filling
  templates: [
    { name: "Collection & payment", text: "Collection only. Cash or bank transfer on collection. Smoke-free, pet-free home." },
    { name: "Baby item", text: "Clean and well looked after. Washed and ready to use. Smoke-free home." },
  ],
};
let meta = structuredClone(DEFAULT_META);

let headers = [];        // column order (for export)
let rows = [];           // listings (objects keyed by header)
let photos = new Map();  // lowercase filename -> File (this page/session only)
let thumbs = new Map();  // File -> object URL

const SESSION = Math.random().toString(36).slice(2); // tags our own storage writes

const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- CSV ----------
function parseCSV(text) {
  const out = [];
  let row = [], field = "", i = 0, q = false;
  text = text.replace(/^﻿/, "");
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { q = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out.filter(r => r.some(v => v.trim() !== ""));
}

function toCSV(hdrs, data) {
  const esc = v => {
    v = v == null ? "" : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return [hdrs.map(esc).join(",")]
    .concat(data.map(r => hdrs.map(h => esc(r[h])).join(",")))
    .join("\n");
}

// ---------- columns (loose header matching so your sheet's names work) ----------
const ALIASES = {
  id: ["id", "sku", "ref", "item id"],
  title: ["title", "name", "item", "item name"],
  price: ["price", "asking price", "£", "price (£)"],
  category: ["category", "fb category"],
  condition: ["condition"],
  description: ["description", "desc", "details", "notes"],
  photos: ["photos", "photo", "images", "image", "pictures"],
  status: ["status"],
  listed: ["listed", "date listed", "listed on", "listed date"],
  fb_url: ["fb_url", "fb url", "fb link", "facebook url", "facebook link", "link", "url"],
};
function headerFor(key, hdrs = headers) {
  for (const a of ALIASES[key]) {
    const h = hdrs.find(h => h.trim().toLowerCase() === a);
    if (h) return h;
  }
  return null;
}
function ensureCol(key) {
  if (!headerFor(key)) headers.push(key);
  return headerFor(key);
}
const get = (r, key) => { const h = headerFor(key); return h && r[h] != null ? String(r[h]) : ""; };
const set = (r, key, v) => { r[ensureCol(key)] = v; };
const rowKey = r => get(r, "id") || get(r, "title");
const isWebUrl = u => /^https:\/\//i.test(u);
const photoList = r => get(r, "photos").split(/[;|]/).map(s => s.trim()).filter(Boolean);

function nextId() {
  const nums = rows.map(r => parseInt(get(r, "id"), 10)).filter(n => !isNaN(n));
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}

function ageDays(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : Math.floor((Date.now() - d.getTime()) / 86400000);
}

// ---------- persistence: the list lives in the extension ----------
// save() = a change to the list (counts toward the backup reminder)
async function save() {
  meta.changes = (meta.changes || 0) + 1;
  meta.by = SESSION;
  await chrome.storage.local.set({ [DATA_KEY]: { headers, rows, by: SESSION }, [META_KEY]: meta });
}
async function saveMeta() {
  meta.by = SESSION;
  await chrome.storage.local.set({ [META_KEY]: meta });
}
async function load() {
  const got = await chrome.storage.local.get([DATA_KEY, META_KEY]);
  const s = got[DATA_KEY];
  if (s && s.headers) { headers = s.headers; rows = s.rows || []; }
  else { headers = [...DEFAULT_HEADERS]; rows = []; }
  if (got[META_KEY]) meta = { ...structuredClone(DEFAULT_META), ...got[META_KEY] };
}
// The Facebook panel and the manager page can be open at once: when the other one
// writes, pick up its data. Our own writes are recognised by SESSION and ignored.
function watchStorage(onExternal) {
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    const d = ch[DATA_KEY]?.newValue, m = ch[META_KEY]?.newValue;
    let changed = false;
    if (d && d.by !== SESSION && d.headers) { headers = d.headers; rows = d.rows || []; changed = true; }
    if (m && m.by !== SESSION) { meta = { ...structuredClone(DEFAULT_META), ...m }; changed = true; }
    if (changed) onExternal();
  });
}

function backupDue() {
  if (!rows.length) return null;
  const days = meta.lastExport ? Math.floor((Date.now() - new Date(meta.lastExport).getTime()) / 86400000) : null;
  if (meta.changes >= BACKUP_CHANGES) return `${meta.changes} changes since your last export`;
  if (meta.changes > 0 && (days === null || days >= BACKUP_DAYS))
    return days === null ? "You haven't exported a backup yet" : `Last export was ${days} days ago`;
  return null;
}

async function downloadCSV() {
  const blob = new Blob([toCSV(headers, rows)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `listings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  meta.changes = 0;
  meta.lastExport = new Date().toISOString();
  await saveMeta();
}

// ---------- templates ----------
const footerTemplate = () => meta.footer ? meta.templates.find(t => t.name === meta.footer) : null;
function withFooter(desc) {
  const f = footerTemplate();
  if (!f || !f.text.trim()) return desc;
  if (desc.includes(f.text.trim())) return desc;
  return desc ? `${desc}\n\n${f.text.trim()}` : f.text.trim();
}

// Merge a CSV into the list by id (or title). CSV values win, except
// status/listed/fb_url: a blank in the CSV keeps what the extension already has.
function mergeCSV(text) {
  const grid = parseCSV(text);
  if (!grid.length) return { added: 0, updated: 0 };
  const csvHeaders = grid[0].map(h => h.trim());
  const csvRows = grid.slice(1).map(c => Object.fromEntries(csvHeaders.map((h, i) => [h, (c[i] || "").trim()])));
  let added = 0, updated = 0;
  for (const cr of csvRows) {
    const norm = {};
    for (const key of Object.keys(ALIASES)) {
      const h = headerFor(key, csvHeaders);
      if (h) norm[key] = cr[h];
    }
    // carry over any extra columns from the sheet untouched
    const extras = csvHeaders.filter(h => !Object.keys(ALIASES).some(k => headerFor(k, csvHeaders) === h));
    const k = norm.id || norm.title;
    if (!k) continue;
    let r = rows.find(x => rowKey(x) === k);
    if (!r) { r = {}; rows.push(r); added++; } else updated++;
    for (const [key, v] of Object.entries(norm)) {
      if ((key === "status" || key === "listed" || key === "fb_url") && !v) continue;
      set(r, key, v);
    }
    for (const h of extras) { if (!headers.includes(h)) headers.push(h); r[h] = cr[h]; }
  }
  return { added, updated };
}

// ---------- photos ----------
function addPhotoFiles(fileList, fromFolder) {
  let n = 0;
  for (const f of fileList) {
    if (!f.type.startsWith("image/")) continue;
    photos.set(f.name.toLowerCase(), f);
    if (fromFolder && f.webkitRelativePath) {
      const rel = f.webkitRelativePath.split("/").slice(1).join("/").toLowerCase();
      if (rel !== f.name.toLowerCase()) photos.set(rel, f);
    }
    n++;
  }
  return n;
}
function findPhoto(name) {
  const n = name.toLowerCase();
  return photos.get(n) || photos.get(n.split("/").pop()) || null;
}
// Thumbnails: decoding full-size phone photos for a 80px tile is what makes big folders
// laggy, so shrink each file once (a few at a time) and reuse the small image.
const THUMB_PX = 200;
const thumbQueue = [];
let thumbBusy = 0;
function thumbInto(img, f) {
  const done = thumbs.get(f);
  if (typeof done === "string") { img.src = done; return; }
  if (!done) thumbs.set(f, []);
  thumbs.get(f).push(img);
  if (done) return;                       // already queued: just wait for it
  thumbQueue.push(f);
  pumpThumbs();
}
function pumpThumbs() {
  while (thumbBusy < 3 && thumbQueue.length) {
    const f = thumbQueue.shift();
    thumbBusy++;
    makeThumb(f).then(url => {
      const waiting = thumbs.get(f) || [];
      thumbs.set(f, url);
      waiting.forEach(img => { img.src = url; });
    }).finally(() => { thumbBusy--; pumpThumbs(); });
  }
}
async function makeThumb(f) {
  try {
    const bmp = await createImageBitmap(f, { resizeWidth: THUMB_PX, resizeQuality: "low" });
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close();
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.7));
    return URL.createObjectURL(blob);
  } catch {
    return URL.createObjectURL(f);        // unreadable by the decoder: fall back to the file itself
  }
}
function uniqueFiles() {
  const seen = new Set(), out = [];
  for (const f of photos.values()) if (!seen.has(f)) { seen.add(f); out.push(f); }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
function usedPhotoNames(exceptRow) {
  const used = new Set();
  for (const r of rows) if (r !== exceptRow) photoList(r).forEach(p => used.add(p.toLowerCase().split("/").pop()));
  return used;
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Photos named like "12-front.jpg", "12_2.jpg", "12.jpg" or "kallax-shelf-1.jpg"
function autoPairNames(id, title) {
  const out = [];
  const idRe = id ? new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([-_ .(]|$)`, "i") : null;
  const ts = title ? slug(title) : "";
  for (const f of uniqueFiles()) {
    const base = f.name.replace(/\.[^.]+$/, "");
    if ((idRe && idRe.test(base)) || (ts && ts.length > 3 && slug(base).startsWith(ts))) out.push(f.name);
  }
  return out;
}

// ---------- styles (main panel, manager page modals) ----------
const STYLE = `
  #mlh-panel,#mlh-modal{--bg:#fff;--fg:#1c1e21;--muted:#65676b;--line:#e4e6eb;--btn:#f0f2f5;--accent:#1877f2;--warn:#b45309;--bad:#b91c1c;
    font:13px/1.4 system-ui,sans-serif;color:var(--fg)}
  @media (prefers-color-scheme: dark){#mlh-panel,#mlh-modal{--bg:#242526;--fg:#e4e6eb;--muted:#b0b3b8;--line:#3e4042;--btn:#3a3b3c;--warn:#f59e0b;--bad:#f87171}}
  #mlh-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:330px;max-height:75vh;display:flex;flex-direction:column;
    background:var(--bg);border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18)}
  #mlh-panel header,#mlh-modal header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line);font-weight:600}
  #mlh-panel .body{padding:10px 12px;overflow:auto}
  #mlh-panel.min .body{display:none}
  #mlh-panel button,#mlh-modal button{font:inherit;padding:5px 9px;border-radius:6px;border:1px solid var(--line);background:var(--btn);color:var(--fg);cursor:pointer}
  #mlh-panel button.primary,#mlh-modal button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  #mlh-modal button.danger{color:var(--bad)}
  #mlh-panel select{width:100%;margin:6px 0;padding:4px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px}
  #mlh-panel .row,#mlh-modal .row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;align-items:center}
  .mlh-muted{color:var(--muted);font-size:12px}
  .mlh-warn{color:var(--warn);font-weight:600}
  #mlh-panel .banner{border:1px solid var(--warn);border-radius:8px;padding:6px 8px;margin:4px 0 8px;font-size:12px}
  #mlh-modal .tpl-item{border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:8px}
  #mlh-modal .tpl-item textarea{min-height:70px}
  #mlh-modal .content.single{grid-template-columns:1fr}
  #mlh-panel table{width:100%;border-collapse:collapse;margin-top:6px}
  #mlh-panel td{padding:2px 4px;border-top:1px solid var(--line)}
  #mlh-panel td.bad{color:var(--bad)}
  #mlh-panel .strip{display:flex;gap:4px;overflow-x:auto;margin:6px 0}
  #mlh-panel .strip img{width:44px;height:44px;object-fit:cover;border-radius:4px;flex:none}
  #mlh-panel .strip .miss{width:44px;height:44px;border:1px dashed var(--bad);border-radius:4px;font-size:10px;color:var(--bad);
    display:flex;align-items:center;justify-content:center;text-align:center;flex:none;overflow:hidden}
  #mlh-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px}
  #mlh-modal{background:var(--bg);border-radius:12px;width:min(760px,100%);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.3)}
  #mlh-modal .content{padding:12px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:14px}
  @media (max-width:640px){#mlh-modal .content{grid-template-columns:1fr}}
  #mlh-modal label{display:block;margin-bottom:8px;font-weight:600;font-size:12px}
  #mlh-modal input[type=text],#mlh-modal input[type=number],#mlh-modal select,#mlh-modal textarea{display:block;width:100%;box-sizing:border-box;margin-top:3px;
    padding:6px;font:inherit;font-weight:400;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px}
  #mlh-modal textarea{min-height:120px;resize:vertical}
  #mlh-modal .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:6px;max-height:340px;overflow:auto;padding:2px}
  #mlh-modal .ph[hidden]{display:none}
  #mlh-modal .ph{position:relative;cursor:pointer;border-radius:6px;overflow:hidden;border:2px solid transparent}
  #mlh-modal .ph img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
  #mlh-modal .ph .nm{font-size:10px;padding:1px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted)}
  #mlh-modal .ph.sel{border-color:var(--accent)}
  #mlh-modal .ph.used{opacity:.45}
  #mlh-modal .ph .badge{position:absolute;top:4px;left:4px;background:var(--accent);color:#fff;border-radius:999px;min-width:20px;height:20px;
    font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px}
  #mlh-modal footer{display:flex;justify-content:space-between;gap:6px;padding:10px 12px;border-top:1px solid var(--line)}
`;

// ---------- add / edit modal with photo pairing ----------
// cb(event, row) is told what happened: "saved" (row, isNew), "deleted", or "photos"
// (more photos were added to the loaded set).
function openEditor(row, cb) {
  const notify = (...a) => { if (cb) cb(...a); };
  const isNew = !row;
  const draft = {
    id: isNew ? nextId() : get(row, "id"),
    title: isNew ? "" : get(row, "title"),
    price: isNew ? "" : get(row, "price"),
    category: isNew ? "" : get(row, "category"),
    fb_url: isNew ? "" : get(row, "fb_url"),
    condition: isNew ? "" : get(row, "condition"),
    description: isNew ? "" : get(row, "description"),
    photos: isNew ? [] : photoList(row),
  };
  const categories = [...new Set(rows.map(r => get(r, "category")).filter(Boolean))];
  const conditions = [...new Set([...CONDITIONS, draft.condition].filter(Boolean))];

  const back = document.createElement("div");
  back.id = "mlh-backdrop";
  back.innerHTML = `
    <div id="mlh-modal" role="dialog" aria-label="${isNew ? "New item" : "Edit item"}">
      <style>${STYLE}</style>
      <header><span>${isNew ? "New item" : "Edit item"}</span><button data-act="close" title="Close">✕</button></header>
      <div class="content">
        <div>
          <label>Title<input type="text" name="title" maxlength="100"></label>
          <div class="row" style="gap:10px">
            <label style="flex:1">Price (£)<input type="number" name="price" min="0" step="1"></label>
            <label style="flex:1">ID<input type="text" name="id"></label>
          </div>
          <label>Category<input type="text" name="category" list="mlh-cats" placeholder="e.g. Furniture">
            <datalist id="mlh-cats">${categories.map(c => `<option value="${escapeHTML(c)}">`).join("")}</datalist></label>
          <label>Facebook listing URL<input type="text" name="fb_url" placeholder="Filled in by “Link” on a Marketplace item page"></label>
          <label>Condition<select name="condition"><option value="">—</option>
            ${conditions.map(c => `<option>${escapeHTML(c)}</option>`).join("")}</select></label>
          <label>Description<textarea name="description"></textarea></label>
          <div class="row" style="margin-top:-2px">
            <select data-ref="tplpick" style="flex:1;width:auto;margin:0">
              <option value="">Insert template…</option>
              ${meta.templates.map((t, i) => `<option value="${i}">${escapeHTML(t.name)}</option>`).join("")}
            </select>
          </div>
          ${footerTemplate() ? `<p class="mlh-muted" style="margin:2px 0 0">“${escapeHTML(footerTemplate().name)}” footer is added automatically when filling — no need to insert it.</p>` : ""}
        </div>
        <div>
          <div class="row" style="justify-content:space-between">
            <strong>Photos <span class="mlh-muted" data-ref="count"></span></strong>
            <label class="mlh-muted" style="font-weight:400;margin:0"><input type="checkbox" data-ref="unused"> Unused only</label>
          </div>
          <div class="row">
            <button data-act="auto" title="Select photos whose filename starts with the ID or title">Auto-pair</button>
            <button data-act="clear">Clear</button>
            <button data-act="add">Add photos…</button>
            <input type="file" accept="image/*" multiple hidden data-ref="addinput">
          </div>
          <p class="mlh-muted" style="margin:4px 0">Click photos in the order you want them to appear. The first is the cover.</p>
          <div class="grid" data-ref="grid"></div>
          <div class="mlh-muted" data-ref="missing" style="margin-top:6px"></div>
        </div>
      </div>
      <footer>
        <div>${isNew ? "" : `<button class="danger" data-act="delete">Delete item</button>`}</div>
        <div class="row" style="margin:0">
          <button data-act="close">Cancel</button>
          <button class="primary" data-act="save">${isNew ? "Add item" : "Save"}</button>
        </div>
      </footer>
    </div>`;
  document.body.appendChild(back);
  const m = back.querySelector("#mlh-modal");
  const q = s => m.querySelector(s);
  const field = n => q(`[name="${n}"]`);
  for (const k of ["id", "title", "category", "fb_url", "condition", "description"]) field(k).value = draft[k];
  field("price").value = draft.price.replace(/[£,\s]/g, "");

  // The grid is built once per set of loaded photos; clicking only toggles classes/badges.
  let cells = [];
  const lazy = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      lazy.unobserve(en.target);
      thumbInto(en.target, en.target._file);
    }
  }, { root: q('[data-ref="grid"]'), rootMargin: "200px" });

  function buildGrid() {
    const grid = q('[data-ref="grid"]');
    lazy.disconnect();
    grid.innerHTML = "";
    cells = [];
    const files = uniqueFiles();
    if (!files.length) grid.innerHTML = `<p class="mlh-muted">Load your photos folder first, or use “Add photos…”.</p>`;
    const used = usedPhotoNames(row);
    for (const f of files) {
      const lower = f.name.toLowerCase();
      const el = document.createElement("div");
      el.className = "ph";
      el.innerHTML = `<img alt="" decoding="async"><div class="nm"></div><span class="badge" hidden></span>`;
      const img = el.querySelector("img");
      img._file = f;
      lazy.observe(img);
      el.querySelector(".nm").textContent = f.name;
      el.onclick = () => {
        const i = draft.photos.findIndex(p => p.toLowerCase().split("/").pop() === lower);
        if (i >= 0) draft.photos.splice(i, 1); else draft.photos.push(f.name);
        renderGrid();
      };
      grid.appendChild(el);
      cells.push({ el, lower, isUsed: used.has(lower), badge: el.querySelector(".badge") });
    }
    renderGrid();
  }

  function renderGrid() {
    const onlyUnused = q('[data-ref="unused"]').checked;
    const selLower = draft.photos.map(p => p.toLowerCase().split("/").pop());
    for (const c of cells) {
      const idx = selLower.indexOf(c.lower);
      c.el.classList.toggle("sel", idx >= 0);
      c.el.classList.toggle("used", c.isUsed && idx < 0);
      c.el.hidden = onlyUnused && c.isUsed && idx < 0;
      c.el.title = c.el.querySelector(".nm").textContent + (c.isUsed ? " (already paired with another item)" : "");
      c.badge.hidden = idx < 0;
      if (idx >= 0) c.badge.textContent = idx + 1;
    }
    q('[data-ref="count"]').textContent = `(${draft.photos.length} selected)`;
    const missing = draft.photos.filter(p => !findPhoto(p));
    q('[data-ref="missing"]').innerHTML = missing.length
      ? `<span class="mlh-warn">Paired but not in loaded folder:</span> ${missing.map(escapeHTML).join(", ")} — <a href="#" data-act="dropmissing">remove</a>`
      : "";
  }
  buildGrid();

  const close = () => { lazy.disconnect(); back.remove(); };
  back.addEventListener("click", async e => {
    if (e.target === back) return close();
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    e.preventDefault();
    if (act === "close") close();
    if (act === "clear") { draft.photos = []; renderGrid(); }
    if (act === "auto") {
      const found = autoPairNames(field("id").value.trim(), field("title").value.trim());
      const have = new Set(draft.photos.map(p => p.toLowerCase()));
      found.forEach(n => { if (!have.has(n.toLowerCase())) draft.photos.push(n); });
      renderGrid();
      if (!found.length) q('[data-ref="missing"]').innerHTML =
        `<span class="mlh-muted">No matches. Auto-pair looks for files named like “${escapeHTML(field("id").value || "12")}-1.jpg” or starting with the title.</span>`;
    }
    if (act === "add") q('[data-ref="addinput"]').click();
    if (act === "dropmissing") { draft.photos = draft.photos.filter(p => findPhoto(p)); renderGrid(); }
    if (act === "delete") {
      if (!confirm(`Delete “${draft.title || "this item"}” from the list?`)) return;
      rows.splice(rows.indexOf(row), 1);
      await save(); close(); notify("deleted", row);
    }
    if (act === "save") {
      const title = field("title").value.trim();
      if (!title) { field("title").focus(); return; }
      const id = field("id").value.trim() || nextId();
      const clash = rows.find(r => r !== row && get(r, "id") === id);
      if (clash) { alert(`ID ${id} is already used by “${get(clash, "title")}”.`); field("id").focus(); return; }
      const r = row || {};
      set(r, "id", id);
      set(r, "title", title);
      set(r, "price", field("price").value.trim());
      set(r, "category", field("category").value.trim());
      set(r, "condition", field("condition").value);
      set(r, "description", field("description").value.trim());
      const fb = field("fb_url").value.trim();
      if (fb || headerFor("fb_url")) set(r, "fb_url", fb);
      set(r, "photos", draft.photos.join(";"));
      if (isNew) { set(r, "status", "draft"); set(r, "listed", ""); rows.push(r); }
      await save(); close(); notify("saved", r, isNew);
    }
  });
  q('[data-ref="unused"]').onchange = renderGrid;
  q('[data-ref="tplpick"]').onchange = e => {
    const t = meta.templates[+e.target.value];
    e.target.value = "";
    if (!t) return;
    const ta = field("description");
    const start = ta.selectionStart ?? ta.value.length, end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start), after = ta.value.slice(end);
    const sep = before && !before.endsWith("\n") ? "\n\n" : "";
    ta.value = before + sep + t.text + after;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = (before + sep + t.text).length;
  };
  q('[data-ref="addinput"]').onchange = e => {
    const files = [...e.target.files];
    addPhotoFiles(files, false);
    const have = new Set(draft.photos.map(p => p.toLowerCase()));
    files.filter(f => f.type.startsWith("image/")).forEach(f => { if (!have.has(f.name.toLowerCase())) draft.photos.push(f.name); });
    buildGrid(); notify("photos");
  };
  back.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  field(isNew ? "title" : "description").focus();
}

// ---------- template manager ----------
function openTemplates(onSaved) {
  let list = structuredClone(meta.templates);
  let footerIdx = list.findIndex(t => t.name === meta.footer); // track by position so renaming works

  const back = document.createElement("div");
  back.id = "mlh-backdrop";
  back.innerHTML = `
    <div id="mlh-modal" role="dialog" aria-label="Description templates" style="width:min(560px,100%)">
      <style>${STYLE}</style>
      <header><span>Description templates</span><button data-act="close" title="Close">✕</button></header>
      <div class="content single">
        <div>
          <p class="mlh-muted" style="margin-top:0">Insert these from the item form. Choose one as the
            <strong>footer</strong> to add it automatically to every listing when you fill.</p>
          <label>Automatic footer
            <select data-ref="footer"></select></label>
          <div data-ref="list"></div>
          <button data-act="addtpl">+ Add template</button>
        </div>
      </div>
      <footer>
        <span></span>
        <div class="row" style="margin:0">
          <button data-act="close">Cancel</button>
          <button class="primary" data-act="save">Save</button>
        </div>
      </footer>
    </div>`;
  document.body.appendChild(back);
  const m = back.querySelector("#mlh-modal");
  const q = s => m.querySelector(s);

  function syncFromInputs() {
    m.querySelectorAll(".tpl-item").forEach((el, i) => {
      list[i].name = el.querySelector("input").value;
      list[i].text = el.querySelector("textarea").value;
    });
    const v = q('[data-ref="footer"]').value;
    footerIdx = v === "" ? -1 : +v;
  }

  function draw() {
    const box = q('[data-ref="list"]');
    box.innerHTML = "";
    list.forEach((t, i) => {
      const el = document.createElement("div");
      el.className = "tpl-item";
      el.innerHTML = `
        <label>Name<input type="text"></label>
        <label>Text<textarea></textarea></label>
        <button class="danger" data-act="del" data-i="${i}">Delete</button>`;
      el.querySelector("input").value = t.name;
      el.querySelector("textarea").value = t.text;
      el.querySelector("input").addEventListener("input", () => { syncFromInputs(); drawFooter(); });
      box.appendChild(el);
    });
    drawFooter();
  }
  function drawFooter() {
    const sel = q('[data-ref="footer"]');
    sel.innerHTML = `<option value="">None</option>` +
      list.map((t, i) => `<option value="${i}" ${i === footerIdx ? "selected" : ""}>${escapeHTML(t.name || `Template ${i + 1}`)}</option>`).join("");
  }
  draw();

  const close = () => back.remove();
  back.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  back.addEventListener("click", async e => {
    if (e.target === back) return close();
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "close") return close();
    syncFromInputs();
    if (act === "addtpl") {
      list.push({ name: `Template ${list.length + 1}`, text: "" });
      draw();
      const items = m.querySelectorAll(".tpl-item textarea");
      items[items.length - 1].focus();
    }
    if (act === "del") {
      const i = +btn.dataset.i;
      list.splice(i, 1);
      if (footerIdx === i) footerIdx = -1; else if (footerIdx > i) footerIdx--;
      draw();
    }
    if (act === "save") {
      const footerObj = footerIdx >= 0 ? list[footerIdx] : null;
      const kept = list.filter(t => t.name.trim() || t.text.trim());
      const cleaned = kept.map(t => ({ name: t.name.trim(), text: t.text.trim() }));
      cleaned.forEach((t, i) => { if (!t.name) t.name = `Template ${i + 1}`; });
      const names = cleaned.map(t => t.name.toLowerCase());
      if (new Set(names).size !== names.length) { alert("Two templates have the same name — please rename one."); return; }
      meta.templates = cleaned;
      const fi = footerObj ? kept.indexOf(footerObj) : -1;
      meta.footer = fi >= 0 ? cleaned[fi].name : null;
      await saveMeta();
      close();
      if (onSaved) onSaved();
    }
  });
}
