/**
 * Entrypoint startup untuk cPanel "Setup Node.js App" (LiteSpeed lsnode & Phusion Passenger).
 * Menggunakan CommonJS (.cjs) agar 100% kompatibel dengan loader cPanel tanpa error ERR_REQUIRE_ESM.
 * Arahkan "Application startup file" di cPanel ke: app.cjs
 */
import('./server/dist/index.js')
  .then(({ startServer }) => {
    startServer();
  })
  .catch((err) => {
    console.error('[SIK FATAL] Gagal memuat server:', err);
    process.exit(1);
  });
