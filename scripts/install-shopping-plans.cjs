'use strict';
// Standalone: pipe into the API container; uses its mysql2 and DB environment.
const mass = (key, label, match, target, min = 100, max = 5000, preference) => ({key,label,match,target,min,max,family:'mass',preference});
const volume = (key,label,match,target,min=100,max=2000) => ({key,label,match,target,min,max,family:'volume'});
// Fresh ingredients must not resolve to processed food that mentions a vegetable.
const freshName = n => !/crisps?|chips?|pringles|keripik|snack|bubuk|powder|tepung|flour|roti|bread|biskuit|biscuit|cracker|jus|juice|saus|sauce|bumbu|racik|kaldu|kering|dried|goreng|fried|frozen|nugget|soup|puree|pasta|paste|pickle|acar|kaleng|canned|\bklg\b/.test(n);
const RULES = {
  rice: mass('rice','Beras', n => /\bberas\b/.test(n) && !/tepung|bubur|ketan|hitam|organik/.test(n),2500,1000,5000,n => /merah/.test(n)?1:0),
  oil: volume('oil','Minyak goreng',n => /minyak\s+goreng|cooking\s+oil/.test(n),1000,450,2000),
  sugar: mass('sugar','Gula pasir',n=>/gula\s+pasir/.test(n)&&!/merah|aren/.test(n),1000,500,2000),
  dish: volume('dish','Sabun cuci piring',n=>/cuci\s+piring|sunlight|mama\s+lemon/.test(n)&&!/spons|sponge|sikat|sabut/.test(n),750,450,1000),
  laundry: mass('laundry','Deterjen bubuk',n=>/deter[jg]en|rinso|daia|attack|so\s*klin/.test(n)&&!/pewangi|pelembut|softener|pemutih|lantai/.test(n),900,500,1500),
  chicken: mass('chicken','Ayam mentah 700–1.000 g',n=>/\bayam\b|chicken/.test(n)&&!/bumbu|racik|goreng|kecap|nugget|sosis|kaldu|mie|mi\b|bubur|abon|tepung|keripik|bakso|matang|snack/.test(n),1000,700,1000),
  fried: mass('fried','Bumbu racik ayam goreng',n=>/bumbu|racik/.test(n)&&/ayam\s+goreng/.test(n),25,15,100),
  soy: volume('soy','Kecap manis',n=>/kecap\s+manis/.test(n),100,60,600),
  garlic: mass('garlic','Bawang putih',n=>(/bawang\s+putih|\bgarlic\b/.test(n))&&freshName(n),100,50,1000),
  shallot: mass('shallot','Bawang merah',n=>(/bawang\s+merah|\bshallots?\b/.test(n))&&freshName(n),100,50,1000),
  carrot: mass('carrot','Wortel',n=>/wortel|\bcarrots?\b/.test(n)&&freshName(n),200,100,1000),
  potato: mass('potato','Kentang',n=>/kentang|\bpotatoes?\b|\bpotato\b/.test(n)&&freshName(n),300,100,1000),
  cabbage: mass('cabbage','Kol/kubis',n=>/\bkol\b|kubis|\bcabbage\b/.test(n)&&freshName(n),200,100,1000),
  soup: mass('soup','Bumbu racik sayur sop',n=>/bumbu|racik/.test(n)&&/sayur\s+sop|sup\s+sayur/.test(n),20,10,100),
};
const STORAGE = 'Paket dikirim sekali bersama batch preorder. Pisahkan bahan per sesi; simpan ayam mentah dalam freezer sampai akan dimasak. Sayuran sebaiknya dimasak segera setelah diterima. Paket bulanan bukan pengiriman mingguan atau langganan otomatis.';
const RECIPES = [
 {key:'ayam-goreng',name:'Ayam Goreng',roles:['chicken','fried','oil'],minutes:45,servings:4,
 ingredients:['Ayam mentah 700–1.000 g','Bumbu racik ayam goreng sesuai petunjuk kemasan','Minyak goreng secukupnya; sisa kemasan dapat digunakan kembali untuk masakan lain'],pantry:['Air untuk ungkep'],
 steps:['Potong ayam menjadi beberapa bagian. Pisahkan alat untuk ayam mentah dari bahan siap makan.', 'Masukkan ayam, bumbu racik, dan air ke panci; ikuti takaran bumbu pada kemasan untuk berat ayam yang digunakan.', 'Ungkep sampai ayam matang seluruhnya dan bumbu meresap. Tiriskan.', 'Panaskan minyak, goreng ayam ungkep bertahap sampai kecokelatan. Tiriskan dan sajikan.']},
 {key:'ayam-kecap',name:'Ayam Kecap',roles:['chicken','soy','garlic','shallot','oil'],minutes:40,servings:4,
 ingredients:['Ayam mentah 700–1.000 g','Kecap manis sekitar 4–6 sdm, sesuaikan rasa','Bawang putih 3 siung','Bawang merah 5 siung','Minyak goreng sekitar 2 sdm'],pantry:['Air secukupnya','Garam dan merica secukupnya; opsional sesuai selera'],
 steps:['Potong ayam dan iris bawang. Pisahkan alat untuk ayam mentah dari bahan siap makan.', 'Tumis bawang merah dan bawang putih dengan minyak sampai harum.', 'Masukkan ayam, aduk, lalu tambahkan kecap dan air hingga ayam dapat dimasak merata.', 'Masak sampai ayam matang seluruhnya. Koreksi rasa dan lanjutkan sampai kuah mengental. Sajikan.']},
 {key:'sayur-sop',name:'Sayur Sop',roles:['carrot','potato','cabbage','soup'],minutes:30,servings:4,
 ingredients:['Wortel sekitar 200 g','Kentang sekitar 300 g','Kol/kubis sekitar 200 g','Bumbu racik sayur sop sesuai petunjuk kemasan'],pantry:['Air sesuai petunjuk kemasan bumbu'],
 steps:['Cuci sayuran dengan air bersih. Kupas wortel dan kentang lalu potong; iris kol.', 'Didihkan air sesuai petunjuk kemasan bumbu. Masukkan kentang, lalu wortel.', 'Setelah kentang dan wortel mulai empuk, tambahkan bumbu racik dan kol.', 'Masak hingga seluruh sayuran matang. Koreksi rasa dan sajikan hangat.']},
];
function packSizes(p) {
 const text=String(p.name).toLowerCase().replace(/,/g,'.');
 const out=[];
 for(const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(kg|kilogram|gram|gr|g|ml|milliliter|mililiter|liter|litre|ltr|lt|l)(?![a-z])/g)) {
  const mass=['kg','kilogram','gram','gr','g'].includes(m[2]);
  out.push({family:mass?'mass':'volume',amount:Number(m[1])*(['kg','kilogram','liter','litre','ltr','lt','l'].includes(m[2])?1000:1)});
 }
 const unit=String(p.unit).trim().toLowerCase();
 if(!out.length && ['kg','kilogram','l','liter'].includes(unit)) out.push({family:['kg','kilogram'].includes(unit)?'mass':'volume',amount:1000});
 return out;
}
function eligible(p) {
 return Number(p.is_active)===1 && !p.deleted_at && !p.merchant_id && Number(p.supplier_available)===1
  && Number(p.base_price)>0 && Number(p.margin)>=0 && !/picsum\.photos/i.test(p.image_url||'')
  && !/\b(dus|karton|carton|ctn|bal|lusin|multipack|isi\s*\d+)\b|\d+\s*[x×]\s*\d+/i.test(p.name+' '+p.unit)
  && ![...String(p.name).matchAll(/(\d+)\s*(pcs|sachet|sct|buah|bungkus)\b/gi)].some(m=>Number(m[1])>1)
  && (!p.published_id || (['available','limited'].includes(p.po_status)&&Number(p.batch_base_price)>0&&Number(p.batch_margin)>=0));
}
function select(products, rule, multiplier=1) {
 const options=products.filter(p=>eligible(p)&&rule.match(String(p.name).toLowerCase())).flatMap(p=>packSizes(p).filter(s=>s.family===rule.family&&s.amount>=rule.min&&s.amount<=rule.max).map(s=>{
  const qty=(rule.key==='chicken'||rule.key==='fried'||rule.key==='soup'||rule.key==='dish'||rule.key==='laundry' ? 1 : Math.ceil(rule.target/s.amount))*multiplier;
  return {p,qty,score:Math.abs(s.amount-rule.target)/rule.target,preference:rule.preference?.(p.name.toLowerCase())||0};
 })).filter(c=>c.qty<=99&&(!c.p.published_id||c.p.max_qty==null||Number(c.p.max_qty)>=c.qty))
 .sort((a,b)=>a.preference-b.preference||a.score-b.score||(Number(a.p.base_price)+Number(a.p.margin))*a.qty-(Number(b.p.base_price)+Number(b.p.margin))*b.qty||String(a.p.id).localeCompare(String(b.p.id),'en',{numeric:true}));
 return options[0]||null;
}
function plans(products) {
 const result=[];
 for(const period of ['weekly','monthly']) {
  const monthly=period==='monthly'; const suffix=monthly?'Bulanan':'Mingguan';
  const specs=[{key:'dapur',category:'dapur',name:'Dapur',roles:['rice','oil','sugar']}, {key:'cleaning',category:'cleaning',name:'Cleaning',roles:['dish','laundry']}, ...RECIPES.map(r=>({...r,category:'kulkas',recipe:r}))];
  for(const spec of specs) {
   const items=[];const missing=[];
   for(const role of spec.roles) {
    const rule={...RULES[role]};
    if(spec.category==='dapur'&&monthly) rule.target*=2;
    // Cleaning uses one retail pack weekly, two monthly; menu repeats four sessions monthly.
    let multiplier=monthly?(spec.category==='kulkas'?4:spec.category==='cleaning'?2:1):1;
    if(spec.category==='kulkas' && !['chicken','fried','soup'].includes(role)) {
      if(role!=='oil') rule.target*=multiplier;
      multiplier=1;
    }
    const selected=select(products,rule,multiplier);
    if(!selected) missing.push(rule.label); else items.push({product:selected.p,qty:selected.qty});
   }
   const recipe=spec.recipe?{servings:spec.servings,sessions:monthly?4:1,minutes:spec.minutes,ingredients:spec.ingredients,pantry:spec.pantry,steps:spec.steps,storage:STORAGE}:undefined;
   const marginCeiling=items.reduce((n,i)=>n+Math.min(Number(i.product.margin),Number(i.product.published_id?i.product.batch_margin:i.product.margin))*i.qty,0);
   result.push({slug:`paket-${period}-${spec.key}`,name:`Paket ${spec.name} ${suffix}`,items,
    margin:missing.length?0:Math.min(2500,Math.floor(marginCeiling*.8/100)*100),
    plan:{period,category:spec.category,missing,...(recipe?{recipe}:{})},
    tagline:spec.category==='kulkas'?`${monthly?'4 sesi':'1 sesi'} masak ${spec.name.toLowerCase()}, bahan dan panduan tersedia.`:spec.category==='dapur'?'Beras, minyak goreng, dan gula untuk persediaan dapur.':'Sabun cuci piring dan deterjen untuk kebersihan sehari-hari.',
    description:spec.category==='kulkas'?`Takaran resep per sesi untuk ${spec.servings} porsi. ${monthly?'Jumlah belanja untuk 4 sesi masak, dikirim sekaligus.':'Belanja untuk 1 sesi masak.'} Produk dijual dalam kemasan penuh; lihat isi paket untuk jumlah aktual.`:'Perkiraan persediaan; lama pemakaian tergantung kebutuhan. Semua produk dikirim sekali bersama batch preorder.'});
  }
 }
 return result;
}
async function schema(db) {
 const [[row]]=await db.query("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='bundles' AND column_name='plan'");
 if(!Number(row.n)) await db.query('ALTER TABLE bundles ADD COLUMN plan JSON NULL');
}
async function apply(db, batch, backup) {
 await db.beginTransaction();
 try {
  const [[lockedBatch]]=await db.query('SELECT * FROM po_batches WHERE id=? FOR UPDATE',[batch.id]);
  if(!lockedBatch) throw new Error('Batch tidak ditemukan.');
  const [products]=await db.query(`SELECT p.*,bp.id AS published_id,bp.base_price AS batch_base_price,bp.margin AS batch_margin,bp.max_qty,bp.po_status FROM products p LEFT JOIN product_batch_prices bp ON bp.product_id=p.id AND bp.batch_id=? WHERE p.is_active=1 AND p.deleted_at IS NULL AND p.merchant_id IS NULL FOR UPDATE`,[batch.id]);
  const prepared=plans(products);
  const publish=products.filter(p=>!p.published_id&&p.supplier_external_id&&Number(p.supplier_available)===1&&Number(p.base_price)>0&&Number(p.margin)>=0&&!/picsum\.photos/i.test(p.image_url||''));
  const [old]=await db.query('SELECT * FROM bundles WHERE slug IN (?) FOR UPDATE',[prepared.map(p=>p.slug).concat(['paket-hemat-anak-kost','paket-bulanan-anak-kost','paket-hemat-1-minggu','paket-bulanan-rumah-tangga'])]);
  const [oldItems]=old.length?await db.query('SELECT * FROM bundle_items WHERE bundle_id IN (?)',[old.map(b=>b.id)]):[[]];
  const [promotions]=await db.query("SELECT * FROM promotions WHERE cta_url IN (?)",[['/paket/paket-hemat-anak-kost','/paket/paket-bulanan-anak-kost','/paket/paket-hemat-1-minggu','/paket/paket-bulanan-rumah-tangga']]);
  await backup({promotions,batchId:batch.id,bundles:old,items:oldItems,newSlugs:prepared.filter(p=>!old.some(b=>b.slug===p.slug)).map(p=>p.slug),newlyPublishedProductIds:[...new Set(publish.map(p=>p.id).concat(prepared.flatMap(p=>p.plan.missing.length?[]:p.items.filter(i=>!i.product.published_id).map(i=>i.product.id))))]});
  for(let i=0;i<publish.length;i+=250) {
   await db.query("INSERT INTO product_batch_prices (batch_id,product_id,base_price,margin,po_status,sort_order) VALUES ? ON DUPLICATE KEY UPDATE id=id",[publish.slice(i,i+250).map(p=>[batch.id,p.id,p.base_price,p.margin,'available',0])]);
  }
  for(let index=0;index<prepared.length;index++) {
   const p=prepared[index];
   if(!p.plan.missing.length) for(const item of p.items) {
    if(!item.product.published_id) await db.execute("INSERT INTO product_batch_prices (batch_id,product_id,base_price,margin,po_status,sort_order) VALUES (?,?,?,?,'available',0) ON DUPLICATE KEY UPDATE id=id",[batch.id,item.product.id,item.product.base_price,item.product.margin]);
   }
   const existing=old.find(b=>b.slug===p.slug);
   const fields=[p.name,p.tagline,p.description,JSON.stringify(p.plan),p.margin,index+10];
   let id;
   if(existing) {
    id=existing.id;
    await db.execute('UPDATE bundles SET name=?,tagline=?,description=?,plan=?,margin=?,sort_order=?,max_qty=5,image_url=NULL,is_active=1,deleted_at=NULL WHERE id=?',[...fields,id]);
   } else {
    const [r]=await db.execute('INSERT INTO bundles (name,tagline,description,plan,margin,sort_order,slug,max_qty,is_active) VALUES (?,?,?,?,?,?,?,5,1)',[...fields,p.slug]);id=r.insertId;
   }
   await db.execute('DELETE FROM bundle_items WHERE bundle_id=?',[id]);
   for(let j=0;j<p.items.length;j++) await db.execute('INSERT INTO bundle_items (bundle_id,product_id,qty,sort_order) VALUES (?,?,?,?)',[id,p.items[j].product.id,p.items[j].qty,j+1]);
  }
  // Archive the three previous mixed-purpose packages, without deleting their identity/order history.
  await db.execute('UPDATE bundles SET is_active=0 WHERE slug IN (?,?,?,?)',['paket-hemat-anak-kost','paket-bulanan-anak-kost','paket-hemat-1-minggu','paket-bulanan-rumah-tangga']);
  for(const slug of ['paket-hemat-anak-kost','paket-bulanan-anak-kost','paket-hemat-1-minggu','paket-bulanan-rumah-tangga']) {
   const next=slug==='paket-hemat-1-minggu'?'paket-weekly-dapur':'paket-monthly-dapur';
   await db.execute('UPDATE promotions SET cta_url=?,title=?,subtitle=? WHERE cta_url=?',['/paket/'+next,slug==='paket-hemat-1-minggu'?'Paket Dapur Mingguan':'Paket Dapur Bulanan','Pilih kebutuhan dapur sesuai rencana belanja.','/paket/'+slug]);
  }
  await db.commit();
  return {prepared,published:publish.length};
 } catch(e) {await db.rollback();throw e;}
}
async function main() {
 const args=process.argv.slice(2);
 if(args.length!==1||!['--schema-only','--preview','--apply'].includes(args[0])) throw new Error('Gunakan --schema-only, --preview, atau --apply.');
 const db=await require('mysql2/promise').createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,supportBigNumbers:true,bigNumberStrings:true});
 try {
  if(args[0]!=='--preview') await schema(db);
  if(args[0]==='--schema-only') {console.log('Kolom plan siap.');return;}
  await db.query("SET time_zone='+07:00'");
  let [batches]=await db.query("SELECT * FROM po_batches WHERE status='open' AND opens_at<=NOW() AND closes_at>=NOW() ORDER BY opens_at DESC LIMIT 1");
  if(!batches.length) [batches]=await db.query('SELECT * FROM po_batches ORDER BY opens_at DESC LIMIT 1');
  if(!batches.length) throw new Error('Batch preorder belum ada.');
  const batch=batches[0];
  const [products]=await db.query(`SELECT p.*,bp.id AS published_id,bp.base_price AS batch_base_price,bp.margin AS batch_margin,bp.max_qty,bp.po_status FROM products p LEFT JOIN product_batch_prices bp ON bp.product_id=p.id AND bp.batch_id=? WHERE p.is_active=1 AND p.deleted_at IS NULL AND p.merchant_id IS NULL`,[batch.id]);
  let prepared=plans(products);
  let published=0;
  if(args[0]==='--apply') { const result=await apply(db,batch,async snapshot=>{
   const fs=require('node:fs/promises');await fs.mkdir('uploads/bundle-default-backups',{recursive:true});
   await fs.writeFile(`uploads/bundle-default-backups/plans-${Date.now()}.json`,JSON.stringify(snapshot,null,2),{flag:'wx',mode:0o600});
  }); prepared=result.prepared;published=result.published; }
  console.table(prepared.map(p=>({paket:p.name,status:p.plan.missing.length?'Menunggu bahan':'Siap',kurang:p.plan.missing.join('; '),isi:p.items.map(i=>`${i.product.name} ×${i.qty}`).join('; ')})));
  console.log(JSON.stringify({batch:batch.code,jumlahPaket:prepared.length,produkKatalogDitambahkan:published,siap:prepared.filter(p=>!p.plan.missing.length).length,diterapkan:args[0]==='--apply'},null,2));
 }finally{await db.end();}
}
module.exports={plans,select,packSizes,eligible,apply,RECIPES};
if(require.main===module||process.argv[1]==='-') main().catch(e=>{console.error('Gagal:',e.message);process.exitCode=1;});
