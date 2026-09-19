-- Market reference used by the pricing recommendation UI.
-- Apply once. Do not rerun after it succeeds.

ALTER TABLE `product_batch_prices`
  ADD COLUMN `market_reference_price` DECIMAL(12,2) NULL AFTER `margin`;
