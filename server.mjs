/**
 * Entrypoint startup untuk cPanel "Setup Node.js App" (Phusion Passenger) dan npm start.
 * Arahkan "Application startup file" di cPanel ke: server.mjs
 */
import { startServer } from './server/dist/index.js';

startServer();
