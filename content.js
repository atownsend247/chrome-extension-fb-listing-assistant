// Marketplace Listing Helper
// Adds a panel to Facebook Marketplace pages. It keeps your listings list,
// lets you add/edit items and pair photos, and pre-fills the Create listing form.
// It NEVER clicks Next/Publish — you review and publish yourself.
// Data, CSV, photo and editor code lives in shared.js (also used by manager.html).

(() => {
  if (window.__mlhLoaded) return;
  window.__mlhLoaded = true;

  let current = -1;
  let currentKey = null;   // survives the list being reloaded from the manager page

  // ---------- filling Facebook's form ----------
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }

  function findField(labelText) {
    const want = labelText.toLowerCase();
    for (const lab of document.querySelectorAll("label")) {
      if (lab.closest("#mlh-panel, #mlh-modal")) continue;
      const t = (lab.innerText || "").trim().toLowerCase();
      if (t === want || t.startsWith(want)) {
        const el = lab.querySelector("input, textarea") || (lab.htmlFor && document.getElementById(lab.htmlFor));
        if (el) return { el, label: lab };
        const combo = lab.querySelector('[role="combobox"], [role="button"]') ||
          (lab.getAttribute("role") === "combobox" ? lab : null);
        if (combo) return { combo, label: lab };
      }
    }
    const aria = document.querySelector(`[aria-label="${labelText}" i]`);
    if (aria) return aria.matches("input, textarea") ? { el: aria } : { combo: aria };
    return null;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function pickDropdown(labelText, optionText) {
    if (!optionText) return "skipped";
    const f = findField(labelText);
    const target = f && (f.combo || f.label);
    if (!target) return "not found";
    target.click();
    await sleep(600);
    const want = optionText.trim().toLowerCase();
    const opts = [...document.querySelectorAll('[role="option"], [role="menuitemradio"], [role="radio"], [role="listbox"] [role="button"]')];
    const match = opts.find(o => (o.innerText || "").trim().toLowerCase() === want) ||
      opts.find(o => (o.innerText || "").trim().toLowerCase().includes(want));
    if (match) { match.click(); await sleep(300); return "ok"; }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return "pick manually";
  }

  async function attachPhotos(names) {
    if (!names.length) return "none paired";
    const files = [], missing = [];
    for (const n of names) {
      const f = findPhoto(n);
      const file = f && await realFile(f);
      file ? files.push(file) : missing.push(n);
    }
    if (!files.length) return photos.size ? `not in folder: ${missing.join(", ")}` : "load photos folder first";
    const input = [...document.querySelectorAll('input[type="file"]')]
      .filter(i => !i.closest("#mlh-panel, #mlh-modal"))
      .find(i => (i.accept || "").includes("image")) ||
      [...document.querySelectorAll('input[type="file"]')].find(i => !i.closest("#mlh-panel, #mlh-modal"));
    if (!input) return "upload box not found";
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return missing.length ? `${files.length} added, missing: ${missing.join(", ")}` : `${files.length} added`;
  }

  async function fillCurrent() {
    const r = rows[current];
    if (!r) return;
    const report = [];
    report.push(["Photos", await attachPhotos(photoList(r))]);
    await sleep(800);
    for (const [label, key] of [["Title", "title"], ["Price", "price"]]) {
      const f = findField(label);
      let v = get(r, key);
      if (key === "price") v = v.replace(/[£,\s]/g, "");
      if (f && f.el) { setNativeValue(f.el, v); report.push([label, "ok"]); }
      else report.push([label, "not found"]);
    }
    report.push(["Category", await pickDropdown("Category", get(r, "category"))]);
    report.push(["Condition", await pickDropdown("Condition", get(r, "condition"))]);
    await sleep(500);
    const d = findField("Description");
    if (d && d.el) {
      setNativeValue(d.el, withFooter(get(r, "description")));
      report.push(["Description", "ok"]);
      if (footerTemplate()) report.push(["Footer", `ok (${footerTemplate().name})`]);
    }
    else report.push(["Description", "not found"]);
    showReport(report);
  }

  async function setStatus(status) {
    const r = rows[current];
    if (!r) return;
    set(r, "status", status);
    if (status === "listed") set(r, "listed", new Date().toISOString().slice(0, 10));
    await save();
    render();
  }

  async function exportCSV() {
    await downloadCSV();
    render();
  }

  // ---------- main panel ----------
  const panel = document.createElement("div");
  panel.id = "mlh-panel";
  panel.innerHTML = `
    <style>${STYLE}</style>
    <header><span>Listing Helper</span><button id="mlh-min" title="Minimise">–</button></header>
    <div class="body">
      <div class="row">
        <button id="mlh-new" class="primary">+ New item</button>
        <button id="mlh-csv-btn">Import CSV</button>
        <button id="mlh-dir-btn">Load photos</button>
        <button id="mlh-tpl">Templates</button>
        <button id="mlh-manager" title="Open the full-page manager in a new tab">Manager ↗</button>
        <input id="mlh-csv" type="file" accept=".csv" hidden>
        <input id="mlh-dir" type="file" webkitdirectory multiple hidden>
      </div>
      <div id="mlh-backup" class="banner" hidden>
        <span id="mlh-backup-msg"></span>
        <div class="row" style="margin:4px 0 0"><button id="mlh-backup-now" class="primary">Export backup</button></div>
      </div>
      <div id="mlh-status" class="mlh-muted"></div>
      <div id="mlh-link" class="banner" style="border-color:var(--accent)" hidden>
        <strong>Link this Facebook listing</strong>
        <div id="mlh-link-state" class="mlh-muted"></div>
        <select id="mlh-link-pick"></select>
        <div class="row" style="margin:0">
          <button id="mlh-link-btn" class="primary">Link</button>
          <button id="mlh-unlink">Unlink</button>
        </div>
      </div>
      <div id="mlh-main" hidden>
        <select id="mlh-pick"></select>
        <div id="mlh-info" class="mlh-muted"></div>
        <div id="mlh-strip" class="strip"></div>
        <div class="row">
          <button id="mlh-fill" class="primary">Fill this listing</button>
          <button id="mlh-edit">Edit</button>
        </div>
        <div class="row">
          <button id="mlh-mark">Mark listed</button>
          <button id="mlh-sold">Mark sold</button>
          <button id="mlh-next">Next draft →</button>
        </div>
        <div class="row">
          <button id="mlh-export">Export CSV</button>
        </div>
        <div id="mlh-footer-note" class="mlh-muted"></div>
        <div id="mlh-report"></div>
        <p class="mlh-muted">Check everything, then press Next/Publish on Facebook yourself.</p>
      </div>
    </div>`;
  const $ = s => panel.querySelector(s);

  // ---------- link an existing Facebook listing to an item ----------
  // Read-only: remembers the item page's URL on the row; nothing is clicked on Facebook.
  const itemIdFromPage = () => (location.pathname.match(/^\/marketplace\/item\/(\d+)/) || [])[1] || null;
  const itemUrl = id => `https://www.facebook.com/marketplace/item/${id}/`;
  const linkedRow = id => rows.find(r => get(r, "fb_url").includes(`/marketplace/item/${id}`));
  const words = t => new Set((t.toLowerCase().match(/[a-z0-9]{3,}/g) || []));
  let linkSig = null;

  function updateLinkBox() {
    const id = itemIdFromPage();
    const box = $("#mlh-link");
    const sig = id && `${id}|${rows.map(r => rowKey(r) + get(r, "fb_url")).join(",")}`;
    if (sig === linkSig) return;
    linkSig = sig;
    box.hidden = !id || !rows.length;
    if (box.hidden) return;
    const have = linkedRow(id);
    const sel = $("#mlh-link-pick");
    sel.innerHTML = "";
    // suggest the unlinked item whose title shares the most words with the page title
    const pageWords = words(document.title);
    let best = -1, bestScore = 0;
    rows.forEach((r, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = get(r, "title") + (get(r, "fb_url") ? " (linked)" : "");
      sel.appendChild(o);
      if (!get(r, "fb_url")) {
        const score = [...words(get(r, "title"))].filter(w => pageWords.has(w)).length;
        if (score > bestScore) { best = i; bestScore = score; }
      }
    });
    if (have) sel.value = rows.indexOf(have);
    else if (best >= 0) sel.value = best;
    else sel.selectedIndex = -1;
    $("#mlh-link-state").textContent = have
      ? `Linked to “${get(have, "title")}”.`
      : "Not linked yet. Pick the item this listing is for.";
    $("#mlh-link-btn").textContent = have ? "Re-link" : "Link";
    $("#mlh-unlink").hidden = !have;
  }

  async function linkListing() {
    const id = itemIdFromPage();
    const r = rows[+$("#mlh-link-pick").value];
    if (!id || !r) return;
    if (get(r, "fb_url") && !get(r, "fb_url").includes(`/marketplace/item/${id}`) &&
        !confirm(`“${get(r, "title")}” is already linked to a different listing. Replace that link?`)) return;
    const other = linkedRow(id);
    if (other && other !== r) set(other, "fb_url", "");
    set(r, "fb_url", itemUrl(id));
    if (get(r, "status").toLowerCase() !== "sold") set(r, "status", "listed");
    if (!get(r, "listed")) set(r, "listed", new Date().toISOString().slice(0, 10));
    await save();
    current = rows.indexOf(r);
    render();
    $("#mlh-report").textContent = `Linked to “${get(r, "title")}”. Check its listed date if you posted it earlier.`;
  }

  async function unlinkListing() {
    const have = linkedRow(itemIdFromPage());
    if (!have) return;
    set(have, "fb_url", "");
    await save();
    render();
  }

  function render() {
    linkSig = null;
    updateLinkBox();
    const unpaired = rows.filter(r => !photoList(r).length && (get(r, "status") || "draft").toLowerCase() === "draft").length;
    $("#mlh-status").innerHTML =
      `${rows.length} item${rows.length === 1 ? "" : "s"} · ${uniqueFiles().length} photos loaded` +
      (unpaired ? ` · <span class="mlh-warn">${unpaired} draft${unpaired === 1 ? "" : "s"} without photos</span>` : "");
    const due = backupDue();
    $("#mlh-backup").hidden = !due;
    if (due) $("#mlh-backup-msg").textContent = `⚠ ${due}. Your list only lives in this browser — export a backup.`;
    const f = footerTemplate();
    $("#mlh-footer-note").textContent = f ? `Footer “${f.name}” is added to descriptions when filling.` : "";
    $("#mlh-main").hidden = !rows.length;
    if (!rows.length) return;
    if (current < 0 || current >= rows.length) current = 0;
    currentKey = rowKey(rows[current]);

    const sel = $("#mlh-pick");
    sel.innerHTML = "";
    rows.forEach((r, i) => {
      const st = (get(r, "status") || "draft").toLowerCase();
      const age = ageDays(get(r, "listed"));
      const due = st === "listed" && age != null && age >= RENEW_DAYS;
      const tag = st === "sold" ? "✓ sold" : due ? `⟳ renew (${age}d)` : st === "listed" ? `listed ${age ?? "?"}d` : "draft";
      const o = document.createElement("option");
      o.value = i;
      o.textContent = `${get(r, "title") || "(untitled)"} — ${tag}`;
      sel.appendChild(o);
    });
    sel.value = current;

    const r = rows[current];
    const age = ageDays(get(r, "listed"));
    $("#mlh-info").innerHTML =
      `£${get(r, "price") || "?"} · ${get(r, "condition") || "no condition"} · ${get(r, "category") || "no category"}` +
      (age != null && age >= RENEW_DAYS && get(r, "status").toLowerCase() === "listed"
        ? `<br><span class="mlh-warn">Due a renew — listed ${age} days ago</span>` : "");

    if (isWebUrl(get(r, "fb_url")))
      $("#mlh-info").innerHTML += `<br><a href="${escapeHTML(get(r, "fb_url"))}" target="_blank" rel="noopener">Open on Facebook ↗</a>`;

    const strip = $("#mlh-strip");
    strip.innerHTML = "";
    const names = photoList(r);
    if (!names.length) strip.innerHTML = `<span class="mlh-muted">No photos paired — use Edit.</span>`;
    for (const n of names) {
      const f = findPhoto(n);
      if (f) { const img = document.createElement("img"); thumbInto(img, f); img.title = n; strip.appendChild(img); }
      else { const d = document.createElement("div"); d.className = "miss"; d.textContent = n; d.title = `${n} not in loaded folder`; strip.appendChild(d); }
    }
  }

  function showReport(items) {
    $("#mlh-report").innerHTML = "<table>" + items.map(([k, v]) =>
      `<tr><td>${k}</td><td class="${/^(ok\b|\d+ added$)/.test(v) ? "" : "bad"}">${escapeHTML(v)}</td></tr>`
    ).join("") + "</table>";
  }

  function nextDraft() {
    for (let k = 1; k <= rows.length; k++) {
      const i = (current + k) % rows.length;
      const st = (get(rows[i], "status") || "draft").toLowerCase();
      if (st !== "listed" && st !== "sold") { current = i; $("#mlh-report").innerHTML = ""; render(); return; }
    }
    $("#mlh-report").textContent = "No drafts left.";
  }

  // What to do when the shared editor saves/deletes/adds photos.
  function afterEdit(event, row) {
    if (event === "saved") { current = rows.indexOf(row); $("#mlh-report").innerHTML = ""; }
    if (event === "deleted") current = Math.min(current, rows.length - 1);
    render();
  }

  // ---------- wiring ----------
  $("#mlh-min").onclick = () => panel.classList.toggle("min");
  $("#mlh-new").onclick = () => openEditor(null, afterEdit);
  $("#mlh-edit").onclick = () => rows[current] && openEditor(rows[current], afterEdit);
  $("#mlh-csv-btn").onclick = () => $("#mlh-csv").click();
  $("#mlh-dir-btn").onclick = () => $("#mlh-dir").click();
  $("#mlh-link-btn").onclick = linkListing;
  $("#mlh-unlink").onclick = unlinkListing;
  $("#mlh-manager").onclick = () => chrome.runtime.sendMessage({ open: "manager" });

  $("#mlh-csv").onchange = async e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const { added, updated } = mergeCSV(await f.text());
    await save();
    if (current < 0) nextDraft();
    render();
    $("#mlh-report").textContent = `Imported: ${added} new, ${updated} updated.`;
  };
  $("#mlh-dir").onchange = async e => {
    const picked = [...e.target.files];
    e.target.value = "";
    const n = addPhotoFiles(picked, true);
    render();
    const rep = $("#mlh-report");
    rep.textContent = `${n} photos loaded. Saving…`;
    const r = await saveToLibrary(picked, (d, t) => { rep.textContent = `${n} photos loaded. Saving ${d}/${t}…`; });
    render();
    rep.textContent = `${n} photos loaded; ${r.saved} saved for next time` +
      (r.failed.length ? `, ${r.failed.length} couldn't be saved (${r.failed.slice(0, 3).join(", ")})` : "") + ".";
  };
  $("#mlh-pick").onchange = e => { current = +e.target.value; $("#mlh-report").innerHTML = ""; render(); };
  $("#mlh-fill").onclick = fillCurrent;
  $("#mlh-mark").onclick = () => setStatus("listed");
  $("#mlh-sold").onclick = () => setStatus("sold");
  $("#mlh-next").onclick = nextDraft;
  $("#mlh-export").onclick = exportCSV;
  $("#mlh-backup-now").onclick = exportCSV;
  $("#mlh-tpl").onclick = () => openTemplates(render);

  // Facebook is a single-page app: show the panel only on Marketplace pages.
  function sync() {
    const on = location.pathname.startsWith("/marketplace");
    if (on && !panel.isConnected) document.body.appendChild(panel);
    if (on) updateLinkBox();
    if (!on && panel.isConnected) { panel.remove(); document.getElementById("mlh-backdrop")?.remove(); }
  }

  load().then(loadSavedPhotos).then(() => {
    const firstDraft = rows.findIndex(r => !["listed", "sold"].includes((get(r, "status") || "draft").toLowerCase()));
    current = firstDraft >= 0 ? firstDraft : rows.length ? 0 : -1;
    render();
    sync();
    setInterval(sync, 1000);
    // the manager page changed the list: reload it, keeping the same item selected
    watchStorage(() => {
      const i = rows.findIndex(r => rowKey(r) === currentKey);
      current = i >= 0 ? i : Math.min(current, rows.length - 1);
      render();
    });
  });
})();
