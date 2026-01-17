import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Routes
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve admin dashboard static files
app.use('/admin', express.static(join(__dirname, 'admin')));

// API Routes
app.use('/api', apiRoutes);

// Admin page routes (serve HTML for SPA-like navigation)
app.get('/admin', (req, res) => res.sendFile(join(__dirname, 'admin', 'index.html')));
app.get('/admin/*', (req, res) => res.sendFile(join(__dirname, 'admin', 'index.html')));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root redirect to admin
app.get('/', (req, res) => res.redirect('/admin'));

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Export for Vercel serverless
export default app;

// Start server locally if not in Vercel
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     WhatsApp Monitor Backend Server                        ║
╠════════════════════════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}                            ║
║  📊 Admin Dashboard: http://localhost:${PORT}/admin            ║
║  🔌 API Endpoint: http://localhost:${PORT}/api                 ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}
