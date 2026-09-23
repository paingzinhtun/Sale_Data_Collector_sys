import {localDate, prettyDate, prettyTime, saleId, mmk, totals, validateItems, wholeNumber, dayCsv} from './core.js';
import {openDb, getDays, getSales, openDay, reopenDay, addSale, voidSale, closeDay, allData, restoreData} from './db.js';

const $ = selector => document.querySelector(selector);
const state = {days:[], current:null, selected:null, sales:[], tab:'sell', voidSequence:null, busy:false};
const fmt = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function notice(message, error = false) {
  const el = $('#notice'); el.textContent = message; el.className = error ? 'notice error' : 'notice'; el.hidden = false;
  clearTimeout(notice.timer); notice.timer = setTimeout(() => { el.hidden = true; }, 8000);
  window.scrollTo({top:0,behavior:'smooth'});
}
async function action(work) {
  if (state.busy) return;
  state.busy = true;
  try { await work(); } catch (error) { notice(error?.message || 'Something went wrong. Try again.', true); }
  finally { state.busy = false; }
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function exportDay(date) {
  const day = state.days.find(d => d.date === date);
  if (!day) throw new Error('Day not found.');
  const sales = await getSales(date);
  download(`shopday-sales-${date}.csv`, dayCsv(day, sales.slice().reverse()), 'text/csv;charset=utf-8');
}

function switchTab(name) {
  state.tab = name;
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.tab === name);
  for (const id of ['sell','daybook','history']) $(`#${id}-panel`).hidden = id !== name;
}

function addItem(initial = {}) {
  if ($('#item-list').children.length >= 50) { notice('One sale can contain up to 50 products.', true); return; }
  const fragment = $('#item-template').content.cloneNode(true);
  const row = fragment.querySelector('.item-row');
  row.querySelector('.product-input').value = initial.product ?? '';
  row.querySelector('.quantity-input').value = initial.quantity ?? 1;
  row.querySelector('.price-input').value = initial.unitPrice ?? '';
  $('#item-list').append(row); numberItems(); updateDraft();
}
function numberItems() {
  [...$('#item-list').children].forEach((row, index) => row.querySelector('.item-number').textContent = String(index + 1).padStart(2,'0'));
  for (const button of document.querySelectorAll('.remove-item')) button.disabled = $('#item-list').children.length === 1;
}
function draftRows() {
  return [...document.querySelectorAll('.item-row')].map(row => ({product:row.querySelector('.product-input').value, quantity:row.querySelector('.quantity-input').value, unitPrice:row.querySelector('.price-input').value}));
}
function updateDraft() {
  let sum = 0;
  for (const row of draftRows()) {
    const q = Number(row.quantity), p = Number(row.unitPrice);
    if (Number.isSafeInteger(q) && Number.isSafeInteger(p) && q >= 0 && p >= 0 && Number.isSafeInteger(q*p)) sum += q*p;
  }
  $('#sale-total').textContent = mmk(sum);
}

function renderBanner() {
  const active = state.current;
  const banner = $('#day-banner');
  if (active) {
    banner.innerHTML = `<div><div class="banner-label">● SHOP OPEN · ${fmt(prettyDate(active.date))}</div><div class="banner-title">Every sale counts.</div><div class="banner-sub">${active.lastSequence} ${active.lastSequence === 1 ? 'sale' : 'sales'} recorded · next ID ${saleId(active.lastSequence+1)}</div></div><div class="banner-actions"><button class="banner-button outline" id="view-day">View daybook</button><button class="banner-button" id="start-close">Close shop →</button></div>`;
    $('#view-day').onclick = () => {state.selected = active.date; switchTab('daybook'); renderDaybook();};
    $('#start-close').onclick = () => showClose();
  } else {
    banner.innerHTML = `<div><div class="banner-label">○ SHOP CLOSED</div><div class="banner-title">Ready for a new day?</div><div class="banner-sub">Open the shop to begin recording today's sales.</div></div><div class="banner-actions"><button class="banner-button" id="start-open">Open shop →</button></div>`;
    $('#start-open').onclick = () => {$('#open-date').value = localDate(); $('#open-dialog').showModal();};
  }
  $('#next-id').textContent = active ? `Next · ${saleId(active.lastSequence + 1)}` : 'Next · —';
  $('#save-sale').disabled = !active;
  for (const input of $('#sale-form').querySelectorAll('input,select,button')) if (input.id !== 'save-sale') input.disabled = !active;
  $('#export-day').disabled = !state.selected;
}

