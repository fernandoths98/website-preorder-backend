-- Merchant one-time account activation.
-- Apply once. Do not rerun after success.

ALTER TABLE merchants
  ADD COLUMN activation_token_hash CHAR(64) NULL AFTER password_hash,
  ADD COLUMN activation_expires_at DATETIME NULL AFTER activation_token_hash,
  ADD KEY idx_merchants_activation_token (activation_token_hash);
