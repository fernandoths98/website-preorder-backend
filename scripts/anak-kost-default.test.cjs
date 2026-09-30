'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan, sizes, install } = require('./apply-anak-kost-default.cjs');

const product = (id, name, base_price, extra = {}) => ({ id: String(id), name, sku: 'REAL-' + id, unit: 'pcs', base_price,
  margin: 2000, is_active: 1, supplier_available: 1, merchant_id: null, deleted_at: null, image_url: 'https://supplier.example/product.webp', ...extra });
const catalog = () => [
  product(1, 'Beras Ramos Pck 5 kg', 70000),
  product(2, 'Jujur Minyak Goreng Pch 1000 ml', 18000),
  product(3, 'Rose Brand Gula Pasir Putih Pck 1 kg', 15000),
  product(4, 'Indomie Mi Goreng Pcs 85 g', 3000),
  product(5, 'Sunlight Cuci Piring Jeruk Nipis Pch 755 ml', 14000),
  product(6, 'Daia Detergen Putih Pck 800 gr', 17000),
];

test('monthly default includes cooking, dishwashing and laundry with real prices', () => {
  const p = buildPlan(catalog());
  assert.deepEqual(p.items.map(i => [i.role, i.qty]), [['beras', 1], ['minyak', 1], ['gula', 1], ['mi', 6], ['piring', 1], ['baju', 1]]);
  assert.equal(p.modal, 152000); assert.equal(p.price, 154500); assert.equal(p.savings, 19500);
  assert.equal(p.maxQty, 5);
});
test('small staple packs aggregate to the requested total', () => {
  const products = catalog(); products[0].name = 'Beras Ramos Pck 1 kg'; products[1].name = 'Jujur Minyak Goreng Pch 450 ml'; products[2].name = 'Gula Pasir Putih 500 g';
  const plan = buildPlan(products);
  assert.deepEqual(plan.items.slice(0, 3).map(i => i.qty), [5, 3, 2]);
});
test('uses available red rice when production white rice is supplier-unavailable', () => {
  const rows = catalog().filter(p => p.id !== '1');
  rows.push(product(350, 'TOPI KOKI BERAS SETRA RAMOS SAK 5kg', 74500, { supplier_available: 0 }),
    product(1, 'Beras Premium 5 kg', 62000, { is_active: 0, deleted_at: new Date() }),
    product(67, 'Fs Beras Merah Pch 1 kg', 25500),
    product(68, 'Fs Beras Ketan Putih Pch 1 kg', 35500),
    product(96, 'Sumo Beras Khusus Merah Sak 5 kg', 94500));
  const rice = buildPlan(rows).items[0];
  assert.equal(rice.product.id, '96'); assert.equal(rice.qty, 1);
  assert.equal(rice.basePrice, 94500);
  rows.find(p => p.id === '96').supplier_available = 0;
  const small = buildPlan(rows).items[0];
  assert.equal(small.product.id, '67'); assert.equal(small.qty, 5);
});
test('prefers available white rice over red rice even with smaller white packs', () => {
  const rows = catalog(); rows[0].name = 'Beras Ramos 1kg';
  rows.push(product(96, 'Sumo Beras Khusus Merah Sak 5kg', 1));
  assert.equal(buildPlan(rows).items[0].product.id, '1');
  rows[0].supplier_available = 0;
  rows[6].po_status = 'sold_out'; rows[6].published_id = '96';
  rows[6].batch_base_price = 1; rows[6].batch_margin = 2000;
  assert.throws(() => buildPlan(rows), /Beras/);
});
test('recognizes decimal commas, compact units and explicit per-kg units', () => {
  assert.deepEqual(sizes({ name: 'Minyak 0,9L', unit: 'pcs' }), [{ amount: 900, family: 'volume' }]);
  assert.deepEqual(sizes({ name: 'Beras putih', unit: 'Kilogram' }), [{ amount: 1000, family: 'mass' }]);
});
test('does not substitute dish sponges, laundry softener, or legacy demo products', () => {
  const products = catalog().filter(p => !['5','6'].includes(p.id));
  products.push(product(7, 'Sunlight Spons Cuci Piring 750 ml', 1000), product(8, 'So Klin Pewangi Pelembut 900 g', 1000));
  assert.throws(() => buildPlan(products), /Sabun cuci piring.*Deterjen/);
  const demo = catalog(); demo[0].image_url = 'https://picsum.photos/seed/rice/500';
  assert.throws(() => buildPlan(demo), /Beras/);
});
test('avoids sold-out, supplier-unavailable and bulk cartons', () => {
  const products = catalog();
  products.push(product(7, 'Beras Ramos 5 kg', 1, { supplier_available: 0 }));
  products.push(product(8, 'Beras Ramos 5 kg', 1, { published_id: '1', po_status: 'sold_out', batch_base_price: 1, batch_margin: 1 }));
  products.push(product(9, 'Indomie Mi Goreng 40 pcs 85 g', 1));
  products.push(product(10, 'Indomie Mi Goreng 85 g', 1, { unit: 'dus' }));
  assert.deepEqual(buildPlan(products).items.map(i => i.product.id), ['1','2','3','4','5','6']);
});
test('uses current batch pricing, respects limits and keeps package margin affordable', () => {
  const products = catalog().map(p => ({ ...p, published_id: 'P-' + p.id, batch_base_price: p.base_price, batch_margin: 100, po_status: 'available', max_qty: null }));
  products[3].max_qty = 12;
  const p = buildPlan(products);
  assert.equal(p.margin, 800); assert.equal(p.savings, 300); assert.equal(p.maxQty, 2);
  products[3].max_qty = 5;
  assert.throws(() => buildPlan(products), /Mi instan/);
});
test('candidate selection is deterministic regardless of database row order', () => {
  const rows = catalog(); rows.push({ ...rows[0], id: '100', base_price: 80000 });
  assert.deepEqual(buildPlan(rows).items.map(i => i.product.id), buildPlan(rows.reverse()).items.map(i => i.product.id));
});