function renderSales(sales, editable) {
  if (!sales.length) return '<div class="empty"><strong>No sales yet</strong><p>Each purchase will appear here after you save it.</p></div>';
  return sales.map(sale => `<article class="sale-card ${sale.voidedAt ? 'voided' : ''}"><div class="sale-head"><div><span class="sale-id">#${fmt(sale.saleId)}</span><span class="sale-meta">${fmt(prettyTime(sale.createdAt))} · ${sale.paymentMethod === 'cash' ? 'Cash' : 'Other / transfer'}</span></div><span class="sale-amount">${fmt(mmk(sale.total))}</span></div><div class="sale-items">${sale.items.map(item => `${fmt(item.product)} <span class="sale-meta">${fmt(item.quantity)} × ${fmt(mmk(item.unitPrice))}</span>`).join(' · ')}</div><div class="sale-foot"><span>${sale.voidedAt ? `<span class="void-tag">VOID</span> ${fmt(sale.voidReason)}` : (sale.note ? fmt(sale.note) : `${sale.items.length} ${sale.items.length === 1 ? 'product' : 'products'}`)}</span>${editable && !sale.voidedAt ? `<button class="text-button" data-void="${sale.sequence}">Void incorrect sale</button>` : ''}</div></article>`).join('');
}

function renderDaybook() {
  const day = state.days.find(d => d.date === state.selected);
  const holder = $('#daybook-content');
  if (!day) { holder.innerHTML = '<div class="empty"><strong>No day selected</strong><p>Open the shop or select a date from History.</p></div>'; return; }
  const summary = totals(state.sales);
  $('#daybook-subtitle').textContent = `${prettyDate(day.date)} · ${day.closedAt ? 'Closed' : 'Open'} · ${state.sales.length} recorded IDs`;
  const cashEstimate = day.openingCash + summary.cash;
  holder.innerHTML = `<div class="metrics"><div class="metric"><span>Valid sales</span><strong>${summary.count}</strong></div><div class="metric"><span>Sales value</span><strong>${fmt(mmk(summary.revenue))}</strong></div><div class="metric"><span>Cash sales</span><strong>${fmt(mmk(summary.cash))}</strong></div><div class="metric"><span>Units sold</span><strong>${fmt(summary.items)}</strong></div></div><div class="cash-box"><div><span>Opening cash</span><strong>${fmt(mmk(day.openingCash))}</strong></div><div><span>Recorded cash sales</span><strong>+ ${fmt(mmk(summary.cash))}</strong></div><div class="cash-total"><span>Estimated drawer before other cash movements</span><strong>${fmt(mmk(cashEstimate))}</strong></div>${day.closedAt ? `<div><span>Actual cash counted at close</span><strong>${fmt(mmk(day.countedCash))}</strong></div><div><span>Kept for tomorrow / set aside</span><strong>${fmt(mmk(day.keptCash))} / ${fmt(mmk(day.setAsideCash))}</strong></div>${day.closingNote ? `<div><span>Closing note</span><strong>${fmt(day.closingNote)}</strong></div>` : ''}` : ''}<div class="cash-note">This is a cash estimate, not profit. It excludes expenses, purchases and other cash movements.</div></div><h3 class="list-heading">Transactions <span>${state.sales.length}</span></h3>${renderSales(state.sales, !day.closedAt)}`;
  for (const button of holder.querySelectorAll('[data-void]')) button.onclick = () => {
    state.voidSequence = Number(button.dataset.void);
    $('#void-title').textContent = `Void sale #${saleId(state.voidSequence)}`;
    $('#void-reason').value = '';
    $('#void-dialog').showModal();
  };
}

function renderHistory() {
  $('#day-count').textContent = `${state.days.length}`;
  $('#history-list').innerHTML = state.days.length ? state.days.map(day => `<div class="history-card"><div><h4>${fmt(prettyDate(day.date))} ${day.closedAt ? '' : '<span class="void-tag" style="color:#2f7446;background:#eaf4e9">OPEN</span>'}</h4><p>${fmt(day.date)} · ${day.lastSequence} recorded IDs · ${day.closedAt ? 'Closed '+fmt(prettyTime(day.closedAt)) : 'In progress'}</p></div><div class="history-actions"><button class="mini-button" data-view="${day.date}">View</button><button class="mini-button" data-export="${day.date}">↓ CSV</button>${day.closedAt && !state.current ? `<button class="mini-button reopen" data-reopen="${day.date}">Reopen</button>` : ''}</div></div>`).join('') : '<div class="empty"><strong>No days recorded</strong><p>Open your first day to start a ledger.</p></div>';
  for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => action(async () => { state.selected = button.dataset.view; state.sales = await getSales(state.selected); renderDaybook(); switchTab('daybook'); });
  for (const button of document.querySelectorAll('[data-export]')) button.onclick = () => action(async () => { await exportDay(button.dataset.export); notice('CSV downloaded. Keep a copy in a safe place.'); });
  for (const button of document.querySelectorAll('[data-reopen]')) button.onclick = () => action(async () => {
    if (!confirm(`Reopen ${button.dataset.reopen} to correct or add sales? Existing sale IDs will continue.`)) return;
    await reopenDay(button.dataset.reopen); state.selected = button.dataset.reopen; await refresh(); switchTab('daybook'); notice('Day reopened. Sale numbering continues from the last ID.');
  });
}

async function refresh() {
  state.days = await getDays(); state.current = state.days.find(day => !day.closedAt) || null;
  if (state.current) state.selected = state.current.date;
  else if (!state.days.some(d => d.date === state.selected)) state.selected = state.days[0]?.date || null;
  state.sales = state.selected ? await getSales(state.selected) : [];
  renderBanner(); renderDaybook(); renderHistory();
  const products = [...new Set(state.sales.flatMap(s => s.items.map(i => i.product)))].slice(0,50);
  $('#product-suggestions').replaceChildren(...products.map(p => {const option=document.createElement('option');option.value=p;return option;}));
}

