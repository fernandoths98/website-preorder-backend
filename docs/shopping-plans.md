# Paket mingguan, bulanan, dan menu masakan

Paket dikelompokkan berdasarkan periode (`weekly`/`monthly`) dan kategori (`dapur`/`cleaning`/`kulkas`). Kulkas berisi pilihan menu dengan bahan, takaran per sesi, jumlah sesi, bahan yang disiapkan pembeli, urutan memasak, dan catatan penyimpanan. Semua pengiriman tetap sekali mengikuti batch preorder; bukan penagihan otomatis atau empat pengiriman.

Installer menyediakan sepuluh pilihan: Dapur, Cleaning, Ayam Goreng, Ayam Kecap, dan Sayur Sop untuk masing-masing periode. Menu mingguan berisi satu sesi; menu bulanan empat sesi. Ayam menggunakan kemasan mentah 700–1.000 g, dan nama/kuantitas kemasan aktual tetap ditampilkan. Persediaan dapur bulanan lebih besar, cleaning bulanan dua kemasan per jenis.

## Deploy setelah kedua PR di-merge

Jalankan installer **sebelum membangun API baru**, karena API baru membutuhkan kolom JSON `bundles.plan`. Installer menambah kolom secara idempotent, kemudian memperbarui paket dalam transaksi. Tidak perlu menghapus volume MySQL.

```bash
(
  set -e
  cd /var/www/backend
  git pull --ff-only origin main
  docker compose exec -T api node - --apply < scripts/install-shopping-plans.cjs
  docker compose up -d --build api
  docker compose ps

  cd /var/www/websitepreorder/frontend
  git pull --ff-only origin main
  npm ci
  npm run build
  docker compose up -d web
)
```

Installer memilih batch yang sama dengan katalog, mempublish record supplier aktif/tersedia yang belum memiliki harga batch menggunakan harga dan margin master. Record harga batch yang sudah ada, termasuk status hidden/sold_out, tidak ditimpa. Produk yang dipakai oleh paket lengkap juga dipublish jika diperlukan. Produk nonaktif, terhapus, UMKM, stok supplier kosong, atau gambar seed demo tidak diaktifkan.

Tiga paket lama dengan slug default diarsipkan; produk, riwayat order, dan paket kustom lain tidak dihapus. Link banner lama diperbarui ke pilihan Dapur yang sesuai. Salinan paket/membership/banner dan daftar ID publish baru tersimpan di `uploads/bundle-default-backups/plans-*.json` sebelum mutasi.

Jika ayam/sayuran/bumbu tidak ditemukan, installer tetap memasang menu beserta resep. Paket tersebut ditandai belum lengkap, menampilkan kebutuhan yang kurang, tidak menampilkan harga parsial sebagai harga final, dan ditolak di keranjang/checkout. Tambahkan produk asli lewat admin Produk dengan harga/ukuran/ketersediaan supplier yang benar; admin Paket dapat memilihnya, melengkapi resep dan menghapus daftar kebutuhan yang telah terpenuhi. Publish produk ke batch melalui alur admin yang ada.

Installer dapat dijalankan ulang, tetapi akan menyusun ulang sepuluh paket default dari katalog terbaru. Gunakan editor admin untuk perubahan kustom yang ingin dipertahankan. Kategori kosong dan kegagalan request memiliki pesan serta tombol retry; gambar produk gagal dimuat memiliki fallback.

`--preview` hanya membaca tanpa perubahan. `--schema-only` hanya memastikan kolom metadata tersedia. Pada instalasi baru, SQL `db/init/03-bundles.sql` juga sudah mencakup kolom ini.

## Validasi

```bash
node scripts/shopping-plans.test.cjs
npm test -- --runInBand src/modules/bundles
npm run build
```

Frontend: `node scripts/test-shopping-plans.cjs`, `npm run test:bundles`, `npm run build`. Pengujian DB menggunakan adapter mock; stock dan harga produksi ditentukan saat installer dijalankan di VPS.
