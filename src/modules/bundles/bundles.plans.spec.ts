import { BundlesService } from './bundles.service';
import { PoStatus } from '../products/entities/product-batch-price.entity';

const bundle = {id:'1',slug:'menu',name:'Menu',margin:1000,maxQty:5,plan:{period:'weekly',category:'kulkas',missing:[],recipe:{steps:['Masak']}}};
function fixture(rows: any[], plan = bundle.plan) {
 const query: any = {};
 for(const method of ['withDeleted','innerJoin','leftJoin','where','andWhere','orderBy','select','setParameter'])query[method]=jest.fn(()=>query);
 query.getRawMany=jest.fn(async()=>rows);
 const service=new BundlesService({find:jest.fn(async()=>[{...bundle,plan}])} as any,{createQueryBuilder:jest.fn(()=>query)} as any,{} as any,{resolveOpenBatchId:async()=> '1'} as any);
 return service;
}
const row={bundleId:'1',productId:'2',sku:'C',slug:'chicken',name:'Ayam',unit:'pcs',imageUrl:null,qty:2,basePrice:'20000',margin:'2000',published:1,poStatus:PoStatus.AVAILABLE,maxQty:3};
it('returns an incomplete menu and recipe even when no products exist',async()=>{
 const s=fixture([],{...bundle.plan,missing:['Ayam']});const [v]=await s.findAll();expect(v.complete).toBe(false);expect(v.poStatus).toBe('sold_out');expect(v.blockedBy[0]).toContain('Ayam');expect(v.plan?.recipe).toBeDefined();
});
it('does not let a partially configured menu be bought',async()=>{
 const [v]=await fixture([row],{...bundle.plan,missing:['Bumbu']}).findAll();expect(v.poStatus).toBe('sold_out');expect(v.complete).toBe(false);
});
it('derives per-order cap from actual member quantities',async()=>{
 const [v]=await fixture([row]).findAll();expect(v.maxQty).toBe(1);expect(v.poStatus).toBe('available');
});
it('blocks an inactive/supplier-unavailable member rather than silently dropping it',async()=>{
 const [v]=await fixture([{...row,poStatus:PoStatus.SOLD_OUT}]).findAll();expect(v.members).toHaveLength(1);expect(v.poStatus).toBe('sold_out');expect(v.blockedBy.join(' ')).toContain('Ayam');
});
it('insufficient member limit blocks ordering even if supplier status is available',async()=>{
 const [v]=await fixture([{...row,maxQty:1}]).findAll();expect(v.poStatus).toBe('sold_out');expect(v.maxQty).toBe(0);
});
