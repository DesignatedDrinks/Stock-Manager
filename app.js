const API_BASE = "https://script.google.com/macros/s/AKfycbwpTNVpMsCLTFf54yKB4MkdMqiFvB_Sbn65p5u4j0rwLrJY1I-P5BvboY6kaNP7jjYd4A/exec";

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

function roundToHalf(x){
  return Math.round(x * 2) / 2;
}

// robust parse, tolerates comma
function parseQty(str){
  const s = String(str || "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
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

    setTopStatus(`Loaded ${items.length} • Auto-save ON • .5 allowed`);
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
            <div class="sub">Cases (24-Pack) • 0.5 = 12-pack</div>
          </div>

          <div class="controls">
            <button class="smallBtn" data-a="dec" data-id="${id}">−</button>

            <input
              id="qty-${id}"
              class="qtyInput"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              value="${i.casesQty}"
              placeholder=""
            />

            <button class="smallBtn" data-a="inc" data-id="${id}">+</button>
            <span id="status-${id}" class="status"></span>
          </div>
        </div>
      `;
    }).join("");
}

function setInputValue(id, val){
  document.getElementById(`qty-${id}`).value = String(val);
}

function setStatus(id, msg){
  const el = document.getElementById(`status-${id}`);
  if (el) el.textContent = msg || "";
}

function scheduleSave(id){
  if (saveTimers.has(id)) clearTimeout(saveTimers.get(id));
  setStatus(id, "Typing…");
  const t = setTimeout(() => saveNow(id), 600);
  saveTimers.set(id, t);
}

async function saveNow(id){
  saveTimers.delete(id);

  const title = fromId(id);
  const input = document.getElementById(`qty-${id}`);
  const raw = parseQty(input.value);
  if (!Number.isFinite(raw) || raw < 0){
    setStatus(id, "Invalid");
    return;
  }

  const qty = roundToHalf(raw);

  setStatus(id, "Saving…");

  const body = new URLSearchParams({
    productTitle: title,
    casesQty: String(qty)
  });

  try{
    const res = await fetch(API_BASE, {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body
    });

    const data = await res.json();
    if (data.ok === false) throw new Error();

    // Only snap the UI AFTER save (prevents mid-typing weirdness)
    if (typeof data.newQty !== "undefined") setInputValue(id, data.newQty);

    setStatus(id, "Saved");

    const idx = items.findIndex(x => x.productTitle === title);
    if (idx !== -1) items[idx].casesQty = Number(data.newQty ?? qty);

  } catch {
    setStatus(id, "Failed");
  }
}

function step(id, delta){
  const input = document.getElementById(`qty-${id}`);
  const cur = parseQty(input.value);
  const base = Number.isFinite(cur) ? cur : 0;
  const next = Math.max(0, roundToHalf(base + delta));
  setInputValue(id, next);
  scheduleSave(id);
}

refreshBtn.onclick = loadInventory;
searchEl.oninput = render;

// +/- clicks
listEl.onclick = e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  const a = btn.dataset.a;
  if (a === "dec") step(id, -0.5);
  if (a === "inc") step(id, 0.5);
};

// ✅ Make typing painless: tap field selects all; if it's 0, clear it
listEl.addEventListener("focusin", e => {
  const input = e.target.closest(".qtyInput");
  if (!input) return;

  // If it's effectively zero, clear it
  const v = input.value.trim();
  if (v === "0" || v === "0.0" || v === "0.00") input.value = "";

  // Select all so next key replaces
  setTimeout(() => {
    try { input.select(); } catch(_){}
  }, 0);
});

// Auto-save while typing (does NOT rewrite the field)
listEl.addEventListener("input", e => {
  const input = e.target.closest(".qtyInput");
  if (!input) return;
  const id = input.id.replace("qty-","");
  scheduleSave(id);
});

// Save immediately when leaving field
listEl.addEventListener("blur", e => {
  const input = e.target.closest(".qtyInput");
  if (!input) return;
  const id = input.id.replace("qty-","");

  if (saveTimers.has(id)){
    clearTimeout(saveTimers.get(id));
    saveTimers.delete(id);
  }

  // If they left it blank, treat as 0
  if (input.value.trim() === "") input.value = "0";

  saveNow(id);
}, true);

loadInventory();
