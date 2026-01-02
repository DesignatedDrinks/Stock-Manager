// =======================
// CONFIG
// =======================
const API_BASE = "https://script.google.com/macros/s/AKfycbzW2E0yCpAKf3B8U1XsXtCymWwjmTmlsMWKOYA27XMLiA2ad95ZWAkgI3DckgQHsKstZg/exec";

// =======================
// DOM
// =======================
const grid = document.getElementById("grid");
const search = document.getElementById("search");
const refreshBtn = document.getElementById("refreshBtn");
const hideZeroBtn = document.getElementById("hideZeroBtn");
const topStatus = document.getElementById("topStatus");

// =======================
// STATE
// =======================
let items = [];
let hideZero = false;

// =======================
// HELPERS
// =======================
function esc(str){
  return String(str ?? "").replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])
  );
}

function setTopStatus(msg){
  topStatus.textContent = msg || "";
}

function normalizeResponse(data){
  // Supports either { ok:true, items:[...] } or a raw array
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return null;
}

// =======================
// LOAD
// =======================
async function loadInventory(){
  refreshBtn.disabled = true;
  setTopStatus("Loading…");

  try{
    const res = await fetch(API_BASE, { method: "GET" });
    const data = await res.json();

    if (data && data.ok === false) {
      throw new Error(data.error || "Backend returned ok:false");
    }

    const list = normalizeResponse(data);
    if (!list) throw new Error("Bad response format (expected items array)");

    items = list.map(row => ({
      productTitle: String(row.productTitle ?? "").trim(),
      imageUrl: String(row.imageUrl ?? "").trim(),
      casesQty: Number(row.casesQty ?? 0) || 0
    })).filter(x => x.productTitle.length > 0);

    setTopStatus(`Loaded ${items.length}`);
    render();
  } catch(e){
    setTopStatus(`Load failed: ${e.message || e}`);
  } finally {
    refreshBtn.disabled = false;
  }
}

// =======================
// RENDER
// =======================
function render(){
  const q = search.value.trim().toLowerCase();

  let filtered = !q
    ? items
    : items.filter(i => i.productTitle.toLowerCase().includes(q));

  if (hideZero) filtered = filtered.filter(i => (Number(i.casesQty) || 0) !== 0);

  grid.innerHTML = filtered.map(i => {
    const title = i.productTitle;               // raw key (do NOT escape for comparisons)
    const titleEsc = esc(i.productTitle);       // for HTML
    const imgEsc = esc(i.imageUrl);
    const qty = Number(i.casesQty ?? 0) || 0;

    // Use a safe DOM id by base64 encoding the title (handles slashes, quotes, etc.)
    const id = btoa(unescape(encodeURIComponent(title))).replace(/=+$/,"");

    const ghost = qty === 0 ? "ghost" : "";

    return `
      <div class="card ${ghost}" data-key="${titleEsc}">
        <img class="img" src="${imgEsc}" alt="${titleEsc}"
          onerror="this.closest('.card').classList.add('ghost');" />

        <div class="title">${titleEsc}</div>
        <div class="pill">Cases</div>

        <div class="qtyRow">
          <button type="button" data-action="dec" data-id="${id}">-</button>
          <input class="qty" id="qty-${id}" type="number" min="0" step="1" value="${qty}" />
          <button type="button" data-action="inc" data-id="${id}">+</button>
          <button type="button" data-action="save" data-id="${id}">Save</button>
        </div>

        <div class="statusLine" id="status-${id}"></div>
      </div>
    `;
  }).join("");

  // Wire buttons via event delegation (more robust than inline onclick)
}

// =======================
// ACTIONS
// =======================
function stepQtyById(id, delta){
  const input = document.getElementById(`qty-${id}`);
  const v = Math.max(0, Math.round((Number(input.value) || 0) + delta));
  input.value = v;
}

async function saveQtyById(id){
  const statusEl = document.getElementById(`status-${id}`);
  const input = document.getElementById(`qty-${id}`);
  const casesQty = Number(input.value);

  if (!Number.isFinite(casesQty) || casesQty < 0){
    statusEl.textContent = "casesQty must be a number ≥ 0";
    statusEl.className = "statusLine bad";
    return;
  }

  // Find item by reversing the base64 id
  const title = decodeURIComponent(escape(atob(id)));

  const item = items.find(x => x.productTitle === title);
  if (!item){
    statusEl.textContent = "Key mismatch: productTitle not found";
    statusEl.className = "statusLine bad";
    return;
  }

  statusEl.textContent = "Saving…";
  statusEl.className = "statusLine";

  try{
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productTitle: item.productTitle,
        casesQty: Math.round(casesQty)
      })
    });

    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.error || "Save failed");

    item.casesQty = Math.round(casesQty);

    statusEl.textContent = "Saved";
    statusEl.className = "statusLine ok";

    // Re-render so zero-qty styling updates
    render();
  } catch(e){
    statusEl.textContent = e.message || String(e);
    statusEl.className = "statusLine bad";
  }
}

// =======================
// EVENTS
// =======================
refreshBtn.addEventListener("click", loadInventory);

search.addEventListener("input", render);

hideZeroBtn.addEventListener("click", () => {
  hideZero = !hideZero;
  hideZeroBtn.textContent = hideZero ? "Show zero" : "Hide zero";
  render();
});

// Button clicks (event delegation)
grid.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.getAttribute("data-action");
  const id = btn.getAttribute("data-id");
  if (!action || !id) return;

  if (action === "dec") stepQtyById(id, -1);
  if (action === "inc") stepQtyById(id, 1);
  if (action === "save") saveQtyById(id);
});

// =======================
// BOOT
// =======================
loadInventory();
