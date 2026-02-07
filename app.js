const API_BASE = "https://script.google.com/macros/s/AKfycbwOP9tPEKxKbJj8Dy6PZbV7Jne3Yjgw2lU8uhfazSdVC4NxyHaLeJ8Tr27LaWh71Dy4TQ/exec";

const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const refreshBtn = document.getElementById("refreshBtn");
const topStatus = document.getElementById("topStatus");
const countModeToggle = document.getElementById("countModeToggle");
const progressBar = document.getElementById("progressBar");

const newSessionBtn = document.getElementById("newSessionBtn");
const commitBtn = document.getElementById("commitBtn");
const clearLocalBtn = document.getElementById("clearLocalBtn");

let items = [];
let uiFilter = "all";

// ---------- Local session state ----------
const LS_KEY = "dd_inventory_session_v1";

function loadSession(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSession(sess){
  localStorage.setItem(LS_KEY, JSON.stringify(sess));
}

function ensureSession(){
  let sess = loadSession();
  if (!sess || !sess.id || !sess.counts) {
    sess = { id: String(Date.now()), createdAt: new Date().toISOString(), counts: {} };
    saveSession(sess);
  }
  return sess;
}

function clearSession(){
  localStorage.removeItem(LS_KEY);
}

// counts map: { [productTitle]: { countedQty:number, counted:boolean, ts:string } }
function setCount(title, qty, counted=true){
  const sess = ensureSession();
  sess.counts[title] = { countedQty: qty, counted: !!counted, ts: new Date().toISOString() };
  saveSession(sess);
}

function getCount(title){
  const sess = ensureSession();
  return sess.counts[title] || null;
}

// ---------- Helpers ----------
function esc(str){
  return String(str ?? "").replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])
  );
}

function toId(title){
  return btoa(unescape(encodeURIComponent(title))).replace(/=+$/,"");
}

function fromId(id){
  return decodeURIComponent(escape(atob(id)));
}

function setTopStatus(msg){
  topStatus.textContent = msg || "";
}

// ---------- Load ----------
async function loadInventory(){
  refreshBtn.disabled = true;
  setTopStatus("Loading…");

  try{
    const res = await fetch(API_BASE);
    const data = await res.json();
    if (data.ok === false) throw new Error(data.error);

    // Optional column: location (for aisle ordering)
    items = data.items.map(i => ({
      productTitle: String(i.productTitle).trim(),
      imageUrl: String(i.imageUrl || "").trim(),
      casesQty: Number(i.casesQty || 0),
      location: String(i.location || "").trim()
    }));

    setTopStatus(`Loaded ${items.length}`);
    render();
  } catch (e){
    setTopStatus("Load failed");
  } finally {
    refreshBtn.disabled = false;
  }
}

// ---------- Sorting ----------
function sortItems(list){
  // If location is present on most rows, sort by it first (warehouse flow)
  const withLoc = list.filter(x => x.location).length;
  if (withLoc >= Math.max(5, Math.floor(list.length * 0.3))) {
    return [...list].sort((a,b) => (a.location || "ZZZ").localeCompare(b.location || "ZZZ") || a.productTitle.localeCompare(b.productTitle));
  }
  // fallback: title
  return [...list].sort((a,b) => a.productTitle.localeCompare(b.productTitle));
}

// ---------- Progress ----------
function computeProgress(){
  const sess = ensureSession();
  const total = items.length;
  let counted = 0;
  for (const it of items){
    const c = sess.counts[it.productTitle];
    if (c && c.counted) counted++;
  }
  const pct = total ? Math.round((counted/total)*100) : 0;
  progressBar.style.width = `${pct}%`;
  setTopStatus(`Loaded ${items.length} • Counted ${counted}/${total} (${pct}%)`);
}

