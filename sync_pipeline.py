#!/usr/bin/env python3
"""
WhatsApp Backup Sync Pipeline — Cron Job

Downloads encrypted backups from Google Drive, decrypts them,
parses SQLite msgstore.db, and upserts data into Supabase.

Usage:
    # Single phone (by phone number or employee name)
    python sync_pipeline.py --phone 919876543210
    python sync_pipeline.py --phone "Priya Mishra"

    # All active phones
    python sync_pipeline.py --all

    # Dry run (decrypt + parse, don't write to Supabase)
    python sync_pipeline.py --all --dry-run

Cron (every 6 hours):
    0 */6 * * * cd /path/to/whatsapp-backup-monitor && ~/.venv/wa-decrypt/bin/python sync_pipeline.py --all >> logs/sync.log 2>&1

Requires:
    pip install supabase google-auth google-api-python-client wa-crypt-tools pycryptodomex
"""

import argparse
import io
import json
import logging
import os
import sqlite3
import sys
import tempfile
import time
import zlib
from datetime import datetime, timezone, timedelta
from pathlib import Path

# wa-crypt-tools for decryption
from wa_crypt_tools.lib.key.key15 import Key15
from wa_crypt_tools.lib.db.db15 import Database15

# Google Drive
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# Supabase
from supabase import create_client

# ── Config ──────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
SERVICE_ACCOUNT_PATH = BASE_DIR / "server" / "service_account.json"
LOG_DIR = BASE_DIR / "logs"
TEMP_DIR = BASE_DIR / "tmp"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qxsauwrxaamcerrvznhp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive",
]

