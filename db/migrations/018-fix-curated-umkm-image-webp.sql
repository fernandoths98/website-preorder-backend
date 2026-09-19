-- Replace the broken SVG wrapper URL with the decoded real WebP.
-- Apply once after deploying the backend runtime decoder.

UPDATE products
SET image_url = '/api/v1/product-media/ayam-goreng-bawang-putih-bang-gendoet-m1.webp'
WHERE slug = 'ayam-goreng-bawang-putih-bang-gendoet-m1';

UPDATE product_images pi
INNER JOIN products p ON p.id = pi.product_id
SET pi.image_url = '/api/v1/product-media/ayam-goreng-bawang-putih-bang-gendoet-m1.webp'
WHERE p.slug = 'ayam-goreng-bawang-putih-bang-gendoet-m1'
  AND pi.is_primary = 1;
