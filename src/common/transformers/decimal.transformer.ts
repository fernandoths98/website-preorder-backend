import { ValueTransformer } from 'typeorm';

/** mysql2 returns DECIMAL as string; keep IDR as a safe integer-scaled number. */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
