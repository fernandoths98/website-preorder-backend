-- Update storefront delivery messaging to local-radius wording.
-- Apply once.

INSERT INTO app_settings (setting_key, setting_value)
VALUES
  ('storefront_ship_from_label', ''),
  ('storefront_free_delivery_text', 'Gratis ongkir hingga radius 5 km'),
  ('storefront_delivery_note', 'Untuk pesanan sekitar area layanan. Di luar radius 5 km, ongkir menyesuaikan.')
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value);
