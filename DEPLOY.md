# Deploy backend ke VPS (Docker Compose + OpenLiteSpeed)

Stack: MySQL 8.4 + NestJS di Docker, OpenLiteSpeed sebagai reverse proxy.
Tidak ada port yang dibuka ke publik — semua di-bind ke `127.0.0.1`, OLS yang
menghadap internet.

## 0. Prasyarat di VPS

```bash
docker --version && docker compose version   # Docker Engine + plugin compose
```

Kalau belum ada:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # logout-login setelah ini
```

## 1. Ambil kode

```bash
sudo mkdir -p /var/www/websitepreorder && sudo chown $USER:$USER /var/www/websitepreorder
cd /var/www/websitepreorder
git clone https://github.com/fernandoths98/website-preorder-backend.git backend
cd backend
git checkout feat/paket-bundle     # atau main, setelah PR di-merge
```

## 2. Isi environment

```bash
cp .env.example .env
openssl rand -base64 48            # tempel hasilnya ke JWT_SECRET
nano .env
```

Yang wajib diisi: `DB_ROOT_PASS`, `DB_USER`, `DB_PASS`, `JWT_SECRET`
(minimal 32 karakter — app menolak start kalau kurang), `CORS_ORIGINS`,
`WA_ADMIN_PHONE`.

```bash
chmod 600 .env
```

## 3. Cek isi database sebelum boot pertama

`db/init/` dijalankan **sekali saja**, waktu volume MySQL masih kosong, urut
nama file:

| File | Isi |
|---|---|
| `01-schema.sql` | tabel + view. Wajib. |
| `02-seed.sql` | **data demo** — 12 produk picsum, 1 batch OPEN, supplier dummy. |
| `03-bundles.sql` | tabel `bundles`, `bundle_items`, view harga paket. Wajib. |
| `04-seed-bundles.sql` | 3 paket + 10 produk anggotanya (harga placeholder). |

Kalau mau katalog kosong dari awal, hapus `02-seed.sql` **sebelum** boot
pertama. Tapi perhatikan: `04-seed-bundles.sql` mencocokkan anggota paket lewat
SKU dari `02-seed.sql` (`MYK-GRG-2`, `GLA-PSR-1`, `TPG-TRG-1`, `SUS-KTL-370`).
Tanpa `02`, keempat SKU itu tidak ketemu dan paketnya masuk dengan isi tidak
lengkap — tanpa error. Jadi hapus `04` juga, lalu buat paketnya lewat
`/admin/bundles` setelah katalog asli diimpor.

## 4. Jalankan

```bash
docker compose up -d --build
docker compose ps           # mysql harus "healthy" sebelum api start
docker compose logs -f api  # tunggu "API on http://0.0.0.0:3000/api/v1"
```

Tes dari VPS:

```bash
curl -s http://127.0.0.1:3000/api/v1/batches/current | head -c 300
```

## 5. Bikin akun admin

Belum ada admin sama sekali — `admin_users` kosong. Hash password-nya pakai
argon2 yang sudah jadi dependency aplikasi:

```bash
docker compose exec api node -e "require('argon2').hash(process.argv[1]).then(console.log)" 'PasswordAdminKamu'
```

Tempel hash-nya:

```bash
docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASS" "$DB_NAME" <<'SQL'
INSERT INTO admin_users (email, password_hash, role)
VALUES ('kamu@email.com', '<TEMPEL_HASH_DI_SINI>', 'owner')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);
SQL
```

## 6. OpenLiteSpeed

Salin isi `deploy/openlitespeed-vhost.conf` ke vhost kamu:

```bash
sudo nano /usr/local/lsws/conf/vhosts/<NAMA_VHOST>/vhconf.conf
```

Lewat WebAdmin (port 7080) urutannya: **Virtual Hosts → <vhost> → External
App → Add → type `Web Server`**, name `wpoApi`, address `127.0.0.1:3000`.
Lalu **Context → Add → type `Proxy`**, URI `/api/`, Web Server `wpoApi`.

Terakhir: **Actions → Graceful Restart**.

Penting: jangan me-rewrite atau memotong `/api` di OLS. Prefix `/api/v1`
dimiliki aplikasi (`app.setGlobalPrefix` di `src/main.ts`) — kalau dipotong,
semua request jadi 404.

Tes dari luar:

```bash
curl -s https://websitepreorder.online/api/v1/batches/current | head -c 300
```

## 7. Update berikutnya

```bash
cd /var/www/websitepreorder/backend
git pull
docker compose up -d --build
docker compose logs -f api
```

Volume MySQL tidak tersentuh, jadi data aman.

## Migrasi ke database yang sudah jalan

`db/init/` hanya untuk volume baru. Kalau MySQL-nya sudah berisi data,
jalankan manual:

```bash
docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASS" "$DB_NAME" < db/init/03-bundles.sql
docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASS" "$DB_NAME" < db/init/04-seed-bundles.sql
```

`db/migrations/002-delivery-address.sql` hanya untuk database yang dibuat
sebelum kolom alamat ada — schema `01` sekarang sudah memuatnya.

## Backup

```bash
docker compose exec -T mysql mysqldump -u root -p"$DB_ROOT_PASS" \
  --single-transaction --routines "$DB_NAME" | gzip > wpo-$(date +%F).sql.gz
```

Taruh di cron harian sebelum PO dibuka.

## Kalau bermasalah

| Gejala | Kemungkinan |
|---|---|
| `api` restart terus | `.env` kurang lengkap. `docker compose logs api` menyebut variabel mana. |
| `ECONNREFUSED mysql:3306` | MySQL belum healthy. Cek `docker compose logs mysql`. |
| 404 di semua endpoint lewat domain | `/api` ke-rewrite di OLS. Hapus rewrite-nya. |
| 502 dari OLS | Container `api` mati, atau address external app bukan `127.0.0.1:3000`. |
| CORS error di browser | `CORS_ORIGINS` tidak sama persis dengan origin frontend (skema + host, tanpa trailing slash). |


## Upload media permissions

The API image runs as the non-root `node` user (UID/GID 1000). Because
`./uploads:/app/uploads` is a bind mount, the host directory must be writable
by UID 1000 before merchant product/banner uploads can succeed.

```bash
cd /var/www/backend
sudo mkdir -p uploads/products uploads/banners
sudo chown -R 1000:1000 uploads
sudo chmod -R u+rwX,go+rX uploads
```

Verify from inside the API container without exposing application secrets:

```bash
docker compose exec api sh -lc '
id
ls -ld /app/uploads /app/uploads/products /app/uploads/banners
test -w /app/uploads && echo "uploads writable" || echo "uploads NOT writable"
test -w /app/uploads/products && echo "products writable" || echo "products NOT writable"
test -w /app/uploads/banners && echo "banners writable" || echo "banners NOT writable"
'
```