// ---------- Render ----------
function render(){
  const q = searchEl.value.toLowerCase();
  const sess = ensureSession();

  let list = items.filter(i => i.productTitle.toLowerCase().includes(q));

  // Apply filter pills
  list = list.filter(i => {
    const c = sess.counts[i.productTitle];
    const counted = !!(c && c.counted);
    const mismatch = counted && Number.isFinite(c.countedQty) && (Number(c.countedQty) !== Number(i.casesQty));

    if (uiFilter === "all") return true;
    if (uiFilter === "uncounted") return !counted;
    if (uiFilter === "counted") return counted;
    if (uiFilter === "mismatch") return mismatch;
    return true;
  });

  list = sortItems(list);

  const countMode = !!countModeToggle.checked;

  listEl.innerHTML = list.map(i => {
    const id = toId(i.productTitle);
    const c = sess.counts[i.productTitle];
    const counted = !!(c && c.counted);
    const countedQty = c ? Number(c.countedQty) : null;
    const expected = Number(i.casesQty || 0);

    const mismatch = counted && Number.isFinite(countedQty) && countedQty !== expected;

    const rowClass = [
      "row",
      counted ? "counted" : "",
      mismatch ? "mismatch" : ""
    ].filter(Boolean).join(" ");

    const primaryQty = countMode
      ? (counted ? countedQty : expected) // default to expected but overwritable
      : expected;

    const statusBadge = countMode
      ? (counted ? `<span class="badge ok">COUNTED</span>` : `<span class="badge muted">NOT COUNTED</span>`)
      : `<span class="badge muted">MAINTENANCE</span>`;

    const deltaBadge = (countMode && counted)
      ? (mismatch
          ? `<span class="badge bad">Δ ${countedQty - expected}</span>`
          : `<span class="badge ok">MATCH</span>`)
      : "";

    const locationBadge = i.location ? `<span class="badge warn">${esc(i.location)}</span>` : "";

    return `
      <div class="${rowClass}" data-row-id="${id}">
        <img class="canImg" src="${esc(i.imageUrl)}" alt="" />

        <div>
          <div class="title">${esc(i.productTitle)}</div>
          <div class="sub">Cases (24-Pack)</div>

          <div class="meta">
            ${locationBadge}
            ${statusBadge}
            ${deltaBadge}
          </div>
        </div>

        <div class="controls">
          ${
            countMode
              ? `
                <input
                  id="qty-${id}"
                  class="qtyInput"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  value="${Number.isFinite(primaryQty) ? primaryQty : 0}"
                  data-mode="count"
                />
                <button class="smallBtn" data-a="mark" data-id="${id}">Mark Counted</button>
                <button class="smallBtn" data-a="uncount" data-id="${id}">Undo</button>
                <span id="status-${id}" class="status"></span>
              `
              : `
                <button class="smallBtn" data-a="dec" data-id="${id}">−</button>
                <input id="qty-${id}" class="qtyInput" type="number" min="0" value="${expected}" data-mode="maint" />
                <button class="smallBtn" data-a="inc" data-id="${id}">+</button>
                <button class="smallBtn" data-a="save" data-id="${id}">Save</button>
                <span id="status-${id}" class="status"></span>
              `
          }
        </div>
      </div>
    `;
  }).join("");

  computeProgress();
}

// ---------- Maintenance controls ----------
function step(id, delta){
  const input = document.getElementById(`qty-${id}`);
  input.value = Math.max(0, Number(input.value) + delta);
}

async function saveSingleToSheet(title, qty, statusEl){
  statusEl.textContent = "Saving…";
  statusEl.className = "status warn";

  const body = new URLSearchParams({
    action: "single",
    productTitle: title,
    casesQty: String(Math.round(qty))
  });

  try{
    const res = await fetch(API_BASE, {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body
    });

    const data = await res.json();
    if (data.ok === false) throw new Error();

    statusEl.textContent = "Saved";
    statusEl.className = "status ok";
  } catch {
    statusEl.textContent = "Failed";
    statusEl.className = "status bad";
  }
}

async function save(id){
  const title = fromId(id);
  const qty = Number(document.getElementById(`qty-${id}`).value);
  const statusEl = document.getElementById(`status-${id}`);

  if (!Number.isFinite(qty) || qty < 0){
    statusEl.textContent = "Invalid";
    statusEl.className = "status bad";
    return;
  }
  await saveSingleToSheet(title, qty, statusEl);
  await loadInventory(); // refresh expected values
}

