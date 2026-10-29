// ICONIC admin dashboard: enquiries, status, quotations.
// Sab events event delegation se lagte hain (CSP mein inline onclick block hota hai).
const STATUSES = ["New", "Processing", "Quoted", "Completed", "Closed"];
let all = [];
let selected = null;
let busy = false;

const $ = id => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function flash(msg, isError = false) {
  const n = $("notice");
  if (!n) return;
  n.textContent = msg;
  n.className = isError ? "err" : "";
}

// Ek hi jagah se API call: 401 par login par bhejta hai, network error ko readable message deta hai.
async function api(url, opt = {}) {
  let r;
  try {
    r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opt });
  } catch {
    return { ok: false, message: "Network error. Check your connection and try again." };
  }
  if (r.status === 401) {
    location.replace("/login.html?admin=1");
    return null;
  }
  const d = await r.json().catch(() => ({ ok: false, message: "Unexpected server response." }));
  if (!r.ok && !d.message) d.message = "Request failed. Please try again.";
  return d;
}

async function init() {
  const me = await api("/api/auth/me");
  if (!me) return;
  if (!me.ok) return location.replace("/login.html?admin=1");
  if (me.user.role !== "admin") return location.replace("/account.html");
  await refresh();
}

async function refresh() {
  await Promise.all([loadStats(), loadEnquiries()]);
}

async function loadStats() {
  const s = await api("/api/admin/stats");
  if (!s?.ok) return;
  const cards = [["Total", "total"], ["New", "new"], ["Processing", "processing"], ["Quoted", "quoted"], ["Completed", "completed"]];
  $("stats").innerHTML = cards.map(([label, k]) =>
    `<div class="stat"><b>${Number(s.stats[k] || 0)}</b><span>${label}</span></div>`).join("");
}

async function loadEnquiries() {
  const status = $("filter")?.value || "";
  const d = await api("/api/enquiries" + (status ? `?status=${encodeURIComponent(status)}` : ""));
  if (!d) return;
  if (!d.ok) return flash(d.message || "Could not load enquiries.", true);
  all = d.enquiries || [];
  if (selected) selected = all.find(x => x.id === selected.id) || selected;
  renderEnquiries();
}

function renderEnquiries() {
  $("enquiries").innerHTML = all.length ? all.map(e => `
    <article class="enq${selected && selected.id === e.id ? " is-active" : ""}" data-enq="${esc(e.id)}" tabindex="0"
      aria-label="Open enquiry ${esc(e.reference)} from ${esc(e.name)}">
      <div class="enq-main">
        <b>${esc(e.reference)}</b>
        <span class="enq-name">${esc(e.name)}${e.company ? " · " + esc(e.company) : ""}</span>
        <span class="enq-meta">${esc(e.service)} · ${esc(e.vessel || "Vessel not given")} · ${esc(e.port || "Port not given")}</span>
      </div>
      <div class="enq-side">
        ${e.quote_id ? `<a class="pill pill-ok" href="${API}/api/quotes/${esc(e.quote_id)}/pdf" target="_blank" rel="noopener">PDF ${esc(e.quote_number)}</a>` : ""}
        <label class="sr-only" for="st-${esc(e.id)}">Status for ${esc(e.reference)}</label>
        <select id="st-${esc(e.id)}" data-status="${esc(e.id)}">
          ${STATUSES.map(x => `<option${x === e.status ? " selected" : ""}>${x}</option>`).join("")}
        </select>
      </div>
    </article>`).join("") : `<p class="empty">No enquiries here yet.</p>`;
}

function selectEnq(id) {
  selected = all.find(x => x.id === id);
  if (!selected) return;
  renderEnquiries();
  $("quoteBox").innerHTML = `
    <div class="q-head">
      <div>
        <p class="eyebrow">ENQUIRY</p>
        <h3>${esc(selected.reference)}</h3>
        <p class="q-sub">${esc(selected.name)}${selected.company ? " · " + esc(selected.company) : ""} · ${esc(selected.vessel || "Vessel not given")}</p>
      </div>
      ${selected.quote_number ? `<span class="pill pill-ok">Quote ${esc(selected.quote_number)} issued</span>` : ""}
    </div>
    <form id="quoteForm" novalidate>
      <fieldset class="q-items">
        <legend>Items</legend>
        <div id="items"></div>
        <button type="button" class="btn outline" data-act="add">+ Add item</button>
      </fieldset>
      <div class="row">
        <div class="field"><label for="tax">Tax (%)</label><input id="tax" type="number" value="0" min="0" max="100" step="0.01" inputmode="decimal"></div>
        <div class="field"><label for="valid">Valid until</label><input id="valid" type="date"></div>
      </div>
      <div class="field"><label for="notes">Notes for customer</label><textarea id="notes" rows="3"></textarea></div>
      <div class="q-total"><span>Total (incl. tax)</span><b id="qTotal" aria-live="polite">INR 0.00</b></div>
      <button class="btn primary" type="submit" id="createBtn">Create quotation &amp; email PDF</button>
      <p id="qmsg" role="status" aria-live="polite"></p>
    </form>`;
  addItem();
  recalc();
}

