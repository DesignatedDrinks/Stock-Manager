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
        <div class="row" data-row="${id}">
          <img class="canImg" src="${esc(i.imageUrl)}" alt="" />

          <div>
            <div class="title">${esc(i.productTitle)}</div>
            <div class="sub">Cases (24-Pack)</div>
          </div>

          <div class="controls">
            <button class="smallBtn" data-a="dec" data-id="${id}">−</button>
            <input
              id="qty-${id}"
              class="qtyInput"
              type="number"
              inputmode="numeric"
              min="0"
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
  input.value = Math.max(0, Number(input.value) + delta);
  scheduleSave(id);
}

function scheduleSave(id){
  // clear existing timer
  if (saveTimers.has(id)){
    clearTimeout(saveTimers.get(id));
  }

  const statusEl = document.getElementById(`status-${id}`);
  statusEl.textContent = "Typing…";
  statusEl.className = "status warn";

  // debounce save
  const t = setTimeout(() => saveNow(id), 600);
  saveTimers.set(id, t);
}

async function saveNow(id){
  saveTimers.delete(id);

  const title = fromId(id);
  const qty = Number(document.getElementById(`qty-${id}`).value);
  const statusEl = document.getElementById(`status-${id}`);

  if (!Number.isFinite(qty) || qty < 0){
    statusEl.textContent = "Invalid";
    statusEl.className = "status bad";
    return;
  }

  statusEl.textContent = "Saving…";
  statusEl.className = "status warn";

  const body = new URLSearchParams({
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

    // keep local items in sync (no refresh needed)
    const idx = items.findIndex(x => x.productTitle === title);
    if (idx !== -1) items[idx].casesQty = Math.round(qty);

  } catch {
    statusEl.textContent = "Failed";
    statusEl.className = "status bad";
  }
}

refreshBtn.onclick = loadInventory;
searchEl.oninput = render;

// Click +/- buttons
listEl.onclick = (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  const a = btn.dataset.a;
  if (a === "dec") step(id, -1);
  if (a === "inc") step(id, 1);
};

// Auto-save on typing
listEl.addEventListener("input", (e) => {
  const input = e.target.closest(".qtyInput");
  if (!input) return;
  const id = input.id.replace("qty-","");
  scheduleSave(id);
});

// Also save immediately when leaving the field
listEl.addEventListener("change", (e) => {
  const input = e.target.closest(".qtyInput");
  if (!input) return;
  const id = input.id.replace("qty-","");
  // if a debounce is pending, force save now
  if (saveTimers.has(id)){
    clearTimeout(saveTimers.get(id));
    saveTimers.delete(id);
  }
  saveNow(id);
});

loadInventory();
