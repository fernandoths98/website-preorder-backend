'use strict';

// Run inside the existing API container; its environment and mysql2 are reused.
const LEGACY_SLUG = 'paket-hemat-anak-kost';
const SLUGS = [LEGACY_SLUG, 'paket-bulanan-anak-kost'];
const DEMO_SKUS = new Set(['MYK-GRG-1', 'MYK-GRG-2', 'GLA-PSR-500', 'GLA-PSR-1', 'MRG-CUP-200', 'MRG-CUP-250', 'MRG-KLG-500', 'TEH-CLP-25', 'MIE-INS-1']);
const BULK = /\b(dus|karton|carton|ctn|bal|lusin|multipack|isi\s*\d+)\b|\d+\s*[x×]\s*\d+/i;
const RULES = [
  { key: 'beras', label: 'Beras sekitar 5 kg', family: 'mass', target: 5000, min: 1000, max: 5000, aggregate: true,
    match: n => /\bberas\b/.test(n) && !/tepung|bubur|ketan|merah|hitam|organik/.test(n) },
  { key: 'minyak', label: 'Minyak goreng sekitar 1 L', family: 'volume', target: 1000, min: 450, max: 1000, aggregate: true,
    match: n => /minyak\s+goreng|cooking\s+oil/.test(n) },
  { key: 'gula', label: 'Gula pasir sekitar 1 kg', family: 'mass', target: 1000, min: 500, max: 1000, aggregate: true,
    match: n => /gula\s+pasir|white\s+sugar/.test(n) && !/merah|aren|palm|cair/.test(n) },
  { key: 'mi', label: 'Mi instan 6 bungkus', family: 'mass', target: 80, min: 50, max: 150, fixedQty: 6,
    match: n => /(?:mi|mie|noodle).*instan|instan.*(?:mi|mie|noodle)|\b(indomie|sedaap|supermi|sarimi)\b/.test(n) && !/cup|gelas|bihun|soun|kering|mentah|telur|egg/.test(n) },
  { key: 'piring', label: 'Sabun cuci piring 1 kemasan', family: 'volume', target: 750, min: 450, max: 1000, fixedQty: 1,
    match: n => /cuci\s+piring|dish\s*(wash|washing)|sunlight|mama\s+lemon/.test(n) && !/sponge|spons|sikat|busa|sabut/.test(n) },
  { key: 'baju', label: 'Deterjen 1 kemasan', family: 'mass', target: 900, min: 500, max: 1500, fixedQty: 1,
    match: n => /deter[jg]en|detergent|rinso|daia|attack|so\s*klin/.test(n) && !/pelembut|pewangi|softener|molto|downy|pemutih|bleach|lantai/.test(n) },
];

function sizes(product) {
  const name = String(product.name).toLowerCase().replace(/,/g, '.');
  const found = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(kilogram|kg|gram|gr|g|milliliter|mililiter|ml|liter|litre|ltr|lt|l)(?![a-z])/g;
  for (const m of name.matchAll(pattern)) {
    const unit = m[2];
    const mass = ['kilogram', 'kg', 'gram', 'gr', 'g'].includes(unit);
    const factor = ['kilogram', 'kg', 'liter', 'litre', 'ltr', 'lt', 'l'].includes(unit) ? 1000 : 1;
    found.push({ amount: Number(m[1]) * factor, family: mass ? 'mass' : 'volume' });
  }
  // A master product explicitly sold per kg/liter needs no package-size guess.
  if (!found.length && ['kg', 'kilogram', 'liter', 'litre', 'l'].includes(String(product.unit).toLowerCase())) {
    found.push({ amount: 1000, family: String(product.unit).toLowerCase().includes('kg') || String(product.unit).toLowerCase() === 'kilogram' ? 'mass' : 'volume' });
  }
  return found;
}

function eligible(p) {
  return Boolean(Number(p.is_active)) && !p.deleted_at && !p.merchant_id && Number(p.supplier_available ?? 1) === 1
    && !DEMO_SKUS.has(p.sku) && !/picsum\.photos/i.test(p.image_url || '') && !BULK.test(p.name + ' ' + p.unit) && ![...String(p.name).matchAll(/(\d+)\s*(pcs|sachet|sct|buah|bungkus)\b/gi)].some(m => Number(m[1]) > 1)
    && Number(p.base_price) > 0 && Number.isFinite(Number(p.base_price)) && Number.isFinite(Number(p.margin)) && Number(p.margin) >= 0
    && (!p.published_id || (['available', 'limited'].includes(p.po_status) && Number(p.batch_base_price) > 0 && Number.isFinite(Number(p.batch_margin)) && Number(p.batch_margin) >= 0));
}