function addItem() {
  const row = document.createElement("div");
  row.className = "quote-item";
  row.innerHTML = `
    <input class="desc" placeholder="Item description" aria-label="Item description">
    <input class="qty" type="number" value="1" min="1" step="1" inputmode="numeric" aria-label="Quantity">
    <input class="price" type="number" value="0" min="0" step="0.01" inputmode="decimal" aria-label="Unit price (INR)">
    <button type="button" class="icon-btn" data-act="remove" aria-label="Remove item">×</button>`;
  $("items").appendChild(row);
  row.querySelector(".desc").focus();
}

function recalc() {
  const rows = document.querySelectorAll(".quote-item");
  let sub = 0;
  rows.forEach(r => { sub += (Number(r.querySelector(".qty").value) || 0) * (Number(r.querySelector(".price").value) || 0); });
  const rate = Math.max(0, Math.min(100, Number($("tax")?.value) || 0));
  const total = sub + sub * rate / 100;
  if ($("qTotal")) $("qTotal").textContent = `INR ${total.toFixed(2)}`;
}

function say(msg, isError = false) {
  const q = $("qmsg");
  if (!q) return;
  q.textContent = msg;
  q.className = isError ? "err" : "ok";
}

async function createQuote() {
  if (!selected || busy) return;
  const rows = [...document.querySelectorAll(".quote-item")].map(x => ({
    description: x.querySelector(".desc").value.trim(),
    qty: x.querySelector(".qty").value,
    unit_price: x.querySelector(".price").value
  })).filter(r => r.description);

  if (!rows.length) return say("Add at least one item with a description.", true);
  if (rows.some(r => !(Number(r.qty) > 0))) return say("Quantity must be at least 1.", true);

  busy = true;
  const btn = $("createBtn");
  btn.disabled = true;
  btn.textContent = "Creating…";
  say("Creating quotation…");

  const d = await api("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      enquiry_id: selected.id,
      items: rows,
      tax_rate: $("tax").value,
      valid_until: $("valid").value,
      notes: $("notes").value,
      currency: "INR"
    })
  });

  busy = false;
  btn.disabled = false;
  btn.textContent = "Create quotation & email PDF";
  if (!d) return;
  if (!d.ok) return say(d.message || "Could not create quotation.", true);

  const id = selected.id;
  await refresh();
  selectEnq(id);
  say(`✓ Quotation ${d.quote.quote_number} created. PDF is being emailed to the customer.`);
}

async function setStatus(id, status) {
  const d = await api(`/api/enquiries/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
  if (!d?.ok) flash(d?.message || "Status could not be updated.", true);
  else flash(`Status updated to ${status}.`);
  await refresh();
}

async function logout() {
  try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
  location.replace("/login.html");
}

// Clicks
document.addEventListener("click", e => {
  if (e.target.closest("#logoutBtn")) return logout();

  const act = e.target.closest("[data-act]");
  if (act) {
    e.preventDefault();
    if (act.dataset.act === "add") addItem();
    if (act.dataset.act === "remove") { act.closest(".quote-item").remove(); recalc(); }
    return;
  }

  // Enquiry card: link/select/button par click ko card select na kare
  const card = e.target.closest("[data-enq]");
  if (card && !e.target.closest("a, select, button, label")) selectEnq(card.dataset.enq);
});

// Keyboard: card par Enter/Space se open
document.addEventListener("keydown", e => {
  const card = e.target.closest?.("[data-enq]");
  if (card && (e.key === "Enter" || e.key === " ") && e.target === card) {
    e.preventDefault();
    selectEnq(card.dataset.enq);
  }
});

// Inputs
document.addEventListener("input", e => {
  if (e.target.closest("#items") || e.target.id === "tax") recalc();
});
document.addEventListener("change", e => {
  const s = e.target.closest("select[data-status]");
  if (s) return setStatus(s.dataset.status, s.value);
  if (e.target.id === "filter") loadEnquiries();
});
document.addEventListener("submit", e => {
  if (e.target.id === "quoteForm") { e.preventDefault(); createQuote(); }
});

init();
