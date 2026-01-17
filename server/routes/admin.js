import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Admin routes are handled by static file serving in index.js
// This file is for any admin-specific API routes if needed in the future

export default router;
