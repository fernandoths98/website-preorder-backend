-- Payment observability + reconciliation audit fields.
-- Apply once. Do not rerun after it succeeds.

ALTER TABLE `payments`
  ADD COLUMN `provider_status` VARCHAR(16) NULL AFTER `status`,
  ADD COLUMN `last_provider_check_at` DATETIME NULL AFTER `provider_status`,
  ADD COLUMN `reconciled_at` DATETIME NULL AFTER `last_provider_check_at`,
  ADD COLUMN `reconciliation_source` VARCHAR(32) NULL AFTER `reconciled_at`,
  ADD KEY `idx_payments_provider_status` (`provider_status`),
  ADD KEY `idx_payments_last_provider_check` (`last_provider_check_at`);
