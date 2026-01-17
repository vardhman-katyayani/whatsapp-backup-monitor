# WhatsApp Monitor Backend Server

Backend server for monitoring WhatsApp backups from 160+ sales team phones.

## Features

- 🔓 WhatsApp crypt15 backup decryption
- 📊 Admin dashboard for monitoring
- 🔄 Automated backup processing pipeline
- 📱 Support for 160+ phones
- 💾 Supabase integration for data storage
- 📈 Real-time sync logs and statistics

## Quick Start

```bash
# Install dependencies
npm install

# Create .env file (see DEPLOYMENT.md)
cp .env.example .env

# Start server
npm start
```

## Project Structure

```
server/
├── index.js              # Express server entry point
├── routes/
│   ├── api.js           # API endpoints (upload, health)
│   └── admin.js         # Admin dashboard API
├── services/
│   ├── decryptor.js     # WhatsApp backup decryption
│   ├── parser.js        # SQLite database parsing
│   └── supabase.js      # Supabase client & operations
└── admin/
    ├── index.html       # Admin dashboard UI
    ├── css/
    └── js/
```

## API Documentation

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full API documentation.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment instructions.

## License

Private - Internal Use Only
