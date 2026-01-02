const API_BASE = "https://script.google.com/macros/s/AKfycbwOP9tPEKxKbJj8Dy6PZbV7Jne3Yjgw2lU8uhfazSdVC4NxyHaLeJ8Tr27LaWh71Dy4TQ/exec";


// DOM
const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const refreshBtn = document.getElementById("refreshBtn");
const topStatus = document.getElementById("topStatus");

let items = [];

// helpers
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

function setRowStatus(id, msg, type){
  const el = document.getElementById(`status-${id}`);
  if (!el) return;
  el.textContent = msg || "";
  el.className = "status " + (type || "");
}

// load
async function loadInventory(){
  refreshBtn.disabled = true;
  setTopStatus("Loading…");

  try {
    const res = await fetch(API_BASE);
    const data = await res.json();

    if (data.ok === false) throw new Error(data.error);

    items = data.items.map(i => ({
      productTitle: String(i.productTitle).trim(),
      imageUrl: String(i.imageUrl || "").trim(),
      casesQty: Number(i.casesQty || 0)
    }));

    setTopStatus(`Loaded ${items.length}`);
    render();
  } catch (e){
    setTopStatus("Load failed");
  } finally {
    refreshBtn.disabled = false;
  }
}

// render
function render(){
  const q = searchEl.value.toLowerCase();

  listEl.innerHTML = items
    .filter(i => i.productTitle.toLowerCase().includes(q))
    .map(i => {
      const id = toId(i.productTitle);
      return `
        <div class="row">
          <img class="canImg" src="${esc(i.imageUrl)}" />

          <div>
            <div class="title">${esc(i.productTitle)}</div>
            <div class="sub">Cases</div>
          </div>

          <div class="controls">
            <button data-a="dec" data-id="${id}">−</button>
            <input id="qty-${id}" class="qtyInput" type="number" min="0" value="${i.casesQty}" />
            <button data-a="inc" data-id="${id}">+</button>
            <button data-a="save" data-id="${id}">Save</button>
            <span id="status-${id}" class="status"></span>
          </div>
        </div>
      `;
    }).join("");
}

// actions
function step(id, delta){
  const input = document.getElementById(`qty-${id}`);
  input.value = Math.max(0, Number(input.value) + delta);
}

async function save(id){
  const title = fromId(id);
  const input = document.getElementById(`qty-${id}`);
  const qty = Number(input.value);

  if (!Number.isFinite(qty) || qty < 0){
    setRowStatus(id, "Invalid", "bad");
    return;
  }

  setRowStatus(id, "Saving…");

  try {
    // ✅ FORM POST (NO CORS)
    const body = new URLSearchParams({
      productTitle: title,
      casesQty: String(Math.round(qty))
    });

    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const data = await res.json();
    if (data.ok === false) throw new Error(data.error);

    const item = items.find(i => i.productTitle === title);
    if (item) item.casesQty = Math.round(qty);

    setRowStatus(id, "Saved", "ok");
  } catch {
    setRowStatus(id, "Save failed", "bad");
  }
}

// events
refreshBtn.onclick = loadInventory;
searchEl.oninput = render;

listEl.onclick = e => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.a;

  if (action === "dec") step(id, -1);
  if (action === "inc") step(id, 1);
  if (action === "save") save(id);
};

// boot
loadInventory();