function buildPlan(products) {
  const used = new Set();
  const items = [];
  const missing = [];
  for (const rule of RULES) {
    const candidates = products.filter(p => eligible(p) && !used.has(String(p.id)) && rule.match(String(p.name).toLowerCase()))
      .flatMap(p => sizes(p).filter(size => size.family === rule.family && size.amount >= rule.min && size.amount <= rule.max)
        .map(size => {
          const qty = rule.fixedQty || (rule.aggregate ? Math.ceil(rule.target / size.amount) : 1);
          const basePrice = Number(p.published_id ? p.batch_base_price : p.base_price);
          const margin = Number(p.published_id ? p.batch_margin : p.margin);
          return { product: p, qty, size, basePrice, margin,
            score: Math.abs(size.amount - rule.target) / rule.target,
            sortOrder: items.length + 1, role: rule.key };
        }))
      .filter(c => !c.product.published_id || c.product.max_qty == null || Number(c.product.max_qty) >= c.qty)
      .sort((a, b) => a.score - b.score || Number(!a.product.published_id) - Number(!b.product.published_id)
        || (a.basePrice + a.margin) * a.qty - (b.basePrice + b.margin) * b.qty
        || String(a.product.id).localeCompare(String(b.product.id), 'en', { numeric: true }));
    if (!candidates.length) { missing.push(rule.label); continue; }
    const item = candidates[0]; used.add(String(item.product.id)); items.push(item);
  }
  if (missing.length) throw new Error('Default belum dipasang. Produk/ukuran yang belum tersedia: ' + missing.join('; ') + '. Tidak ada data yang diubah.');
  const cost = items.reduce((n, i) => n + Math.round(i.basePrice * 100) * i.qty, 0);
  const looseMargin = items.reduce((n, i) => n + Math.round(i.margin * 100) * i.qty, 0);
  const masterMargin = items.reduce((n, i) => n + Math.round(Number(i.product.margin) * 100) * i.qty, 0);
  const margin = Math.max(0, Math.min(250000, Math.floor(Math.min(looseMargin, masterMargin) * .8 / 10000) * 10000));
  const maxQty = Math.min(5, ...items.filter(i => i.product.published_id && i.product.max_qty != null)
    .map(i => Math.floor(Number(i.product.max_qty) / i.qty)));
  return { items, margin: margin / 100, modal: cost / 100, price: (cost + margin) / 100,
    loosePrice: (cost + looseMargin) / 100, savings: (looseMargin - margin) / 100, maxQty };
}

const COPY = {
  name: 'Paket Bulanan Anak Kost',
  tagline: 'Kebutuhan masak, cuci piring, dan cuci baju dalam satu paket.',
  target: 'Anak kost & pekerja yang tinggal sendiri',
};
function description(plan) {
  return 'Paket belanja bulanan untuk yang tinggal sendiri. Isi: ' + plan.items.map(i => `${i.product.name} × ${i.qty}`).join('; ')
    + '. Ukuran dan jumlah mengikuti kemasan yang tercantum. Lama pemakaian tergantung kebutuhan masing-masing.';
}