# Message type mapping (msgstore.db message_type → string)
MESSAGE_TYPES = {
    0: "text", 1: "image", 2: "voice", 3: "video", 4: "contact",
    5: "location", 7: "system", 8: "document", 9: "document",
    15: "deleted", 20: "sticker", 90: "call", 99: "album",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("sync_pipeline")


# ── Supabase Client ────────────────────────────────────────────────────

def get_supabase():
    if not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_KEY not set")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def get_active_phones(sb):
    """Fetch all active phones with encryption keys from Supabase."""
    resp = sb.table("phones").select("*").eq("is_active", True).execute()
    return resp.data or []


def get_phone_by_identifier(sb, identifier: str):
    """Find phone by number or employee name."""
    resp = sb.table("phones").select("*").eq("phone_number", identifier).execute()
    if resp.data:
        return resp.data[0]
    resp = sb.table("phones").select("*").ilike("employee_name", f"%{identifier}%").execute()
    if resp.data:
        return resp.data[0]
    return None


# ── Google Drive ───────────────────────────────────────────────────────

def get_drive_service(impersonate_email: str = None):
    """Get authenticated Drive service. Tries impersonation, falls back to direct."""
    kwargs = {"scopes": DRIVE_SCOPES}
    if impersonate_email:
        kwargs["subject"] = impersonate_email

    creds = service_account.Credentials.from_service_account_file(
        str(SERVICE_ACCOUNT_PATH), **kwargs
    )
    return build("drive", "v3", credentials=creds)


def find_backup_on_drive(service, phone_number: str) -> list[dict]:
    """Search for msgstore.db.crypt15 and other backup files on Drive."""
    queries = [
        "name contains 'msgstore' and name contains 'crypt'",
        "name contains '.crypt15'",
        "name contains 'wa.db'",
    ]
    found = {}
    for q in queries:
        try:
            resp = service.files().list(
                q=q, fields="files(id, name, size, mimeType, modifiedTime)",
                orderBy="modifiedTime desc", pageSize=50,
            ).execute()
            for f in resp.get("files", []):
                found[f["id"]] = f
        except Exception as e:
            log.debug(f"Drive query failed: {e}")

    return list(found.values())


def download_drive_file(service, file_id: str) -> bytes:
    """Download a file from Google Drive into memory."""
    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue()


# ── Decryption ─────────────────────────────────────────────────────────

def decrypt_crypt15(encrypted_data: bytes, key_hex: str) -> bytes:
    """Decrypt a .crypt15 file using wa-crypt-tools with IV bug workaround."""
    key_bytes = bytes.fromhex(key_hex)
    key15 = Key15(keyarray=key_bytes)

    stream = io.BufferedReader(io.BytesIO(encrypted_data))
    db = Database15(key=key15, encrypted=stream)

    # wa-crypt-tools bug: self.iv not set
    db.iv = db.header.c15_iv.IV

    remaining = stream.read()
    decrypted = db.decrypt(key15, remaining)

    try:
        decrypted = zlib.decompress(decrypted)
    except zlib.error:
        pass

    result = bytes(decrypted)

    if not result[:15] == b"SQLite format 3":
        raise ValueError("Decryption result is not a valid SQLite database")

    return result


# ── SQLite Parser ──────────────────────────────────────────────────────

def parse_msgstore(db_bytes: bytes, phone_id: str) -> dict:
    """
    Parse decrypted msgstore.db and return structured data for Supabase.
    Returns dict with keys: contacts, chats, messages, media, calls,
                            receipts, group_members, reactions
    """
    # Write to temp file for sqlite3
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.write(db_bytes)
    tmp.close()

    conn = sqlite3.connect(tmp.name)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    result = {
        "contacts": [], "chats": [], "messages": [], "media": [],
        "calls": [], "receipts": [], "group_members": [], "reactions": [],
    }

    # ── JID / Contacts ──
    jid_map = {}  # wa_jid_id → jid string
    try:
        rows = cur.execute("SELECT _id, user, server, raw_string, type FROM jid").fetchall()
        for r in rows:
            jid_str = r["raw_string"] or f"{r['user']}@{r['server']}"
            jid_map[r["_id"]] = jid_str
            # Only store phone/group jids, skip device/agent jids
            if r["server"] in ("s.whatsapp.net", "g.us"):
                result["contacts"].append({
                    "phone_id": phone_id,
                    "jid": jid_str,
                    "raw_string": r["raw_string"],
                    "server": r["server"],
                    "phone_number": r["user"] if r["server"] == "s.whatsapp.net" else None,
                    "wa_jid_id": r["_id"],
                })
    except Exception as e:
        log.warning(f"Failed to parse jid table: {e}")

    # ── Chats ──
    chat_id_to_jid = {}  # wa_chat_id → jid string
    try:
        rows = cur.execute("""
            SELECT c._id, c.jid_row_id, c.subject, c.archived,
                   c.ephemeral_expiration, c.group_type,
                   (SELECT COUNT(*) FROM message m WHERE m.chat_row_id = c._id AND m.timestamp > 0) as msg_count,
                   (SELECT MAX(m.timestamp) FROM message m WHERE m.chat_row_id = c._id) as last_ts,
                   (SELECT m.text_data FROM message m WHERE m.chat_row_id = c._id
                    ORDER BY m.timestamp DESC LIMIT 1) as last_msg
            FROM chat c
        """).fetchall()
        for r in rows:
            jid = jid_map.get(r["jid_row_id"], f"unknown_{r['jid_row_id']}")
            chat_id_to_jid[r["_id"]] = jid
            is_group = "@g.us" in jid
            last_ts = r["last_ts"]
            result["chats"].append({
                "phone_id": phone_id,
                "jid": jid,
                "contact_name": r["subject"] if is_group else jid.split("@")[0],
                "contact_number": None if is_group else jid.split("@")[0],
                "is_group": is_group,
                "group_name": r["subject"] if is_group else None,
                "total_messages": r["msg_count"] or 0,
                "last_message_at": _ts_to_iso(last_ts) if last_ts else None,
                "last_message_preview": (r["last_msg"] or "")[:200] or None,
            })
    except Exception as e:
        log.warning(f"Failed to parse chat table: {e}")

    # ── Messages ──
    wa_msg_to_chat_jid = {}  # for receipt linking later
    try:
        rows = cur.execute("""
            SELECT m._id, m.chat_row_id, m.timestamp, m.from_me,
                   m.sender_jid_row_id, m.text_data, m.message_type,
                   m.starred, m.forwarded, m.key_id,
                   mq.key_id as quoted_key_id, mq.text_data as quoted_text
            FROM message m
            LEFT JOIN message_quoted mq ON mq.message_row_id = m._id
            WHERE m.timestamp > 0
            ORDER BY m.timestamp ASC
        """).fetchall()
        for r in rows:
            chat_jid = chat_id_to_jid.get(r["chat_row_id"], f"chat_{r['chat_row_id']}")
            sender_jid = jid_map.get(r["sender_jid_row_id"])
            msg_type_num = r["message_type"] or 0
            wa_msg_to_chat_jid[r["_id"]] = chat_jid

            result["messages"].append({
                "phone_id": phone_id,
                "wa_message_id": r["key_id"] or str(r["_id"]),
                "wa_row_id": r["_id"],
                "_chat_jid": chat_jid,  # used for linking, removed before insert
                "timestamp": _ts_to_iso(r["timestamp"]),
                "from_me": bool(r["from_me"]),
                "sender_jid": sender_jid,
                "sender_name": sender_jid.split("@")[0] if sender_jid else None,
                "message_type": MESSAGE_TYPES.get(msg_type_num, "other"),
                "text_data": r["text_data"],
                "is_starred": bool(r["starred"]),
                "is_forwarded": bool(r["forwarded"]) if r["forwarded"] else False,
                "quoted_message_id": r["quoted_key_id"],
                "quoted_text": (r["quoted_text"] or "")[:500] or None,
            })
    except Exception as e:
        log.warning(f"Failed to parse message table: {e}")

    # ── Media ──
    try:
        rows = cur.execute("""
            SELECT mm.message_row_id, mm.chat_row_id, mm.file_path,
                   mm.file_size, mm.mime_type, mm.media_duration,
                   mm.media_caption, mm.width, mm.height
            FROM message_media mm
        """).fetchall()
        for r in rows:
            result["media"].append({
                "phone_id": phone_id,
                "wa_media_id": r["message_row_id"],
                "_chat_row_id": r["chat_row_id"],
                "file_path": r["file_path"],
                "file_size": r["file_size"],
                "mime_type": r["mime_type"],
                "media_duration": r["media_duration"],
                "media_caption": r["media_caption"],
                "width": r["width"],
                "height": r["height"],
            })
    except Exception as e:
        log.warning(f"Failed to parse message_media table: {e}")

    # ── Call Logs ──
    try:
        rows = cur.execute("""
            SELECT _id, jid_row_id, timestamp, duration,
                   video_call, call_result, from_me
            FROM call_log
        """).fetchall()
        for r in rows:
            contact = jid_map.get(r["jid_row_id"], f"unknown_{r['jid_row_id']}")
            result["calls"].append({
                "phone_id": phone_id,
                "contact_jid": contact,
                "timestamp": _ts_to_iso(r["timestamp"]),
                "duration": r["duration"] or 0,
                "is_video": bool(r["video_call"]),
                "call_result": r["call_result"],
                "from_me": bool(r["from_me"]) if r["from_me"] is not None else False,
                "wa_call_id": r["_id"],
            })
    except Exception as e:
        log.warning(f"Failed to parse call_log table: {e}")

    # ── Receipts ──
    try:
        rows = cur.execute("""
            SELECT message_row_id, receipt_user_jid_row_id,
                   receipt_timestamp, read_timestamp, played_timestamp
            FROM receipt_user
        """).fetchall()
        for r in rows:
            recipient = jid_map.get(r["receipt_user_jid_row_id"], "")
            result["receipts"].append({
                "phone_id": phone_id,
                "wa_message_row_id": r["message_row_id"],
                "recipient_jid": recipient,
                "receipt_timestamp": _ts_to_iso(r["receipt_timestamp"]) if r["receipt_timestamp"] else None,
                "read_timestamp": _ts_to_iso(r["read_timestamp"]) if r["read_timestamp"] else None,
                "played_timestamp": _ts_to_iso(r["played_timestamp"]) if r["played_timestamp"] else None,
            })
    except Exception as e:
        log.warning(f"Failed to parse receipt_user table: {e}")

    # ── Group Members ──
    try:
        rows = cur.execute("""
            SELECT group_jid_row_id, user_jid_row_id, rank
            FROM group_participant_user
        """).fetchall()
        for r in rows:
            group_jid = jid_map.get(r["group_jid_row_id"], "")
            member_jid = jid_map.get(r["user_jid_row_id"], "")
            result["group_members"].append({
                "phone_id": phone_id,
                "group_jid": group_jid,
                "member_jid": member_jid,
                "rank": r["rank"] or 0,
            })
    except Exception as e:
        log.warning(f"Failed to parse group_participant_user: {e}")

    # ── Reactions ──
    try:
        rows = cur.execute("""
            SELECT message_row_id, sender_jid_row_id, reaction, timestamp
            FROM message_add_on_reaction
            WHERE reaction IS NOT NULL
        """).fetchall()
        for r in rows:
            sender = jid_map.get(r["sender_jid_row_id"], "")
            result["reactions"].append({
                "phone_id": phone_id,
                "wa_message_row_id": r["message_row_id"],
                "sender_jid": sender,
                "reaction": r["reaction"],
                "timestamp": _ts_to_iso(r["timestamp"]) if r["timestamp"] else None,
            })
    except Exception as e:
        log.debug(f"No reactions table or parse error: {e}")

    conn.close()
    os.unlink(tmp.name)

    return result


def _ts_to_iso(ts) -> str | None:
    """Convert WhatsApp millisecond timestamp to ISO string."""
    if not ts or ts <= 0:
        return None
    try:
        # WhatsApp timestamps are milliseconds since epoch
        dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        return dt.isoformat()
    except (OSError, ValueError):
        return None


# ── Supabase Uploader ──────────────────────────────────────────────────

def upload_to_supabase(sb, parsed: dict, phone: dict, dry_run: bool = False):
    """Upload parsed msgstore data to Supabase. Returns stats dict."""
    phone_id = phone["id"]
    stats = {}

    if dry_run:
        for key, rows in parsed.items():
            stats[key] = len(rows)
            log.info(f"  [DRY RUN] {key}: {len(rows)} rows")
        return stats

    started_at = datetime.now(timezone.utc).isoformat()

    # 1. Upsert contacts
    if parsed["contacts"]:
        stats["contacts"] = _batch_upsert(sb, "contacts", parsed["contacts"],
                                           on_conflict="phone_id,jid")

    # 2. Upsert chats — need to get back IDs for message linking
    chat_jid_to_id = {}
    if parsed["chats"]:
        for chat in parsed["chats"]:
            resp = sb.table("chats").upsert(
                chat, on_conflict="phone_id,jid"
            ).execute()
            if resp.data:
                chat_jid_to_id[chat["jid"]] = resp.data[0]["id"]
        stats["chats"] = len(parsed["chats"])
        log.info(f"  chats: {stats['chats']} upserted")

    # 3. Insert messages (deduplicated by wa_message_id)
    if parsed["messages"]:
        # Get existing wa_message_ids for this phone
        existing = set()
        offset = 0
        while True:
            resp = sb.table("messages").select("wa_message_id").eq(
                "phone_id", phone_id
            ).range(offset, offset + 999).execute()
            batch = resp.data or []
            existing.update(m["wa_message_id"] for m in batch)
            if len(batch) < 1000:
                break
            offset += 1000

        new_msgs = []
        wa_row_to_supabase_id = {}
        for msg in parsed["messages"]:
            if msg["wa_message_id"] in existing:
                continue
            chat_jid = msg.pop("_chat_jid", None)
            chat_uuid = chat_jid_to_id.get(chat_jid)
            if not chat_uuid:
                continue
            msg["chat_id"] = chat_uuid
            new_msgs.append(msg)

        inserted = _batch_insert(sb, "messages", new_msgs)
        stats["messages"] = inserted
        log.info(f"  messages: {inserted} new (skipped {len(parsed['messages']) - len(new_msgs)} existing)")

        # Build wa_row_id → supabase message id map for media/receipt linking
        if new_msgs:
            resp = sb.table("messages").select("id,wa_row_id").eq(
                "phone_id", phone_id
            ).not_.is_("wa_row_id", "null").execute()
            for m in (resp.data or []):
                if m.get("wa_row_id"):
                    wa_row_to_supabase_id[m["wa_row_id"]] = m["id"]

    # 4. Insert media
    if parsed["media"]:
        for m in parsed["media"]:
            m.pop("_chat_row_id", None)
            msg_uuid = wa_row_to_supabase_id.get(m.get("wa_media_id"))
            if msg_uuid:
                m["message_id"] = msg_uuid
            else:
                m.pop("message_id", None)  # can't link, still store metadata
                # Skip unlinked media to avoid FK violation
                continue
        linked_media = [m for m in parsed["media"] if "message_id" in m]
        stats["media"] = _batch_insert(sb, "message_media", linked_media)
        log.info(f"  media: {stats['media']} inserted")

    # 5. Insert call logs
    if parsed["calls"]:
        stats["calls"] = _batch_upsert(sb, "call_logs", parsed["calls"],
                                        on_conflict="phone_id,wa_call_id")
        log.info(f"  calls: {stats['calls']} upserted")

    # 6. Insert receipts (bulk, skip linking for now — too many)
    if parsed["receipts"]:
        for r in parsed["receipts"]:
            msg_uuid = wa_row_to_supabase_id.get(r.get("wa_message_row_id"))
            if msg_uuid:
                r["message_id"] = msg_uuid
            else:
                r.pop("message_id", None)
        linked = [r for r in parsed["receipts"] if "message_id" in r]
        stats["receipts"] = _batch_insert(sb, "receipts", linked)
        log.info(f"  receipts: {stats['receipts']} inserted (of {len(parsed['receipts'])} total)")

    # 7. Insert group members
    if parsed["group_members"]:
        stats["group_members"] = _batch_upsert(sb, "group_members", parsed["group_members"],
                                                 on_conflict="phone_id,group_jid,member_jid")
        log.info(f"  group_members: {stats['group_members']} upserted")

    # 8. Insert reactions
    if parsed["reactions"]:
        for r in parsed["reactions"]:
            msg_uuid = wa_row_to_supabase_id.get(r.get("wa_message_row_id"))
            if msg_uuid:
                r["message_id"] = msg_uuid
            else:
                continue
        linked = [r for r in parsed["reactions"] if "message_id" in r]
        stats["reactions"] = _batch_insert(sb, "message_reactions", linked)
        log.info(f"  reactions: {stats['reactions']} inserted")

    # 9. Update phone stats
    total_msgs = stats.get("messages", 0)
    total_chats = stats.get("chats", 0)
    sb.table("phones").update({
        "last_sync_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", phone_id).execute()

    # 10. Log pipeline run
    completed_at = datetime.now(timezone.utc).isoformat()
    sb.table("pipeline_logs").insert({
        "phone_id": phone_id,
        "backup_filename": "msgstore.db.crypt15",
        "status": "success",
        "messages_added": total_msgs,
        "chats_added": total_chats,
        "started_at": started_at,
        "completed_at": completed_at,
    }).execute()

    return stats


def _batch_insert(sb, table: str, rows: list[dict], batch_size: int = 500) -> int:
    """Insert rows in batches. Returns count inserted."""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            sb.table(table).insert(batch).execute()
            total += len(batch)
        except Exception as e:
            log.error(f"Batch insert to {table} failed at offset {i}: {e}")
            # Try one by one for this batch
            for row in batch:
                try:
                    sb.table(table).insert(row).execute()
                    total += 1
                except Exception as e2:
                    log.debug(f"Single insert to {table} failed: {e2}")
    return total


def _batch_upsert(sb, table: str, rows: list[dict],
                   on_conflict: str, batch_size: int = 500) -> int:
    """Upsert rows in batches. Returns count."""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            sb.table(table).upsert(batch, on_conflict=on_conflict).execute()
            total += len(batch)
        except Exception as e:
            log.error(f"Batch upsert to {table} failed at offset {i}: {e}")
    return total


# ── Pipeline Orchestrator ──────────────────────────────────────────────

def sync_phone(sb, phone: dict, dry_run: bool = False) -> dict:
    """
    Full pipeline for one phone:
    1. Download backup from Drive (or use local file)
    2. Decrypt with phone's encryption key
    3. Parse msgstore.db
    4. Upload to Supabase
    """
    phone_id = phone["id"]
    name = phone["employee_name"]
    number = phone["phone_number"]
    key_hex = phone.get("encryption_key")

    log.info(f"{'='*60}")
    log.info(f"Syncing: {name} ({number})")

    if not key_hex:
        log.error(f"  No encryption key for {name} — skipping")
        return {"error": "no_encryption_key"}

    # Step 1: Find backup file
    encrypted_data = None
    backup_source = "none"

    # Try local file first (manual uploads in decrypted_backups/)
    local_backups = sorted(
        (BASE_DIR / "decrypted_backups").glob(f"*msgstore*{number}*.crypt15"),
        key=lambda p: p.stat().st_mtime, reverse=True,
    )
    if not local_backups:
        # Try generic msgstore backup
        local_backups = sorted(
            (BASE_DIR / "decrypted_backups").glob("*msgstore*.crypt15"),
            key=lambda p: p.stat().st_mtime, reverse=True,
        )

    if local_backups:
        log.info(f"  Using local backup: {local_backups[0].name}")
        encrypted_data = local_backups[0].read_bytes()
        backup_source = "local"

    # Try Google Drive if no local file
    if not encrypted_data:
        try:
            # Try impersonation first
            email = phone.get("agent_email") or f"{number}@katyayaniorganics.com"
            try:
                service = get_drive_service(impersonate_email=email)
                service.files().list(pageSize=1, fields="files(id)").execute()
                log.info(f"  Connected to Drive via impersonation ({email})")
            except Exception:
                service = get_drive_service()
                log.info(f"  Connected to Drive via service account (direct)")

            files = find_backup_on_drive(service, number)
            msgstore_files = [f for f in files if "msgstore" in f["name"].lower()]

            if msgstore_files:
                # Download the most recent one
                target = msgstore_files[0]
                log.info(f"  Downloading: {target['name']} ({int(target.get('size', 0)):,} bytes)")
                encrypted_data = download_drive_file(service, target["id"])
                backup_source = "drive"
            else:
                log.warning(f"  No msgstore backup found on Drive for {name}")
        except Exception as e:
            log.error(f"  Drive access failed: {e}")

    if not encrypted_data:
        log.error(f"  No backup file available for {name}")
        return {"error": "no_backup"}

    # Step 2: Decrypt
    log.info(f"  Decrypting ({len(encrypted_data):,} bytes)...")
    try:
        db_bytes = decrypt_crypt15(encrypted_data, key_hex)
        log.info(f"  Decrypted: {len(db_bytes):,} bytes (valid SQLite)")
    except Exception as e:
        log.error(f"  Decryption failed: {e}")
        if not dry_run:
            sb.table("pipeline_logs").insert({
                "phone_id": phone_id,
                "backup_filename": "msgstore.db.crypt15",
                "status": "failed",
                "error_message": str(e),
                "started_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        return {"error": f"decrypt_failed: {e}"}

    # Step 3: Parse
    log.info(f"  Parsing msgstore.db...")
    parsed = parse_msgstore(db_bytes, phone_id)
    log.info(f"  Parsed: {len(parsed['contacts'])} contacts, {len(parsed['chats'])} chats, "
             f"{len(parsed['messages'])} messages, {len(parsed['media'])} media, "
             f"{len(parsed['calls'])} calls, {len(parsed['receipts'])} receipts")

    # Step 4: Upload
    log.info(f"  Uploading to Supabase...")
    stats = upload_to_supabase(sb, parsed, phone, dry_run=dry_run)

    log.info(f"  Done: {name}")
    return stats


# ── CLI ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="WhatsApp Backup Sync Pipeline")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--phone", help="Phone number or employee name to sync")
    group.add_argument("--all", action="store_true", help="Sync all active phones")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, don't write to Supabase")
    args = parser.parse_args()

    LOG_DIR.mkdir(exist_ok=True)
    TEMP_DIR.mkdir(exist_ok=True)

    sb = get_supabase()
    results = {}

    if args.all:
        phones = get_active_phones(sb)
        log.info(f"Found {len(phones)} active phones")
        for phone in phones:
            try:
                results[phone["phone_number"]] = sync_phone(sb, phone, dry_run=args.dry_run)
            except Exception as e:
                log.error(f"Pipeline failed for {phone['employee_name']}: {e}")
                results[phone["phone_number"]] = {"error": str(e)}
    else:
        phone = get_phone_by_identifier(sb, args.phone)
        if not phone:
            log.error(f"Phone not found: {args.phone}")
            sys.exit(1)
        results[phone["phone_number"]] = sync_phone(sb, phone, dry_run=args.dry_run)

    # Summary
    log.info(f"\n{'='*60}")
    log.info("SYNC SUMMARY")
    for number, stats in results.items():
        if "error" in stats:
            log.info(f"  {number}: FAILED — {stats['error']}")
        else:
            log.info(f"  {number}: OK — {stats}")


if __name__ == "__main__":
    main()
