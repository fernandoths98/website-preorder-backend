'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {plans,eligible,apply}=require('./install-shopping-plans.cjs');
const p=(id,name,base_price=10000,extra={})=>({id:String(id),name,unit:'pcs',base_price,margin:2000,is_active:1,supplier_available:1,merchant_id:null,deleted_at:null,...extra});
const catalog=()=>[p(1,'Beras Ramos 2.5kg'),p(2,'Minyak Goreng 1L'),p(3,'Gula Pasir 1kg'),p(4,'Sunlight Cuci Piring 750ml'),p(5,'Daia Deterjen 900g'),p(6,'Ayam Segar Potong 700g'),p(7,'Bumbu Racik Ayam Goreng 25g'),p(8,'Kecap Manis 100ml'),p(9,'Bawang Putih 100g'),p(10,'Bawang Merah 100g'),p(11,'Wortel 200g'),p(12,'Kentang 300g'),p(13,'Kol 200g'),p(14,'Bumbu Racik Sayur Sop 20g')];
test('two periods each contain kitchen, cleaning and three recipe menus',()=>{
 const all=plans(catalog());assert.equal(all.length,10);assert.equal(new Set(all.map(p=>p.slug)).size,10);
 for(const period of ['weekly','monthly'])assert.deepEqual(all.filter(p=>p.plan.period===period).map(p=>p.plan.category),['dapur','cleaning','kulkas','kulkas','kulkas']);
 assert.ok(all.every(p=>p.plan.missing.length===0));
});
test('monthly menu has four chicken portions while shared cooking oil needs only one retail pack',()=>{
 const all=plans(catalog());const weekly=all.find(p=>p.slug==='paket-weekly-ayam-goreng');const monthly=all.find(p=>p.slug==='paket-monthly-ayam-goreng');
 assert.equal(weekly.items.find(i=>i.product.id==='6').qty,1);
 assert.equal(monthly.items.find(i=>i.product.id==='6').qty,4);
 assert.equal(monthly.items.find(i=>i.product.id==='2').qty,1);
 assert.equal(monthly.plan.recipe.sessions,4);assert.ok(monthly.plan.recipe.steps.length>=4);assert.ok(monthly.plan.recipe.pantry.length);
});
test('missing fresh ingredients remain visible as incomplete recipes, never fake products',()=>{
 const all=plans(catalog().filter(p=>p.id!=='6'));const menu=all.find(p=>p.slug==='paket-weekly-ayam-goreng');
 assert.deepEqual(menu.plan.missing,['Ayam mentah 700–1.000 g']);assert.equal(menu.margin,0);assert.equal(menu.items.some(i=>i.product.id==='6'),false);assert.ok(menu.plan.recipe.steps.length);
});
test('sold-out raw chicken is not replaced with noodles or premade chicken food',()=>{
 const rows=catalog().filter(p=>p.id!=='6');rows.push(p(100,'Indomie Ayam Goreng 700g'),p(101,'Ayam Nugget 700g'),p(102,'Ayam Potong Segar 1kg',10000,{supplier_available:0}));
 assert.ok(plans(rows).find(p=>p.slug==='paket-weekly-ayam-goreng').plan.missing.length);
 assert.equal(eligible(p(103,'Ayam 1kg',10000,{published_id:'1',po_status:'hidden'})),false);
});
test('published quantity limits can block monthly menu without blocking weekly menu',()=>{
 const rows=catalog();rows[5]={...rows[5],published_id:'1',batch_base_price:10000,batch_margin:2000,po_status:'limited',max_qty:2};
 const all=plans(rows);assert.equal(all.find(p=>p.slug==='paket-weekly-ayam-goreng').plan.missing.length,0);assert.ok(all.find(p=>p.slug==='paket-monthly-ayam-goreng').plan.missing.length);
});
test('backup failure or write failure rolls back without committing',async()=>{
 for(const failBackup of [true,false]){
  const calls=[];const db={beginTransaction:async()=>calls.push('begin'),query:async sql=>sql.includes('FROM po_batches')?[[{id:'1'}]]:sql.includes('FROM products p')?[catalog()]:[[]],execute:async()=>{calls.push('write');throw new Error('write failed')},commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback')};
  await assert.rejects(apply(db,{id:'1'},async()=>{if(failBackup)throw new Error('backup failed')}));
  assert.equal(calls.includes('commit'),false);assert.equal(calls.at(-1),'rollback');if(failBackup)assert.equal(calls.includes('write'),false);
 }
});
test('apply publishes missing real supplier catalog records, seeds ten packages, and archives only known legacy packages',async()=>{
 const rows=catalog();rows[0].supplier_external_id='rice-1';rows.push(p(200,'Supplier Soap 200g',8000,{supplier_external_id:'soap-200'}));rows.push(p(201,'Hidden Soap 200g',8000,{supplier_external_id:'soap-201',published_id:'old',po_status:'hidden',batch_base_price:8000,batch_margin:2000}));
 const writes=[];let snapshot;let sequence=1000;
 const db={beginTransaction:async()=>{},query:async(sql,params)=>{
  if(sql.includes('FROM po_batches'))return [[{id:'1'}]];
  if(sql.includes('FROM products p'))return [rows];
  if(sql.startsWith('INSERT')){writes.push([sql,params]);return [{}]};return [[]];
 },execute:async(sql,params)=>{writes.push([sql,params]);return [{insertId:++sequence}]},commit:async()=>writes.push(['COMMIT']),rollback:async()=>assert.fail('Unexpected rollback')};
 const result=await apply(db,{id:'1'},async s=>snapshot=s);
 assert.equal(result.prepared.length,10);assert.equal(result.published,2);
 assert.ok(snapshot.newlyPublishedProductIds.includes('200'));assert.equal(snapshot.newlyPublishedProductIds.includes('201'),false);
 assert.equal(writes.filter(([sql])=>sql.startsWith('INSERT INTO bundles')).length,10);
 assert.ok(writes.filter(([sql])=>sql.startsWith('INSERT INTO product_batch_prices')).every(([sql])=>sql.includes('ON DUPLICATE KEY UPDATE id=id')));
 assert.equal(writes.some(([sql])=>sql.includes('products SET')),false);
 assert.equal(writes.at(-1)[0],'COMMIT');
});
test('production Pringles crisps are not selected as soup potatoes',()=>{
 const rows=catalog().filter(p=>p.id!=='12');
 rows.push(p(300,'PRINGLES POTATO CRISPS SEAWEED BURST KLG 102g'),p(301,'POTATO CHIPS ORIGINAL 300g'),p(302,'ROTI KENTANG 300g'),p(303,'KENTANG FROZEN FRENCH FRIES 300g'));
 for(const menu of plans(rows).filter(p=>p.slug.endsWith('sayur-sop'))){
  assert.ok(menu.plan.missing.includes('Kentang'));assert.equal(menu.items.some(i=>['300','301','302','303'].includes(i.product.id)),false);
 }
 rows.push(p(304,'Kentang Segar 300g'));
 for(const menu of plans(rows).filter(p=>p.slug.endsWith('sayur-sop'))){assert.equal(menu.plan.missing.length,0);assert.ok(menu.items.some(i=>i.product.id==='304'))}
});
test('processed vegetable products never substitute for fresh soup or chicken-kecap ingredients',()=>{
 const rows=catalog().filter(p=>!['9','10','11','13'].includes(p.id));
 rows.push(p(310,'Garlic Powder 100g'),p(311,'Bawang Merah Goreng 100g'),p(312,'Wortel Juice 200g'),p(313,'Cabbage Soup 200g'));
 const all=plans(rows);
 assert.deepEqual(all.find(p=>p.slug==='paket-weekly-ayam-kecap').plan.missing,['Bawang putih','Bawang merah']);
 assert.deepEqual(all.find(p=>p.slug==='paket-weekly-sayur-sop').plan.missing,['Wortel','Kol/kubis']);
});
