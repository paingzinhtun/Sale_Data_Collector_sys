export const MAX_MMK = 999_999_999_999;

export function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localTimestamp(isoString) {
  const date = new Date(isoString);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const two = n => String(n).padStart(2, '0');
  return `${localDate(date)}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}${sign}${two(Math.floor(Math.abs(offset)/60))}:${two(Math.abs(offset)%60)}`;
}

export function saleId(number) { return String(number).padStart(4, '0'); }
export function mmk(number) { return new Intl.NumberFormat('en-US').format(number ?? 0) + ' MMK'; }
export function wholeNumber(value, label, min = 0) {
  const n = Number(value);
  if (String(value).trim() === '' || !Number.isSafeInteger(n) || n < min || n > MAX_MMK) {
    throw new Error(`${label} must be a whole number between ${min} and ${MAX_MMK.toLocaleString('en-US')}.`);
  }
  return n;
}

export function validateItems(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 50) throw new Error('Add between 1 and 50 products.');
  const items = rows.map((row, index) => {
    const product = String(row.product ?? '').trim();
    if (!product || product.length > 120) throw new Error(`Product ${index + 1} needs a name of up to 120 characters.`);
    const quantity = wholeNumber(row.quantity, `Quantity for ${product}`, 1);
    const unitPrice = wholeNumber(row.unitPrice, `Unit price for ${product}`, 0);
    const lineTotal = quantity * unitPrice;
    if (!Number.isSafeInteger(lineTotal) || lineTotal > MAX_MMK) throw new Error(`Amount for ${product} is too large.`);
    return {product, quantity, unitPrice, lineTotal};
  });
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (!Number.isSafeInteger(total) || total > MAX_MMK) throw new Error('Sale amount is too large.');
  return {items, total};
}

export function totals(sales) {
  const valid = sales.filter(s => !s.voidedAt);
  return {count: valid.length, revenue: valid.reduce((sum, s) => sum + s.total, 0), cash: valid.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.total, 0), items: valid.reduce((sum, s) => sum + s.items.reduce((n, i) => n + i.quantity, 0), 0)};
}

const COLUMNS = ['business_date','sale_id','sold_at','status','item_number','product','quantity','unit_price_mmk','line_total_mmk','sale_total_mmk','payment_method','note','void_reason'];
function safeCell(value) {
  let str = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(str) && !/^-?\d+(?:\.\d+)?$/.test(str)) str = "'" + str;
  return '"' + str.replaceAll('"', '""') + '"';
}
export function dayCsv(day, sales) {
  const rows = [COLUMNS];
  for (const sale of sales) for (const [index, item] of sale.items.entries()) {
    rows.push([day.date, sale.saleId, localTimestamp(sale.createdAt), sale.voidedAt ? 'void' : 'valid', index + 1, item.product, item.quantity, item.unitPrice, item.lineTotal, sale.total, sale.paymentMethod, sale.note || '', sale.voidReason || '']);
  }
  return '\uFEFF' + rows.map(row => row.map(safeCell).join(',')).join('\r\n') + '\r\n';
}

export function prettyDate(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString(undefined, {weekday:'short', year:'numeric', month:'short', day:'numeric'});
}
export function prettyTime(isoString) {
  return new Date(isoString).toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
}
