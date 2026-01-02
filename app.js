// ====== CONFIG ======
const API_BASE = "https://script.google.com/macros/s/AKfycbyJmINZoyQD42amB0zCEXFZZanypNzggK2hshgtMHLnejeyIQmhrraZ0ZEZgarqdcMtsg/exec";

// ====== DOM ======
const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const refreshBtn = document.getElementById("refreshBtn");
const topStatus = document.getElementById("topStatus");

let items = [];

function esc(str){
  return String(str ?? "").replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])
  );
}

// stable DOM id from title (handles weird chars)
function toId(title){
  return btoa(unescape(encodeURIComponent(title))).replace(/=+$/,"");
}

function setTopStatus(msg){
  topStatus.textContent = msg || "";
}

function normalizeResponse(data){
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return null;
}

async function loadInventory(){
  refreshBtn.disabled = true;
  setTopStatus("Loading…");

  try{
    const res = await fetch(API_BASE, { method:"GET" });
    const data = await res.json();

    if (data && data.ok === false) throw new Error(data.error || "Backend returned ok:false");

    const list = normalizeResponse(data);
    if (!list) throw new Error("Bad response format");

    items = list.map(r => ({
      productTitle: String(r.productTitle ?? "").trim(),
      imageUrl: String(r.imageUrl ?? "").trim(),
      casesQty: Number(r.casesQty ?? 0) || 0
    })).filter(x => x.productTitle.length > 0);

    setTopStatus(`Loaded ${items.length}`);
    render();
  } catch(e){
    setTopStatus(`Load failed: ${e.message || e}`);
  } finally {
    refreshBtn.disabled = false;
  }
}

function render(){
  const q = searchEl.value.trim().toLowerCase();
  const filtered = !q ? items : items.filter(i => i.productTitle.toLowerCase().includes(q));

  listEl.innerHTML = filtered.map(i => {
    const id = toId(i.productTitle);
    return `
      <div class="row" data-id="${id}">
        <img class="canImg" src="${esc(i.imageUrl)}" alt="${esc(i.productTitle)}"
             onerror="this.style.opacity='0.3';" />

        <div>
          <div class="title">${esc(i.productTitle)}</div>
          <div class="sub">Cases on hand</div>
        </div>

        <div class="controls">
          <button class="smallBtn" data-action="dec" data-id="${id}" type="button">−</button>
          <input class="qtyInput" id="qty-${id}" type="number" min="0" step="1" value="${i.casesQty}" />
          <button class="smallBtn" data-action="inc" data-id="${id}" type="button">+</button>
          <button class="smallBtn" data-action="save" data-id="${id}" type="button">Save</button>
          <span class="status" id="status-${id}"></span>
        </div>
      </div>
    `;
  }).join("");
}

function findTitleById(id){
  // reverse base64 -> title
  return decodeURIComponent(escape(atob(id)));
}

function setRowStatus(id, msg, type){
  const el = document.getElementById(`status-${id}`);
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("ok","bad");
  if (type) el.classList.add(type);
}

function stepQty(id, delta){
  const input = document.getElementById(`qty-${id}`);
  const v = Math.max(0, Math.round((Number(input.value) || 0) + delta));
  input.value = v;
}

async function saveQty(id){
  const title = findTitleById(id);
  const input = document.getElementById(`qty-${id}`);
  const casesQty = Number(input.value);

  if (!Number.isFinite(casesQty) || casesQty < 0){
    setRowStatus(id, "Invalid qty", "bad");
    return;
  }

  // Exact match item
  const item = items.find(x => x.productTitle === title);
  if (!item){
    setRowStatus(id, "Title not found", "bad");
    return;
  }

  setRowStatus(id, "Saving…");

  try{
    const res = await fetch(API_BASE, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ productTitle: item.productTitle, casesQty: Math.round(casesQty) })
    });

    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.error || "Save failed");

    item.casesQty = Math.round(casesQty);
    setRowStatus(id, "Saved", "ok");
  } catch(e){
    setRowStatus(id, e.message || "Save failed", "bad");
  }
}

// Events
refreshBtn.addEventListener("click", loadInventory);
searchEl.addEventListener("input", render);

listEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.getAttribute("data-action");
  const id = btn.getAttribute("data-id");
  if (!action || !id) return;

  if (action === "dec") stepQty(id, -1);
  if (action === "inc") stepQty(id, 1);
  if (action === "save") saveQty(id);
});

// Boot
loadInventory();

