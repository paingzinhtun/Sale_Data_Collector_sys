import {saleId, validateItems, wholeNumber} from './core.js';

const NAME = 'shopday-ledger';
const VERSION = 1;
let connection;

function request(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export function openDb() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', {keyPath:'date'});
      if (!db.objectStoreNames.contains('sales')) {
        const store = db.createObjectStore('sales', {keyPath:['date','sequence']});
        store.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
    req.onerror = () => { connection = null; reject(req.error); };
    req.onblocked = () => { connection = null; reject(new Error('Close other shop tabs and try again.')); };
  });
  return connection;
}

async function transact(stores, mode, work) {
  const db = await openDb();
  const tx = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error('The change was not saved.'));
    tx.onerror = () => {}; // onabort reports the transaction error
  });
  try {
    const result = await work(tx);
    await done;
    return result;
  } catch (error) {
    if (tx.readyState === 'active') tx.abort();
    await done.catch(() => {});
    throw error;
  }
}

export const getDays = () => transact(['days'], 'readonly', tx => request(tx.objectStore('days').getAll()).then(days => days.sort((a,b) => b.date.localeCompare(a.date))));
export const getSales = date => transact(['sales'], 'readonly', tx => request(tx.objectStore('sales').index('date').getAll(IDBKeyRange.only(date))).then(sales => sales.sort((a,b) => b.sequence - a.sequence)));

export function openDay(date, openingCash) {
  return transact(['days'], 'readwrite', async tx => {
    const days = tx.objectStore('days');
    const all = await request(days.getAll());
    if (all.some(day => !day.closedAt)) throw new Error('Close the open day first.');
    const existing = all.find(day => day.date === date);
    if (existing) throw new Error('This date already has a daybook. Reopen it from History if needed.');
    const day = {date, openedAt:new Date().toISOString(), closedAt:null, openingCash, lastSequence:0, countedCash:null, keptCash:null, setAsideCash:null, closingNote:''};
    await request(days.add(day));
    return day;
  });
}

export function reopenDay(date) {
  return transact(['days'], 'readwrite', async tx => {
    const days = tx.objectStore('days');
    const all = await request(days.getAll());
    if (all.some(day => !day.closedAt)) throw new Error('Close the currently open day first.');
    const day = all.find(d => d.date === date);
    if (!day || !day.closedAt) throw new Error('Closed day not found.');
    day.closedAt = null;
    await request(days.put(day));
    return day;
  });
}

export function addSale(date, input) {
  const {items, total} = validateItems(input.items);
  const method = input.paymentMethod;
  if (!['cash','other'].includes(method)) throw new Error('Choose a payment method.');
  const note = String(input.note ?? '').trim();
  if (note.length > 300) throw new Error('Note must be at most 300 characters.');
  return transact(['days','sales'], 'readwrite', async tx => {
    const days = tx.objectStore('days');
    const day = await request(days.get(date));
    if (!day || day.closedAt) throw new Error('Open the shop before saving a sale.');
    const sequence = day.lastSequence + 1;
    day.lastSequence = sequence;
    const sale = {date, sequence, saleId:saleId(sequence), createdAt:new Date().toISOString(), items, total, paymentMethod:method, note, voidedAt:null, voidReason:''};
    await request(tx.objectStore('sales').add(sale));
    await request(days.put(day));
    return sale;
  });
}

export function voidSale(date, sequence, reason) {
  const why = String(reason ?? '').trim();
  if (!why || why.length > 200) throw new Error('Enter a reason of up to 200 characters.');
  return transact(['days','sales'], 'readwrite', async tx => {
    const day = await request(tx.objectStore('days').get(date));
    if (!day || day.closedAt) throw new Error('Reopen the day before correcting a sale.');
    const store = tx.objectStore('sales');
    const sale = await request(store.get([date, sequence]));
    if (!sale || sale.voidedAt) throw new Error('This sale is no longer available.');
    sale.voidedAt = new Date().toISOString();
    sale.voidReason = why;
    await request(store.put(sale));
    return sale;
  });
}

export function closeDay(date, values) {
  const countedCash = wholeNumber(values.countedCash, 'Counted cash');
  const keptCash = wholeNumber(values.keptCash, 'Cash kept for tomorrow');
  const setAsideCash = wholeNumber(values.setAsideCash, 'Cash set aside');
  if (keptCash + setAsideCash > countedCash) throw new Error('Kept cash and set aside cash exceed counted cash.');
  const closingNote = String(values.closingNote ?? '').trim();
  if (closingNote.length > 300) throw new Error('Closing note must be at most 300 characters.');
  return transact(['days'], 'readwrite', async tx => {
    const store = tx.objectStore('days');
    const day = await request(store.get(date));
    if (!day || day.closedAt) throw new Error('This day is already closed.');
    Object.assign(day, {closedAt:new Date().toISOString(), countedCash, keptCash, setAsideCash, closingNote});
    await request(store.put(day));
    return day;
  });
}

export async function allData() {
  return transact(['days','sales'], 'readonly', async tx => ({
    format:'shopday-backup', version:1, exportedAt:new Date().toISOString(),
    days:await request(tx.objectStore('days').getAll()), sales:await request(tx.objectStore('sales').getAll())
  }));
}

export function restoreData(data) {
  if (data?.format !== 'shopday-backup' || data.version !== 1 || !Array.isArray(data.days) || !Array.isArray(data.sales)) throw new Error('This is not a Shopday backup.');
  if (data.days.length > 10000 || data.sales.length > 1000000) throw new Error('Backup is too large.');
  const seenDays = new Set();
  for (const day of data.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || seenDays.has(day.date) || !Number.isSafeInteger(day.lastSequence) || day.lastSequence < 0) throw new Error('Backup contains an invalid business day.');
    wholeNumber(day.openingCash, 'Opening cash');
    seenDays.add(day.date);
  }
  const seenSales = new Set();
  for (const sale of data.sales) {
    const key = `${sale.date}/${sale.sequence}`;
    const day = data.days.find(d => d.date === sale.date);
    if (!day || !Number.isSafeInteger(sale.sequence) || sale.sequence < 1 || sale.sequence > day.lastSequence || sale.saleId !== saleId(sale.sequence) || seenSales.has(key)) throw new Error('Backup contains an invalid sale ID.');
    const parsed = validateItems(sale.items);
    if (parsed.total !== sale.total || parsed.items.some((item, i) => item.lineTotal !== sale.items[i].lineTotal) || !['cash','other'].includes(sale.paymentMethod) || !Number.isFinite(Date.parse(sale.createdAt))) throw new Error('Backup contains an invalid sale.');
    seenSales.add(key);
  }
  return transact(['days','sales'], 'readwrite', async tx => {
    const days = tx.objectStore('days'); const sales = tx.objectStore('sales');
    if ((await request(days.count())) !== 0 || (await request(sales.count())) !== 0) throw new Error('Restore only works in an empty browser profile. Back up this browser first.');
    for (const day of data.days) await request(days.add(day));
    for (const sale of data.sales) await request(sales.add(sale));
  });
}
