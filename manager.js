// Full-page manager: edit the whole list in a table, import/export CSV, pair photos
// by filename. Shares storage with the Facebook panel; filling still happens there.
// Data, CSV, photo and editor code lives in shared.js.

(() => {
  const $ = s => document.querySelector(s);
  const statusOf = r => (get(r, "status") || "draft").toLowerCase();
  const say = t => { $("#msg").textContent = t; };

  function renderSummary() {
    const drafts = rows.filter(r => statusOf(r) === "draft");
    const bare = drafts.filter(r => !photoList(r).length).length;
    $("#summary").innerHTML =
      `${rows.length} item${rows.length === 1 ? "" : "s"} · ${drafts.length} draft${drafts.length === 1 ? "" : "s"} · ${uniqueFiles().length} photos loaded` +
      (bare ? ` · <span class="warn">${bare} draft${bare === 1 ? "" : "s"} without photos</span>` : "");
    const due = backupDue();
    $("#backup").hidden = !due;
    if (due) $("#backup-msg").textContent = `⚠ ${due}. Your list only lives in this browser — export a backup.`;
  }

  // One editable cell. Saves on change (not on every keystroke).
  function inputCell(r, key, cls, clean = v => v.trim()) {
    const td = document.createElement("td");
    td.className = cls;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = get(r, key);
    inp.onchange = async () => {
      set(r, key, clean(inp.value));
      inp.value = get(r, key);
      await save();
      renderSummary();
    };
    td.appendChild(inp);
    return td;
  }

  function selectCell(r, key, cls, options, onChange) {
    const td = document.createElement("td");
    td.className = cls;
    const sel = document.createElement("select");
    const cur = key === "status" ? statusOf(r) : get(r, key);
    for (const o of [...new Set(["", ...options, cur])]) {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o || "—";
      sel.appendChild(opt);
    }
    sel.value = cur;
    sel.onchange = async () => {
      set(r, key, sel.value);
      if (onChange) onChange(sel.value);
      await save();
      renderTable();
      renderSummary();
    };
    td.appendChild(sel);
    return td;
  }

  function renderTable() {
    const body = $("#grid tbody");
    body.innerHTML = "";
    const text = $("#search").value.trim().toLowerCase();
    const want = $("#statusfilter").value;
    let shown = 0;
    for (const r of rows) {
      if (want && statusOf(r) !== want) continue;
      if (text && ![get(r, "title"), get(r, "category"), get(r, "description"), get(r, "id")].some(v => v.toLowerCase().includes(text))) continue;
      shown++;
      const tr = document.createElement("tr");
      if (statusOf(r) === "sold") tr.className = "sold";

      const id = document.createElement("td");
      id.className = "id";
      id.textContent = get(r, "id");
      tr.appendChild(id);
      tr.appendChild(inputCell(r, "title", "title"));
      tr.appendChild(inputCell(r, "price", "price", v => v.replace(/[£,\s]/g, "")));
      tr.appendChild(selectCell(r, "condition", "cond", CONDITIONS));
      tr.appendChild(inputCell(r, "category", "cat"));
      tr.appendChild(selectCell(r, "status", "stat", ["draft", "listed", "sold"], v => {
        if (v === "listed" && !get(r, "listed")) set(r, "listed", new Date().toISOString().slice(0, 10));
      }));

      const listed = document.createElement("td");
      listed.className = "listed muted";
      const age = ageDays(get(r, "listed"));
      listed.textContent = get(r, "listed");
      if (statusOf(r) === "listed" && age != null && age >= RENEW_DAYS) {
        const f = document.createElement("span");
        f.className = "warn";
        f.textContent = ` ⟳ renew (${age}d)`;
        listed.appendChild(f);
      }
      tr.appendChild(listed);

      const ph = document.createElement("td");
      ph.className = "ph";
      const names = photoList(r);
      const first = names.length && findPhoto(names[0]);
      if (first) { const img = document.createElement("img"); thumbInto(img, first); img.alt = ""; ph.appendChild(img); }
      const n = document.createElement("span");
      n.textContent = names.length ? String(names.length) : "none";
      if (!names.length && statusOf(r) === "draft") n.className = "warn";
      ph.appendChild(n);
      tr.appendChild(ph);

      const fb = document.createElement("td");
      fb.className = "fb";
      if (isWebUrl(get(r, "fb_url"))) {
        const a = document.createElement("a");
        a.href = get(r, "fb_url"); a.target = "_blank"; a.rel = "noopener"; a.textContent = "↗"; a.title = "Open the linked Facebook listing";
        fb.appendChild(a);
      }
      tr.appendChild(fb);

      const act = document.createElement("td");
      act.className = "act";
      const edit = document.createElement("button");
      edit.textContent = "Edit";
      edit.onclick = () => openEditor(r, afterEdit);
      act.appendChild(edit);
      tr.appendChild(act);
      body.appendChild(tr);
    }
    $("#empty").hidden = rows.length > 0;
    $("#grid").hidden = rows.length === 0;
    if (rows.length && !shown) say("No items match the filter.");
  }

  function afterEdit() {
    renderTable();
    renderSummary();
  }

  // ---------- actions ----------
  $("#new").onclick = () => openEditor(null, afterEdit);
  $("#tpl").onclick = () => openTemplates(renderSummary);
  $("#search").oninput = renderTable;
  $("#statusfilter").onchange = renderTable;

  $("#csv-btn").onclick = () => $("#csv").click();
  $("#csv").onchange = async e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const { added, updated } = mergeCSV(await f.text());
    await save();
    renderTable();
    renderSummary();
    say(`Imported: ${added} new, ${updated} updated.`);
  };

  async function exportCSV() {
    await downloadCSV();
    renderSummary();
    say("Exported.");
  }
  $("#export").onclick = exportCSV;
  $("#backup-now").onclick = exportCSV;

  $("#dir-btn").onclick = () => $("#dir").click();
  $("#dir").onchange = e => {
    const n = addPhotoFiles(e.target.files, true);
    e.target.value = "";
    renderTable();
    renderSummary();
    say(`${n} photos loaded. Use Auto-pair drafts, or open an item to pick photos by hand.`);
  };

  // Pair every draft that has no photos yet with files named after its id or title,
  // skipping files another item already uses.
  $("#pairall").onclick = async () => {
    if (!uniqueFiles().length) return say("Load a photos folder first.");
    const drafts = rows.filter(r => statusOf(r) === "draft" && !photoList(r).length);
    let paired = 0;
    for (const r of drafts) {
      const used = usedPhotoNames(r);
      const names = autoPairNames(get(r, "id"), get(r, "title")).filter(n => !used.has(n.toLowerCase()));
      if (!names.length) continue;
      set(r, "photos", names.join(";"));
      paired++;
    }
    if (paired) await save();
    renderTable();
    renderSummary();
    say(`Paired photos for ${paired} of ${drafts.length} draft${drafts.length === 1 ? "" : "s"} without photos.` +
      (paired < drafts.length ? " Name photos like “<id>-1.jpg” to pair the rest." : ""));
  };

  // the Facebook panel changed the list: pick it up
  load().then(() => {
    renderTable();
    renderSummary();
    watchStorage(() => { renderTable(); renderSummary(); });
  });
})();
