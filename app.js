const API_BASE = "https://script.google.com/macros/s/AKfycbwOP9tPEKxKbJj8Dy6PZbV7Jne3Yjgw2lU8uhfazSdVC4NxyHaLeJ8Tr27LaWh71Dy4TQ/exec";

const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const refreshBtn = document.getElementById("refreshBtn");
const topStatus = document.getElementById("topStatus");

let items = [];
const saveTimers = new Map(); // id -> timeout

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

// rounds to nearest 0.5 (12-pack)
function roundToHalf(x){
  return Math.round(x * 2) / 2;
}

async function loadInventory(){
  refreshBtn.disabled = true;
  setTopStatus("Loading…");

  try{
    const res = await fetch(API_BASE);
    const data = await res.json();
    if (data.ok === false) throw new Error(data.error);

    items = data.items.map(i => ({
      productTitle: String(i.productTitle).trim(),
      imageUrl: String(i.imageUrl || "").trim(),
      casesQty: Number(i.casesQty || 0)
    }));

    setTopStatus(`Loaded ${items.length} • Auto-save ON`);
    render();
  } catch {
    setTopStatus("Load failed");
  } finally {
    refreshBtn.disabled = false;
  }
}

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
            <div class="sub">Cases (24-Pack) • .5 = 12-pack</div>
          </div>

          <div class="controls">
            <button class="smallBtn" data-a="dec" data-id="${id}">−</button>
            <input
              id="qty-${id}"
              class="qtyInput"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.5"
              value="${i.casesQty}"
            />
            <button class="smallBtn" data-a="inc" data-id="${id}">+</button>
            <span id="status-${id}" class="status"></span>
          </div>
        </div>
      `;
    }).join("");
}

function step(id, delta){
  const input = document.getElementById(`qty-${id}`);
  const next = Number(input.value) + delta;
  input.value = Math.max(0, roundToHalf(next));
  scheduleSave(id);
}

function scheduleSave(id){
  if (saveTimers.has(id)){
    clearTimeout(saveTimers.get(id));
  }

  const statusEl = document.getElementById(`status-${id}`);
  statusEl.textContent = "Typing…";

  const t = setTimeout(() => saveNow(id), 600);
  saveTimers.set(id, t);
}

async function saveNow(id){
  saveTimers.delete(id);

  const title = fromId(id);
  const raw = Number(document.getElementById(`qty-${id}`).value);
  const statusEl = document.getElementById(`status-${id}`);

  if (!Number.isFinite(raw) || raw < 0){
    statusEl.textContent = "Invalid";
    return;
  }

  const qty = roundToHalf(raw);

  // snap UI to nearest .5 so it never drifts
  document.getElementById(`qty-${id}`).value = qty;

  statusEl.textContent = "Saving…";

  const body = new URLSearchParams({
    productTitle: title,
    casesQty: String(qty) // keep decimals
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

    // keep local state in sync
    const idx = items.findIndex(x => x.productTitle === title);
    if (idx !== -1) items[idx].casesQty = qty;

  } catch {
    statusEl.textContent = "Failed";
  }
}

refreshBtn.onclick = loadInventory;
searchEl.oninput = render;

// +/- clicks (step by 0.5)
listEl.onclick = e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  const a = btn.dataset.a;
  if (a === "dec") step(id, -0.5);
  if (a === "inc") step(id, 0.5);
};

// Auto-save while typing
listEl.addEventListener("input", e => {
  const input = e.target.closest(".qtyInput");
  if (!input) return;
  const id = input.id.replace("qty-","");
  scheduleSave(id);
});

// Save immediately when leaving field
listEl.addEventListener("change", e => {
  const input = e.target.closest(".qtyInput");
  if (!input) return;
  const id = input.id.replace("qty-","");
  if (saveTimers.has(id)){
    clearTimeout(saveTimers.get(id));
    saveTimers.delete(id);
  }
  saveNow(id);
});

loadInventory();
