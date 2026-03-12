import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';

dotenv.config();

// Routes
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import messageRoutes from './routes/messages.js';
import agentRoutes from './routes/agent.js';
import chatRoutes from './routes/chat.js';
import authRoutes from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import { startCronJobs } from './cron/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve admin dashboard static files
app.use('/admin', express.static(join(__dirname, 'admin')));

// Serve agent portal static files
app.use('/portal', express.static(join(__dirname, 'portal')));

// Swagger API Docs
const swaggerOptions = {
  customSiteTitle: '📱 WhatsApp Monitor API',
  customfavIcon: 'https://em-content.zobj.net/source/apple/354/mobile-phone_1f4f1.png',
  customCss: `
    body { background: #0a0a0f; }
    .swagger-ui { font-family: 'Inter', 'JetBrains Mono', monospace; }
    .swagger-ui .topbar { background: linear-gradient(135deg, #0a0a0f 0%, #111827 100%); border-bottom: 1px solid #22c55e44; padding: 12px 0; }
    .swagger-ui .topbar-wrapper { gap: 16px; }
    .swagger-ui .topbar-wrapper .link { display: flex; align-items: center; gap: 10px; }
    .swagger-ui .topbar-wrapper .link::before { content: '📱 WhatsApp Monitor'; font-size: 20px; font-weight: 700; color: #22c55e; letter-spacing: -0.5px; }
    .swagger-ui .topbar-wrapper img { display: none; }
    .swagger-ui .topbar-wrapper input[type=search] { background: #1a1a2e; border: 1px solid #22c55e44; color: #e4e4e7; border-radius: 8px; padding: 8px 14px; }
    .swagger-ui .info { margin: 32px 0 24px; }
    .swagger-ui .info .title { color: #22c55e; font-size: 32px; font-weight: 800; }
    .swagger-ui .info .description p { color: #a1a1aa; font-size: 15px; }
    .swagger-ui .scheme-container { background: #111827; border: 1px solid #22c55e22; border-radius: 12px; box-shadow: none; padding: 16px 24px; }
    .swagger-ui .opblock-tag { background: #111827; border: 1px solid #1e293b; border-radius: 10px; margin: 8px 0; color: #e4e4e7; font-size: 15px; font-weight: 600; }
    .swagger-ui .opblock-tag:hover { background: #1a2435; border-color: #22c55e44; }
    .swagger-ui .opblock { border-radius: 10px; border: none; margin: 6px 0; box-shadow: 0 2px 8px #00000040; }
    .swagger-ui .opblock.opblock-get { background: #0c1a2e; border-left: 3px solid #3b82f6; }
    .swagger-ui .opblock.opblock-post { background: #0c1f0c; border-left: 3px solid #22c55e; }
    .swagger-ui .opblock.opblock-delete { background: #1f0c0c; border-left: 3px solid #ef4444; }
    .swagger-ui .opblock.opblock-put { background: #1f1a0c; border-left: 3px solid #f59e0b; }
    .swagger-ui .opblock .opblock-summary { padding: 10px 16px; }
    .swagger-ui .opblock .opblock-summary-method { border-radius: 6px; font-size: 12px; font-weight: 700; min-width: 70px; padding: 4px 8px; }
    .swagger-ui .opblock-get .opblock-summary-method { background: #3b82f6; }
    .swagger-ui .opblock-post .opblock-summary-method { background: #22c55e; }
    .swagger-ui .opblock-delete .opblock-summary-method { background: #ef4444; }
    .swagger-ui .opblock-put .opblock-summary-method { background: #f59e0b; }
    .swagger-ui .opblock .opblock-summary-path { color: #e4e4e7; font-size: 14px; font-weight: 500; }
    .swagger-ui .opblock .opblock-summary-description { color: #71717a; font-size: 13px; }
    .swagger-ui .opblock-body { background: #0d0d14; border-top: 1px solid #1e293b; }
    .swagger-ui .btn.execute { background: #22c55e; border-color: #22c55e; color: #000; font-weight: 700; border-radius: 8px; padding: 8px 24px; }
    .swagger-ui .btn.execute:hover { background: #16a34a; }
    .swagger-ui .btn.try-out__btn { background: transparent; border: 1px solid #22c55e; color: #22c55e; border-radius: 6px; }
    .swagger-ui .btn.cancel { background: transparent; border: 1px solid #ef4444; color: #ef4444; border-radius: 6px; }
    .swagger-ui select, .swagger-ui input[type=text], .swagger-ui textarea { background: #1a1a2e; border: 1px solid #334155; color: #e4e4e7; border-radius: 6px; }
    .swagger-ui .responses-inner h4, .swagger-ui .responses-inner h5 { color: #a1a1aa; }
    .swagger-ui .response-col_status { color: #22c55e; font-weight: 700; }
    .swagger-ui .microlight { background: #0d0d14 !important; color: #a3e635 !important; border-radius: 8px; padding: 12px; }
    .swagger-ui .model-box { background: #111827; border: 1px solid #1e293b; border-radius: 8px; }
    .swagger-ui section.models { background: #111827; border: 1px solid #1e293b; border-radius: 12px; }
    .swagger-ui .parameter__name { color: #38bdf8; font-weight: 600; }
    .swagger-ui .parameter__type { color: #a78bfa; }
    .swagger-ui table thead tr td, .swagger-ui table thead tr th { color: #71717a; border-bottom: 1px solid #1e293b; }
    .swagger-ui .highlight-code { background: #0d0d14; }
    .swagger-ui .renderedMarkdown p { color: #a1a1aa; }
  `,
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));

// Auth routes (public — no auth middleware)
app.use('/api/auth', authRoutes);

// All other API routes require SSO authentication
app.use('/api', requireAuth, apiRoutes);
app.use('/api', requireAuth, messageRoutes);
app.use('/api/agent', requireAuth, agentRoutes);
app.use('/api', requireAuth, chatRoutes);

// Admin login page (public)
app.get('/admin/login.html', (req, res) => res.sendFile(join(__dirname, 'admin', 'login.html')));
// Admin dashboard (auth guard is in the HTML itself)
app.get('/admin', (req, res) => res.sendFile(join(__dirname, 'admin', 'index.html')));
app.get('/admin/*', (req, res) => {
  const file = req.path.replace('/admin/', '');
  if (['login.html', 'js/app.js', 'css/admin.css'].some(f => req.path.endsWith(f))) return;
  res.sendFile(join(__dirname, 'admin', 'index.html'));
});

// Agent portal
app.get('/portal', (_req, res) => res.sendFile(join(__dirname, 'portal', 'index.html')));
app.get('/portal/*', (_req, res) => res.sendFile(join(__dirname, 'portal', 'index.html')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cron: 'active',
    ai: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not configured',
    drive: process.env.GOOGLE_CLIENT_ID ? 'configured' : 'not configured'
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
║  🔌 API Endpoint:    http://localhost:${PORT}/api               ║
║  🤖 AI Analysis:     ${process.env.ANTHROPIC_API_KEY ? '✅ configured' : '❌ set ANTHROPIC_API_KEY'}          ║
║  ☁️  Google Drive:    ${process.env.GOOGLE_CLIENT_ID ? '✅ configured' : '❌ set GOOGLE_CLIENT_ID'}           ║
╚════════════════════════════════════════════════════════════╝
    `);

    // Start cron jobs
    startCronJobs();
  });
}