async function install(connection, { apply = false, backup = async () => {} } = {}) {
  await connection.beginTransaction();
  try {
    // Same current-batch selection as BatchesService.current().
    let [batches] = await connection.query("SELECT * FROM po_batches WHERE status='open' AND opens_at<=NOW() AND closes_at>=NOW() ORDER BY opens_at DESC LIMIT 1 FOR UPDATE");
    if (!batches.length) [batches] = await connection.query('SELECT * FROM po_batches ORDER BY opens_at DESC LIMIT 1 FOR UPDATE');
    if (!batches.length) throw new Error('Belum ada batch preorder. Tidak ada data yang diubah.');
    const batch = batches[0];
    const [products] = await connection.query(`SELECT p.*, pbp.id AS published_id, pbp.base_price AS batch_base_price,
      pbp.margin AS batch_margin, pbp.po_status, pbp.max_qty
      FROM products p LEFT JOIN product_batch_prices pbp ON pbp.product_id=p.id AND pbp.batch_id=?
      WHERE p.is_active=1 AND p.deleted_at IS NULL AND p.merchant_id IS NULL ORDER BY p.id FOR UPDATE`, [batch.id]);
    const plan = buildPlan(products);
    const [bundles] = await connection.query('SELECT * FROM bundles WHERE slug IN (?, ?) FOR UPDATE', SLUGS);
    if (bundles.length > 1) throw new Error('Ditemukan dua paket Anak Kost dengan slug default. Tidak ada data yang diubah.');
    const previous = bundles[0] || null;
    const slug = previous?.slug || LEGACY_SLUG; // Keep existing promo links and bundle identity.
    const [oldItems] = previous ? await connection.query('SELECT * FROM bundle_items WHERE bundle_id=? ORDER BY sort_order', [previous.id]) : [[]];
    const [promos] = await connection.query('SELECT * FROM promotions WHERE cta_url=? FOR UPDATE', ['/paket/' + slug]);
    const result = { ...plan, batchCode: batch.code, batchStatus: batch.status, slug, applied: false };
    if (!apply) { await connection.rollback(); return result; }
    await backup({ version: 1, at: new Date().toISOString(), bundle: previous, items: oldItems, promotions: promos,
      batchId: String(batch.id), newlyPublishedProductIds: plan.items.filter(i => !i.product.published_id).map(i => String(i.product.id)) });
    for (const item of plan.items.filter(i => !i.product.published_id)) {
      // Existing weekly prices, statuses and limits are never overwritten.
      await connection.execute(`INSERT INTO product_batch_prices
        (batch_id,product_id,base_price,margin,po_status,sort_order) VALUES (?,?,?,?,'available',0)`,
      [batch.id, item.product.id, item.basePrice, item.margin]);
    }
    const fields = [COPY.name, COPY.tagline, description(plan), COPY.target, plan.margin, plan.maxQty];
    let id;
    if (previous) {
      id = previous.id;
      await connection.execute(`UPDATE bundles SET name=?,tagline=?,description=?,target_market=?,margin=?,max_qty=?,is_active=1,deleted_at=NULL WHERE id=?`, [...fields, id]);
    } else {
      const [inserted] = await connection.execute(`INSERT INTO bundles
        (name,tagline,description,target_market,margin,max_qty,slug,image_url,is_active,sort_order) VALUES (?,?,?,?,?,?,?,'/img/paket-anak-kost.svg',1,1)`, [...fields, slug]);
      id = inserted.insertId;
    }
    await connection.execute('DELETE FROM bundle_items WHERE bundle_id=?', [id]);
    for (const item of plan.items) await connection.execute('INSERT INTO bundle_items (bundle_id,product_id,qty,sort_order) VALUES (?,?,?,?)',
      [id, item.product.id, item.qty, item.sortOrder]);
    await connection.execute('UPDATE promotions SET title=?,subtitle=? WHERE cta_url=?', [COPY.name, COPY.tagline, '/paket/' + slug]);
    await connection.commit();
    return { ...result, applied: true, bundleId: String(id) };
  } catch (error) {
    await connection.rollback(); throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => !['--apply', '--preview'].includes(a)) || (args.includes('--apply') && args.includes('--preview'))) throw new Error('Gunakan --preview atau --apply.');
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS']) if (!process.env[key]) throw new Error('Environment API belum lengkap: ' + key);
  const connection = await require('mysql2/promise').createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASS, supportBigNumbers: true, bigNumberStrings: true,
  });
  try {
    await connection.query("SET time_zone='+07:00'");
    const path = require('node:path'); const fs = require('node:fs/promises');
    const result = await install(connection, { apply: args.includes('--apply'), backup: async snapshot => {
      const folder = path.resolve('uploads/bundle-default-backups');
      await fs.mkdir(folder, { recursive: true });
      const file = path.join(folder, 'anak-kost-' + Date.now() + '.json');
      await fs.writeFile(file, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
      console.log('Salinan paket sebelumnya:', file);
    } });
    console.table(result.items.map(i => ({ kebutuhan: i.role, produk: i.product.name, SKU: i.product.sku, jumlah: i.qty,
      hargaSatuan: i.basePrice + i.margin, publish: i.product.published_id ? 'sudah ada' : 'ditambahkan' })));
    console.log(JSON.stringify({ nama: COPY.name, batch: result.batchCode, statusBatch: result.batchStatus,
      modal: result.modal, hargaPaket: result.price, beliSatuan: result.loosePrice, hemat: result.savings,
      maxPerOrder: result.maxQty, diterapkan: result.applied }, null, 2));
    if (result.batchStatus !== 'open') console.log('Batch sedang tidak open; pemesanan tetap mengikuti jadwal preorder.');
  } finally { await connection.end(); }
}

module.exports = { sizes, eligible, buildPlan, install, COPY };
if (require.main === module || process.argv[1] === '-') main().catch(error => {
  console.error('Gagal memasang default:', error.message); process.exitCode = 1;
});
