# Default Paket Bulanan Anak Kost

Jalankan installer satu kali untuk mengganti isi paket Anak Kost yang lama menggunakan produk asli dalam master katalog. Tidak perlu mengisi produk satu per satu melalui form admin.

Default:

| Kebutuhan | Jumlah |
| --- | --- |
| Beras | sekitar 5 kg; beras putih diutamakan, beras merah jika putih tidak tersedia |
| Minyak goreng | sekitar 1 L; dibulatkan ke kemasan penuh |
| Gula pasir | sekitar 1 kg |
| Mi instan | 6 bungkus satuan |
| Sabun cuci piring | 1 kemasan 450–1.000 ml, terdekat ke 750 ml |
| Deterjen bubuk | 1 kemasan 500–1.500 g, terdekat ke 900 g |

Nama dan SKU yang benar-benar dipilih, jumlah, dan harga dicetak setelah installer selesai. Harga memakai batch berjalan jika tersedia, atau harga master untuk produk yang baru dipublish. Margin paket maksimal Rp2.500 dan selalu dibatasi di bawah total margin satuan. Produk demo, produk merchant, kemasan karton/multipack, produk nonaktif/dihapus, supplier-unavailable, sold-out/hidden dan batas jumlah yang tidak cukup tidak dipilih.

## Pasang di VPS

Setelah PR digabungkan:

```bash
(
  set -e
  cd /var/www/backend
  git pull --ff-only origin main
  docker compose exec -T api node - --apply < scripts/apply-anak-kost-default.cjs
)
```

Tidak perlu rebuild backend atau frontend; script dijalankan melalui stdin di container API yang sudah healthy. Environment koneksi MySQL dan dependency `mysql2` menggunakan milik container tersebut.

Installer memilih batch yang sama dengan `BatchesService.current()`. Paket yang sudah ada mempertahankan ID, slug/link, gambar, dan urutan. Isinya diganti dengan enam jenis kebutuhan di atas. Batch-price rows yang belum ada dibuat untuk produk terpilih; harga/status/limit yang sudah ada tetap dipakai. Banner promo dengan link relatif persis ke paket tersebut mendapat judul dan subtitle baru, tanpa klaim harga lama di bawah Rp50rb.

Perubahan disimpan dalam satu transaksi. Jika salah satu jenis produk/ukuran tidak ada, tidak ada batch, paket ambigu, atau penyimpanan gagal, transaksi dibatalkan. Salinan isi paket dan banner lama disimpan di `uploads/bundle-default-backups/` sebelum perubahan. Berkas ini tidak berisi kredensial database.

Preview tanpa perubahan, jika ingin melihat produk sebelum memasang:

```bash
docker compose exec -T api node - --preview < scripts/apply-anak-kost-default.cjs
```

Setelah output memuat `diterapkan: true`, refresh website. Jika batch tidak `open`, pemesanan tetap mengikuti jadwal preorder. Istilah bulanan menunjukkan paket belanja; bukan langganan/penagihan berulang atau jaminan semua kebutuhan makan selama 30 hari.

## Pengujian

```bash
node scripts/anak-kost-default.test.cjs
node --check scripts/apply-anak-kost-default.cjs
```

13 tes mencakup komposisi paket, fallback beras merah sesuai ketersediaan katalog, prioritas beras putih, ukuran/jumlah, produk cleaning yang salah, data demo, stok/status/limit, harga batch, margin, urutan deterministik, preview tanpa write, apply/publish, pemasangan ulang, backup dan rollback. Query database diuji melalui adapter mock; script belum dijalankan pada database produksi.
