import test from 'node:test';
import assert from 'node:assert/strict';
import {dayCsv, localTimestamp, saleId, totals, validateItems} from '../public/core.js';

test('a basket has one total and one ID per purchase', () => {
  const purchase = validateItems([{product:'Pen', quantity:'2', unitPrice:'100'}, {product:'Notebook', quantity:'1', unitPrice:'1000'}]);
  assert.equal(purchase.total, 1200);
  assert.deepEqual(purchase.items.map(i => i.lineTotal), [200,1000]);
  assert.equal(saleId(1), '0001');
  assert.equal(saleId(12), '0012');
});

test('rejects fractional values and unsafe large amounts', () => {
  assert.throws(() => validateItems([{product:'Pen',quantity:'1.5',unitPrice:'100'}]), /whole number/);
  assert.throws(() => validateItems([{product:'Pen',quantity:'999999999999',unitPrice:'999999999999'}]), /too large/);
});

test('CSV has one row per item, quotes names, prevents formulas, and keeps void records', () => {
  const day = {date:'2026-09-23'};
  const first = {date:day.date,saleId:'0001',createdAt:'2026-09-23T10:00:00.000Z',items:[{product:'Pen, blue',quantity:2,unitPrice:100,lineTotal:200},{product:'=HYPERLINK("x")',quantity:1,unitPrice:500,lineTotal:500}],total:700,paymentMethod:'cash',note:'A "test"',voidReason:'',voidedAt:null};
  const second = {...first,saleId:'0002',items:[{product:'Notebook',quantity:1,unitPrice:1000,lineTotal:1000}],total:1000,voidedAt:'2026-09-23T11:00:00Z',voidReason:'Duplicate'};
  const csv = dayCsv(day,[first,second]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.equal(csv.trim().split('\r\n').length, 4);
  assert.match(csv, /"Pen, blue"/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"void"/);
  assert.match(csv, /"A ""test"""/);
  assert.deepEqual(totals([first,second]), {count:1,revenue:700,cash:700,items:3});
  assert.match(localTimestamp(first.createdAt), /^2026-09-23T\d\d:\d\d:00[+-]\d\d:\d\d$/);
});
