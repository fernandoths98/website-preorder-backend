import { BundlesAdminService } from './bundles.admin.service';
import { QueryBundleProductsDto } from './dto/query-bundle-products.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

function builder(rows: unknown[] = [], total = rows.length) {
  const qb: any = { getManyAndCount: jest.fn().mockResolvedValue([rows, total]) };
  for (const key of ['withDeleted', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[key] = jest.fn().mockReturnValue(qb);
  return qb;
}
function service(products: any = {}, bundles: any = {}, items: any = {}, pricing: any = {}, dataSource: any = {}) {
  return new BundlesAdminService(bundles, items, products, pricing,
    { resolveOpenBatchId: jest.fn().mockResolvedValue('8') } as any, dataSource);
}

describe('bundle editor catalog', () => {
  it('searches master products without batch publication and pages beyond 100 products', async () => {
    const qb = builder([{ id: '2501', name: 'Sabun Cuci Piring', sku: 'CP', unit: 'pcs', basePrice: '9000', margin: '2000', isActive: true, deletedAt: null, merchantId: null }], 2712);
    const api = service({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
    const result = await api.findProducts(Object.assign(new QueryBundleProductsDto(), { q: 'cuci', page: 3, limit: 50 }));
    expect(qb.skip).toHaveBeenCalledWith(100);
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('LIKE :keyword'), { keyword: '%cuci%' });
    expect(result.meta).toEqual({ page: 3, limit: 50, total: 2712, totalPages: 55 });
    expect(result.data[0]).toMatchObject({ productId: '2501', selectable: true, basePrice: 9000, margin: 2000 });
  });
  it('resolves selected inactive/deleted members by IDs independently of search', async () => {
    const qb = builder([{ id: 140, name: 'Deterjen', sku: 'DT', unit: 'pcs', basePrice: 12000, margin: 2000, isActive: false, deletedAt: new Date(), merchantId: null }]);
    const result = await service({ createQueryBuilder: jest.fn().mockReturnValue(qb) })
      .findProducts(Object.assign(new QueryBundleProductsDto(), { ids: '140,2501', q: 'unrelated' }));
    expect(qb.withDeleted).toHaveBeenCalled();
    expect(qb.where).toHaveBeenCalledWith('p.id IN (:...ids)', { ids: ['140', '2501'] });
    expect(qb.andWhere).not.toHaveBeenCalled();
    expect(result.data[0]).toMatchObject({ productId: '140', selectable: false });
  });
  it('preserves full contents, inactive state and sort order without a priced projection', async () => {
    const api = service({}, { find: jest.fn().mockResolvedValue([{ id: '1', slug: 'kost', name: 'Kost', isActive: false, sortOrder: 7, margin: 1000 }]) },
      { find: jest.fn().mockResolvedValue([{ bundleId: '1', productId: '140', qty: 2, sortOrder: 3 }]) },
      { priceByIds: jest.fn().mockResolvedValue(new Map()) });
    expect((await api.findAll())[0]).toMatchObject({ bundleId: '1', isActive: false, sortOrder: 7,
      adminItems: [{ productId: '140', qty: 2, sortOrder: 3 }] });
  });
  it('can deactivate a bundle and return its saved contents without a post-write 404', async () => {
    const bundle = { id: '1', slug: 'kost', name: 'Kost', isActive: true, sortOrder: 7, margin: 1000 };
    const items = [{ bundleId: '1', productId: '140', qty: 2, sortOrder: 1 }];
    const saved = jest.fn().mockResolvedValue(bundle);
    const api = service({ find: jest.fn().mockResolvedValue([{ id: '140', margin: 2000 }]) },
      { findOne: jest.fn().mockResolvedValue(bundle), find: jest.fn().mockResolvedValue([bundle]) },
      { find: jest.fn().mockResolvedValue(items) }, { priceByIds: jest.fn().mockResolvedValue(new Map()) },
      { transaction: (fn: any) => fn({ getRepository: () => ({ save: saved }) }) });
    expect(await api.update('1', { isActive: false })).toMatchObject({ bundleId: '1', isActive: false,
      adminItems: [{ productId: '140', qty: 2, sortOrder: 1 }] });
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });
  it('validates pagination and selected-ID limits', async () => {
    expect(await validate(plainToInstance(QueryBundleProductsDto, { page: '2', limit: '50', ids: '140,2501' }))).toHaveLength(0);
    expect((await validate(plainToInstance(QueryBundleProductsDto, { page: 0, limit: 101, ids: '1 OR 1=1' }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(QueryBundleProductsDto, { ids: Array.from({ length: 31 }, (_, i) => i + 1).join(',') }))).length).toBeGreaterThan(0);
  });
});
