ALTER TABLE products
  ADD COLUMN supplier_external_id VARCHAR(120) NULL AFTER supplier_id,
  ADD COLUMN supplier_available TINYINT(1) NOT NULL DEFAULT 1 AFTER supplier_external_id,
  ADD COLUMN supplier_last_seen_at DATETIME NULL AFTER supplier_available,
  ADD COLUMN supplier_last_synced_at DATETIME NULL AFTER supplier_last_seen_at;

CREATE UNIQUE INDEX uq_products_supplier_external_id ON products(supplier_id, supplier_external_id);
CREATE INDEX idx_products_supplier_availability ON products(supplier_id, supplier_available);

CREATE TABLE supplier_sync_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_id BIGINT UNSIGNED NOT NULL,
  status ENUM('started','success','partial','failed') NOT NULL DEFAULT 'started',
  source VARCHAR(80) NOT NULL DEFAULT 'n8n',
  products_received INT UNSIGNED NOT NULL DEFAULT 0,
  products_created INT UNSIGNED NOT NULL DEFAULT 0,
  products_updated INT UNSIGNED NOT NULL DEFAULT 0,
  products_unavailable INT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_supplier_sync_runs_supplier_started (supplier_id, started_at),
  CONSTRAINT fk_supplier_sync_runs_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
