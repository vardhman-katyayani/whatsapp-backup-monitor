# WhatsApp Backup Monitor — AGENTS.md

## Project Overview
WhatsApp backup monitor that decrypts `.crypt15` backup files from employee phones, parses SQLite databases, and stores messages in Supabase for analysis. Built with Express.js backend + admin dashboard.

### Architecture
- **Backend**: Express.js server (`server/index.js`) — routes for API, admin, agent portal, chat, messages
- **Decryption**: `server/services/decryptor.js` — crypt15 AES-256-GCM decryption with HKDF key derivation
- **Drive Access**: `server/services/drive.js` — GCP service account + OAuth2 fallback for downloading backups from Google Drive
- **Storage**: Supabase (`https://qxsauwrxaamcerrvznhp.supabase.co`) — tables: `phones`, `chats`, `messages`, `pipeline_logs`, `ai_insights`
- **Parser**: `server/services/parser.js` — SQLite message extraction
- **AI**: `server/services/ai.js` — Anthropic-powered chat analysis

### Key Files
- `server/service_account.json` — GCP service account for `wa-analysis-engine` project
- `key.txt` — Generic encryption key (706ded8a...)
- `drive_decrypt.py` — Python script to download from Google Drive + decrypt
- `decrypt_downloaded.py` — Decrypts downloaded `.crypt15` files using `wa-crypt-tools`

### Encryption Keys
| Owner | Key (hex, 64 chars) | Status |
|---|---|---|
| Priya Mishra | `aca75852758afeaad9c5b1ed81b889daf16b77600c028e33aebb153214ce839a` | VERIFIED working |
| Generic (key.txt) | `706ded8a9699c258dd3d441dacf1e98c4ca86358d5f3f21a8b766ec0bbbe6385` | Does NOT work for Priya's backups |

### Supabase Schema
- `phones` — phone_number, employee_name, encryption_key, google_refresh_token, is_active
- `chats` — phone_id, jid, contact_name, is_group, last_message_at
- `messages` — phone_id, chat_id, wa_message_id, sender_jid, content, timestamp
- `pipeline_logs` — phone_id, backup_filename, status, started_at, completed_at
- `ai_insights` — phone_id, chat_id, summary, sentiment, red_flags

---

## Change Log

### 2026-03-11 — Drive Download + Decryption Pipeline (Python)
**What changed:**
- Created `drive_decrypt.py` — Downloads all WhatsApp backup files from Priya Mishra's Google Drive via GCP service account impersonation (with fallback to direct access)
- Created `decrypt_downloaded.py` — Decrypts `.crypt15` files using `wa-crypt-tools` library with a workaround for the `Database15.iv` bug (library doesn't set `self.iv` when parsing from encrypted stream)
- Created Python venv at `~/.venv/wa-decrypt` with deps: google-auth, google-api-python-client, cryptography, wa-crypt-tools, pycryptodomex

**Findings:**
- GCP service account **cannot impersonate** Priya Mishra (domain-wide delegation not enabled in Google Workspace)
- Direct service account access works — 8 files found (shared AndroidData folder)
- **All 7 `.crypt15` files decrypted successfully** with key `aca7585...`
- **`msgstore.db.crypt15` (main chat DB) is NOT on Drive** — only auxiliary DBs present
- `wa.db` has 278 trusted contacts (LID format), `chatsettingsbackup.db` has JID-based chat settings
- Decrypted output in `decrypted_dbs/` and downloaded encrypted files in `decrypted_backups/`

**Blockers:**
1. `msgstore.db.crypt15` missing from Drive — likely in `appDataFolder` which requires domain-wide delegation
2. To fix: Enable domain-wide delegation in Google Workspace Admin → Security → API controls → Domain-wide delegation → Add service account `wa-engine-bot@wa-analysis-engine.iam.gserviceaccount.com` with scopes `drive.readonly`, `drive.appdata`
3. Alternative: Extract msgstore.db directly from phone via ADB or file manager

**wa-crypt-tools bug note:**
`Database15.__init__()` extracts IV into local `iv` variable but never assigns `self.iv = iv`. Workaround: manually set `db.iv = db.header.c15_iv.IV` after construction.

### 2026-03-11 — msgstore.db Decrypted + Schema Report Sent
- Received `msgstore-2026-03-10.1.db.crypt15` (6.8MB) via Gmail from Priya Mishra
- Decrypted successfully → `decrypted_dbs/msgstore.db` (16.5MB, 264 tables)
- **22,417 messages**, 1,016 chats, 5,897 media, 2,346 calls (2025-05-16 to 2026-03-10)
- Sent full schema + data flow report to Khushi Nagpure on Slack (from Fauzaan's account)
- Sent CB-001 context reference to Khushi via CTO Office bot for session continuity
- Context saved as `CB-001` at `AGENTS/cto-office/contexts/CB-001.md`
- **Next:** Khushi to design final Supabase schema mapping msgstore.db → Supabase tables

### 2026-03-11 — Supabase Schema Extended + Sync Pipeline Created

**Schema changes (applied via wa-monitor MCP):**
- New table `contacts` — maps msgstore.jid (identity registry, unique per phone_id+jid)
- New table `message_media` — maps msgstore.message_media (file_path, size, duration, dimensions, caption)
- New table `call_logs` — maps msgstore.call_log (voice/video calls, duration, result, unique per phone_id+wa_call_id)
- New table `receipts` — maps msgstore.receipt_user (delivered/read/played timestamps per recipient)
- New table `group_members` — maps msgstore.group_participant_user (member JID, rank 0=member/1=admin/2=superadmin)
- New table `message_reactions` — maps msgstore.message_add_on_reaction (emoji reactions per message)
- Extended `messages` with: media_size, media_duration, media_caption, media_width, media_height, quoted_message_id, quoted_text, wa_row_id
- Extended `phones` with: encryption_key_verified, drive_folder_id, last_backup_date, backup_source
- All new tables have RLS enabled + service_role bypass policy
- Total: 15 tables (was 9)

**New files:**
- `sync_pipeline.py` — Full cron-ready Python pipeline: download from Drive → decrypt crypt15 → parse msgstore.db → upsert to Supabase. Supports `--phone <name>`, `--all`, `--dry-run`. Extracts all 8 data types (contacts, chats, messages, media, calls, receipts, group_members, reactions).
- `migrations/001_extend_schema.sql` — SQL migration file (reference copy, already applied)

**Config:**
- Added `wa-monitor` MCP to `.mcp.json` for direct Supabase SQL access (project ref: `qxsauwrxaamcerrvznhp`)

**Next:** Khushi to set up cron job, add SUPABASE_SERVICE_KEY to env, test with Priya Mishra's backup
