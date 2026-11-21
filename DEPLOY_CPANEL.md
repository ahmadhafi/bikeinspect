# Panduan Lengkap Deploy ke cPanel (`galaxyfleet.web.id/bikeinspect`)

## Klarifikasi: Subpath vs Subdomain
- **`https://galaxyfleet.web.id/bikeinspect`** adalah **subpath (Application URI)**, **BUKAN** subdomain. Anda **tidak perlu** membuat subdomain di cPanel untuk alamat ini — cukup isi `bikeinspect` di kolom **Application URL** pada **Setup Node.js App**.
- **`https://bikeinspect.galaxyfleet.web.id`** adalah **subdomain** (dibuat lewat menu **Domains → Create A New Domain**). Keduanya didukung oleh aplikasi ini!

---

## Langkah demi Langkah Deploy ke `https://galaxyfleet.web.id/bikeinspect`

### Langkah 1 — Clone Repository GitHub di cPanel
1. Masuk ke **cPanel** → buka **Git™ Version Control**.
2. Klik **Create**.
3. Isi:
   - **Clone a Repository**: Aktif (ON)
   - **Clone URL**: `https://github.com/ahmadhafi/bikeinspect.git`
   - **Repository Path**: `bikeinspect` *(akan tersimpan di `/home/<cpanel_user>/bikeinspect`, aman di luar `public_html`)*
   - **Repository Name**: `bikeinspect`
4. Klik **Create**.

### Langkah 2 — Siapkan File `.env`
1. Buka **cPanel → File Manager**, masuk ke folder `/home/<cpanel_user>/bikeinspect`.
2. Klik kanan file **`.env.cpanel`** → **Copy** menjadi **`.env`** (di folder yang sama).
3. Klik kanan **`.env`** → **Edit**:
   - Pastikan `DISABLE_AUTH=true` (mode cepat tanpa login; cukup ketik **Nama Pemeriksa** di bagian atas aplikasi).
   - Pastikan `APP_BASE_PATH=/bikeinspect` dan `APP_BASE_URL=https://galaxyfleet.web.id/bikeinspect`.
   - Ganti `SESSION_SECRET` dan `SIGNED_URL_SECRET` dengan string acak panjang (minimal 32 karakter).
4. Klik **Save Changes**.

*(Server Node.js 22 membaca file `.env` secara otomatis saat dijalankan!)*

### Langkah 3 — Buat Node.js App di cPanel
1. Buka **cPanel → Setup Node.js App**.
2. Klik **Create Application**.
3. Isi persis seperti berikut:
   - **Node.js version**: `22.x` *(wajib 22.5+ untuk `node:sqlite`)*
   - **Application mode**: `Production`
   - **Application root**: `bikeinspect`
   - **Application URL**: pilih `galaxyfleet.web.id` di dropdown, lalu ketik `bikeinspect` di kotak sebelahnya
   - **Application startup file**: `server.mjs`
4. Klik **Create**.
5. Setelah dibuat, **jangan hapus** file `.htaccess` yang otomatis dibuat cPanel di `public_html/bikeinspect/.htaccess` (itu yang menghubungkan Apache/Passenger ke Node.js).

### Langkah 4 — Instal Dependensi & Build Aplikasi
1. Pada bagian atas halaman **Setup Node.js App**, salin perintah virtual environment (seperti `source /home/<cpanel_user>/nodevenv/bikeinspect/22/bin/activate && cd /home/<cpanel_user>/bikeinspect`).
2. Buka **cPanel → Terminal**, tempel perintah tersebut lalu tekan Enter.
3. Jalankan dua perintah ini:
   ```bash
   npm run install:all
   npm run build:cpanel
   ```
   *(Tunggu sampai selesai — database SQLite dan data contoh termasuk plat `B 1234 KSP` otomatis dibuat saat server pertama kali menyala.)*

### Langkah 5 — Restart & Aktifkan HTTPS
1. Kembali ke **cPanel → Setup Node.js App** → klik **Restart**.
2. Pastikan **SSL/TLS (AutoSSL)** aktif untuk `galaxyfleet.web.id` agar kamera belakang ponsel (`facingMode: environment`) bisa dibuka di browser.
3. Buka **`https://galaxyfleet.web.id/bikeinspect`** di browser ponsel atau komputer Anda!

---

## (Opsional) Jika Ingin Memakai Subdomain `bikeinspect.galaxyfleet.web.id`
1. Buat subdomain `bikeinspect.galaxyfleet.web.id` di **cPanel → Domains**.
2. Di `.env`, ubah:
   - `APP_BASE_PATH=` *(kosongkan)*
   - `APP_BASE_URL=https://bikeinspect.galaxyfleet.web.id`
3. Di **Setup Node.js App**, pilih `bikeinspect.galaxyfleet.web.id` dengan kolom subpath kosong.
4. Build menggunakan `npm run build` (bukan `build:cpanel`), lalu klik **Restart**.
