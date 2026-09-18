import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import slugify from 'slugify';
import { Supplier } from './entities/supplier.entity';
import { SupplierSyncRun, SupplierSyncStatus } from './entities/supplier-sync-run.entity';
import { SupplierSyncDto } from './dto/supplier-sync.dto';
import { Product } from '../products/entities/product.entity';
import { PoStatus, ProductBatchPrice } from '../products/entities/product-batch-price.entity';
import { BatchesService } from '../batches/batches.service';

@Injectable()
export class SupplierSyncService {
  constructor(@InjectRepository(Supplier) private suppliers: Repository<Supplier>, @InjectRepository(SupplierSyncRun) private runs: Repository<SupplierSyncRun>, private dataSource: DataSource, private batches: BatchesService) {}

  async reconcile(dto: SupplierSyncDto) {
    const supplier = await this.suppliers.findOneBy({ id: String(dto.supplierId) });
    if (!supplier) throw new NotFoundException('Supplier tidak ditemukan');
    const run = await this.runs.save(this.runs.create({ supplierId: supplier.id, source: dto.source || 'n8n', productsReceived: dto.products.length }));
    try {
      const batch = await this.batches.current(); const now = new Date(); let created=0, updated=0, unavailable=0;
      await this.dataSource.transaction(async m => {
        const products=m.getRepository(Product), prices=m.getRepository(ProductBatchPrice); const seen:string[]=[];
        for (const row of dto.products) {
          seen.push(row.externalId); const available=row.available !== false; const margin=row.margin ?? 2000;
          let p=await products.findOne({where:{supplierId:supplier.id,supplierExternalId:row.externalId} as any});
          if (!p) { let slug=slugify(row.name,{lower:true,strict:true}); const collision=await products.findOneBy({slug}); if(collision) slug=slug+'-'+slugify(row.sku,{lower:true,strict:true}); p=products.create({supplierId:supplier.id,supplierExternalId:row.externalId,sku:row.sku.trim().toUpperCase(),slug,name:row.name,category:row.category||null,unit:row.unit||'pcs',imageUrl:row.imageUrl||null,basePrice:row.basePrice,margin,isActive:true,supplierAvailable:available,supplierLastSeenAt:now,supplierLastSyncedAt:now} as any); await products.save(p); created++; }
          else { p.sku=row.sku.trim().toUpperCase(); p.name=row.name; p.category=row.category||null; p.unit=row.unit||'pcs'; if(row.imageUrl)p.imageUrl=row.imageUrl; p.basePrice=row.basePrice; p.margin=margin; p.supplierAvailable=available; p.supplierLastSeenAt=now; p.supplierLastSyncedAt=now; await products.save(p); updated++; }
          await prices.upsert({batchId:batch.id,productId:p.id,basePrice:row.basePrice,margin,maxQty:row.maxQty??null,poStatus:available?PoStatus.AVAILABLE:PoStatus.SOLD_OUT},{conflictPaths:['batchId','productId']});
        }
        const qb=products.createQueryBuilder().update(Product).set({supplierAvailable:false,supplierLastSyncedAt:now} as any).where('supplier_id = :sid',{sid:supplier.id}); if(seen.length)qb.andWhere('supplier_external_id NOT IN (:...seen)',{seen}); const result=await qb.execute(); unavailable=result.affected||0;
        await prices.createQueryBuilder().update(ProductBatchPrice).set({poStatus:PoStatus.SOLD_OUT}).where('batch_id = :bid',{bid:batch.id}).andWhere('product_id IN (SELECT id FROM products WHERE supplier_id = :sid AND supplier_available = 0)',{sid:supplier.id}).execute();
      });
      run.status=SupplierSyncStatus.SUCCESS; run.productsCreated=created; run.productsUpdated=updated; run.productsUnavailable=unavailable; run.finishedAt=new Date(); await this.runs.save(run); return {runId:run.id,status:run.status,received:dto.products.length,created,updated,unavailable};
    } catch(e) { run.status=SupplierSyncStatus.FAILED; run.errorMessage=e instanceof Error?e.message:String(e); run.finishedAt=new Date(); await this.runs.save(run); throw e; }
  }
  latest(limit=20){return this.runs.find({relations:{supplier:true},order:{startedAt:'DESC'},take:Math.min(Math.max(limit,1),100)});}
}
