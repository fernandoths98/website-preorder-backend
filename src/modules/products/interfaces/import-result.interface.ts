export type RowAction = 'create' | 'update' | 'error';

export interface ImportRowResult {
  /** Index in the uploaded file, so the UI can point at the right line. */
  index: number;
  action: RowAction;
  errors: string[];
  warnings: string[];
  /** Coerced values — what would actually be written. */
  data: {
    sku: string;
    name: string;
    slug: string;
    category: string | null;
    unit: string;
    imageUrl: string | null;
    basePrice: number;
    margin: number;
    sellingPrice: number;
    maxQty: number | null;
    poStatus: string;
  } | null;
  /** Current values when the SKU already exists, for a before/after diff. */
  existing: { name: string; basePrice: number; margin: number } | null;
}

export interface ImportPreview {
  batchId: string;
  batchCode: string;
  rows: ImportRowResult[];
  summary: {
    total: number;
    create: number;
    update: number;
    error: number;
    totalModal: number;
    totalMargin: number;
  };
}

export interface ImportCommitResult {
  created: number;
  updated: number;
  published: number;
  skipped: number;
}
