-- Curated storefront image for Ayam Goreng Bawang Putih Bang Gendoet.
-- Apply once.

UPDATE products
SET image_url = '/api/v1/product-media/ayam-goreng-bawang-putih-bang-gendoet-m1.svg'
WHERE slug = 'ayam-goreng-bawang-putih-bang-gendoet-m1';

UPDATE product_images pi
INNER JOIN products p ON p.id = pi.product_id
SET pi.image_url = '/api/v1/product-media/ayam-goreng-bawang-putih-bang-gendoet-m1.svg'
WHERE p.slug = 'ayam-goreng-bawang-putih-bang-gendoet-m1'
  AND pi.is_primary = 1;