// ---------- Count mode actions ----------
function markCounted(id){
  const title = fromId(id);
  const qty = Number(document.getElementById(`qty-${id}`).value);
  const statusEl = document.getElementById(`status-${id}`);

  if (!Number.isFinite(qty) || qty < 0){
    statusEl.textContent = "Invalid";
    statusEl.className = "status bad";
    return;
  }

  setCount(title, Math.round(qty), true);
  statusEl.textContent = "Counted";
  statusEl.className = "status ok";
  computeProgress();
  // re-render to update badges/mismatch class
  render();
}

function uncount(id){
  const title = fromId(id);
  const sess = ensureSession();
  delete sess.counts[title];
  saveSession(sess);
  render();
}

function focusNextInput(currentId){
  const inputs = [...document.querySelectorAll(".qtyInput")];
  const idx = inputs.findIndex(x => x.id === `qty-${currentId}`);
  if (idx >= 0 && idx < inputs.length - 1){
    inputs[idx + 1].focus();
    inputs[idx + 1].select?.();
  }
}

// Batch commit counted items to sheet (no CORS preflight)
async function commitSession(){
  const sess = ensureSession();
  const payload = [];

  for (const it of items){
    const c = sess.counts[it.productTitle];
    if (c && c.counted){
      payload.push({
        productTitle: it.productTitle,
        casesQty: Math.round(Number(c.countedQty || 0))
      });
    }
  }

  if (!payload.length){
    alert("Nothing counted yet.");
    return;
  }

  commitBtn.disabled = true;
  commitBtn.textContent = "Committing…";

  const body = new URLSearchParams({
    action: "batch",
    payload: JSON.stringify(payload),
    sessionId: sess.id,
    createdAt: sess.createdAt
  });

  try{
    const res = await fetch(API_BASE, {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body
    });

    const data = await res.json();
    if (data.ok === false) throw new Error(data.error);

    alert(`Committed ${data.updated} item(s).`);
    // Optional: keep session but it’s usually better to start clean after a commit
    clearSession();
    ensureSession();
    await loadInventory();
    render();
  } catch (e){
    alert("Commit failed.");
  } finally {
    commitBtn.disabled = false;
    commitBtn.textContent = "Commit Session";
  }
}

// ---------- Events ----------
refreshBtn.onclick = loadInventory;

searchEl.oninput = render;

countModeToggle.onchange = () => {
  render();
};

document.querySelectorAll(".pill").forEach(p => {
  p.onclick = () => {
    document.querySelectorAll(".pill").forEach(x => x.classList.remove("active"));
    p.classList.add("active");
    uiFilter = p.dataset.filter;
    render();
  };
});

listEl.onclick = e => {
  const btn = e.target.closest("button");
  if (!btn) {
    // tapping row focuses input (warehouse flow)
    const row = e.target.closest(".row");
    if (row){
      const id = row.dataset.rowId;
      const input = document.getElementById(`qty-${id}`);
      if (input) { input.focus(); input.select?.(); }
    }
    return;
  }

  const id = btn.dataset.id;
  const a = btn.dataset.a;

  if (a === "dec") step(id, -1);
  if (a === "inc") step(id, 1);
  if (a === "save") save(id);

  if (a === "mark") markCounted(id);
  if (a === "uncount") uncount(id);
};

listEl.addEventListener("keydown", (e) => {
  const input = e.target.closest(".qtyInput");
  if (!input) return;

  // Enter = mark counted (count mode) OR save single (maintenance mode)
  if (e.key === "Enter"){
    const id = input.id.replace("qty-","");
    const mode = input.dataset.mode;

    if (mode === "count"){
      markCounted(id);
      // move to next
      setTimeout(() => focusNextInput(id), 0);
    } else {
      save(id);
      setTimeout(() => focusNextInput(id), 0);
    }
  }
});

// Bottom bar buttons
newSessionBtn.onclick = () => {
  clearSession();
  ensureSession();
  render();
};

commitBtn.onclick = commitSession;

clearLocalBtn.onclick = () => {
  if (confirm("Clear local count state? (Does NOT change the sheet)")){
    clearSession();
    ensureSession();
    render();
  }
};

// Boot
ensureSession();
loadInventory();