function fakeDb(rows = catalog(), { duplicates = false, failWrite = false } = {}) {
  let published = new Map(rows.filter(p => p.published_id).map(p => [p.id, p]));
  const calls = [];
  const oldBundle = { id: '88', slug: 'paket-hemat-anak-kost', name: 'Lama', sort_order: 7, image_url: '/img/existing.svg' };
  const db = {
    calls, beginTransaction: async () => calls.push(['begin']), rollback: async () => calls.push(['rollback']), commit: async () => calls.push(['commit']),
    query: async (sql, params) => {
      calls.push(['query', sql, params]);
      if (sql.includes('FROM po_batches')) return [[{ id: '11', code: 'PO-TEST', status: 'open' }]];
      if (sql.includes('FROM products p')) return [rows.map(p => ({ ...p, ...(published.get(p.id) || {}) }))];
      if (sql.includes('FROM bundles')) return [duplicates ? [oldBundle, { ...oldBundle, id: '89', slug: 'paket-bulanan-anak-kost' }] : [oldBundle]];
      if (sql.includes('FROM bundle_items')) return [[{ bundle_id: '88', product_id: '9', qty: 1 }]];
      if (sql.includes('FROM promotions')) return [[{ id: '1', title: 'Di bawah Rp50rb', cta_url: '/paket/paket-hemat-anak-kost' }]];
      throw new Error('Unexpected query');
    },
    execute: async (sql, params) => {
      calls.push(['write', sql, params]);
      if (failWrite) throw new Error('Write failed');
      if (sql.includes('INSERT INTO product_batch_prices')) {
        assert.equal(published.has(String(params[1])), false);
        published.set(String(params[1]), { published_id: 'new', batch_base_price: params[2], batch_margin: params[3], po_status: 'available' });
      }
      return [{ insertId: '88' }];
    },
  };
  return db;
}
test('preview produces a complete plan without writes or backups', async () => {
  const db = fakeDb(); let backups = 0;
  const plan = await install(db, { backup: async () => backups++ });
  assert.equal(plan.applied, false); assert.equal(plan.items.length, 6);
  assert.equal(db.calls.some(c => c[0] === 'write'), false); assert.equal(backups, 0);
  assert.equal(db.calls.at(-1)[0], 'rollback');
});
test('apply replaces only Anak Kost, publishes missing items, preserves slug and records a backup', async () => {
  const rows = catalog(); rows[0] = { ...rows[0], published_id: 'old', po_status: 'limited', batch_base_price: 69000, batch_margin: 1000, max_qty: 2 };
  const db = fakeDb(rows); let backup;
  const plan = await install(db, { apply: true, backup: async b => backup = b });
  assert.equal(plan.bundleId, '88'); assert.equal(plan.applied, true);
  assert.equal(plan.slug, 'paket-hemat-anak-kost'); assert.equal(backup.bundle.name, 'Lama');
  const writes = db.calls.filter(c => c[0] === 'write');
  assert.equal(writes.filter(c => c[1].includes('INSERT INTO product_batch_prices')).length, 5);
  assert.equal(writes.filter(c => c[1].includes('INSERT INTO bundle_items')).length, 6);
  assert.ok(writes.every(c => !/orders|products SET/.test(c[1])));
  assert.equal(db.calls.at(-1)[0], 'commit');
  assert.ok(writes.find(c => c[1].startsWith('DELETE'))[1].includes('WHERE bundle_id=?'));
  await install(db, { apply: true, backup: async () => {} });
  assert.equal(db.calls.filter(c => c[0] === 'write' && c[1].includes('INSERT INTO product_batch_prices')).length, 5);
});
test('missing cleaning products, ambiguous bundles, and backup failure leave the DB untouched', async () => {
  for (const db of [fakeDb(catalog().slice(0, 4)), fakeDb(catalog(), { duplicates: true })]) {
    await assert.rejects(install(db, { apply: true }));
    assert.equal(db.calls.some(c => c[0] === 'write'), false);
    assert.equal(db.calls.at(-1)[0], 'rollback');
  }
  const db = fakeDb();
  await assert.rejects(install(db, { apply: true, backup: async () => { throw new Error('Disk full'); } }), /Disk full/);
  assert.equal(db.calls.some(c => c[0] === 'write'), false);
});
test('any write error rolls back the transaction', async () => {
  const db = fakeDb(catalog(), { failWrite: true });
  await assert.rejects(install(db, { apply: true }), /Write failed/);
  assert.equal(db.calls.some(c => c[0] === 'commit'), false);
  assert.equal(db.calls.at(-1)[0], 'rollback');
});