function showClose() {
  const summary = totals(state.sales);
  $('#close-summary').textContent = `${summary.count} valid sales · ${mmk(summary.revenue)} in sales value.`;
  $('#expected-cash').textContent = `Estimated drawer: ${mmk(state.current.openingCash + summary.cash)} (opening cash + recorded cash sales)`;
  $('#counted-cash').value = String(state.current.openingCash + summary.cash);
  $('#kept-cash').value = '0'; $('#set-aside').value = '0'; $('#closing-note').value = '';
  updateAllocation(); $('#close-dialog').showModal();
}
function updateAllocation() {
  const left = Number($('#counted-cash').value) - Number($('#kept-cash').value) - Number($('#set-aside').value);
  $('#allocation-left').textContent = `Unallocated counted cash: ${mmk(left)}`;
}

function wire() {
  for (const tab of document.querySelectorAll('.tab')) tab.onclick = () => switchTab(tab.dataset.tab);
  for (const close of document.querySelectorAll('[data-close]')) close.onclick = () => close.closest('dialog').close();
  $('#add-item').onclick = () => {addItem(); $('.item-row:last-child .product-input').focus();};
  $('#item-list').onclick = event => {const button = event.target.closest('.remove-item'); if (!button) return; button.closest('.item-row').remove(); numberItems(); updateDraft();};
  $('#item-list').oninput = updateDraft;
  for (const id of ['counted-cash','kept-cash','set-aside']) $(`#${id}`).addEventListener('input', updateAllocation);
  $('#open-form').onsubmit = event => {event.preventDefault(); action(async () => {
    const date = $('#open-date').value;
    if (!date || date > localDate()) throw new Error('Choose today or an earlier date.');
    const openingCash = wholeNumber($('#opening-cash').value, 'Opening cash');
    await openDay(date, openingCash); $('#open-dialog').close(); await refresh(); switchTab('sell'); notice(`Shop opened for ${prettyDate(date)}. Start with sale #0001.`);
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  });};
  $('#sale-form').onsubmit = event => {event.preventDefault(); action(async () => {
    if (!state.current) throw new Error('Open the shop first.');
    const validated = validateItems(draftRows());
    const sale = await addSale(state.current.date, {...validated, paymentMethod:$('#payment').value, note:$('#sale-note').value});
    $('#item-list').replaceChildren(); addItem(); $('#payment').value = 'cash'; $('#sale-note').value = '';
    await refresh(); notice(`Sale #${sale.saleId} saved · ${mmk(sale.total)}`);
  });};
  $('#void-form').onsubmit = event => {event.preventDefault(); action(async () => {
    await voidSale(state.selected, state.voidSequence, $('#void-reason').value);
    $('#void-dialog').close(); await refresh(); notice(`Sale #${saleId(state.voidSequence)} marked void. Its ID is preserved.`);
  });};
  $('#close-form').onsubmit = event => {event.preventDefault(); action(async () => {
    const date = state.current?.date;
    if (!date) throw new Error('There is no open shop day.');
    const values = {countedCash:$('#counted-cash').value, keptCash:$('#kept-cash').value, setAsideCash:$('#set-aside').value, closingNote:$('#closing-note').value};
    await closeDay(date, values); $('#close-dialog').close(); await refresh(); switchTab('daybook');
    try { await exportDay(date); notice(`Shop closed for ${date}. CSV downloaded; please check your downloads.`); }
    catch { notice(`Shop closed for ${date}. Use Download CSV in Daybook to save the file.`, true); }
  });};
  $('#export-day').onclick = () => action(async () => {await exportDay(state.selected); notice('CSV downloaded. Keep a copy in a safe place.');});
  $('#backup-all').onclick = () => action(async () => {
    const data = await allData();
    download(`shopday-backup-${localDate()}.json`, JSON.stringify(data, null, 2), 'application/json');
    notice('Full backup downloaded. Keep it in a safe place.');
  });
  $('#restore-file').onchange = event => action(async () => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (state.days.length) throw new Error('This browser already contains shop records. Restore into a new, empty browser profile.');
      if (file.size > 30_000_000) throw new Error('Backup file is too large.');
      const data = JSON.parse(await file.text());
      if (!confirm(`Restore ${data.days?.length ?? 0} business days and ${data.sales?.length ?? 0} sales into this empty browser?`)) return;
      await restoreData(data); await refresh(); notice('Backup restored successfully. Check History to review your days.');
    } finally {event.target.value = '';}
  });
}

async function init() {
  $('#date-label').textContent = prettyDate(localDate());
  addItem(); wire();
  try {await openDb(); await refresh();}
  catch (error) {notice(`Local storage is unavailable: ${error.message}. Sales cannot be saved in this browser.`, true); $('#save-sale').disabled = true;}
  $('#storage-warning').hidden = false;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
init();
