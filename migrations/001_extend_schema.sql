-- WhatsApp Backup Monitor — Schema Extension
-- Maps msgstore.db rich data into Supabase
-- Run with service_role key or via Supabase SQL Editor

-- ============================================
-- 1. Contacts / Identity table (maps msgstore.jid)
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_id        uuid NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
    jid             text NOT NULL,           -- e.g. 919876543210@s.whatsapp.net
    raw_string      text,                    -- original raw_string from jid table
    server          text,                    -- s.whatsapp.net, g.us, lid
    display_name    text,
    phone_number    text,                    -- extracted from jid user part
    is_business     boolean DEFAULT false,
    wa_jid_id       bigint,                  -- original _id from msgstore.jid
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    UNIQUE(phone_id, jid)
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone_jid ON contacts(phone_id, jid);

-- ============================================
-- 2. Media metadata table (maps msgstore.message_media)
-- ============================================
CREATE TABLE IF NOT EXISTS message_media (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    phone_id        uuid NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
    chat_id         uuid REFERENCES chats(id) ON DELETE SET NULL,
    file_path       text,
    file_size       bigint,
    mime_type       text,
    media_duration  integer,                 -- seconds for audio/video
    media_caption   text,
    width           integer,
    height          integer,
    thumbnail_path  text,
    wa_media_id     bigint,                  -- original message_row_id from msgstore
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_message ON message_media(message_id);
CREATE INDEX IF NOT EXISTS idx_media_phone ON message_media(phone_id);

-- ============================================
-- 3. Call log table (maps msgstore.call_log)
-- ============================================
CREATE TABLE IF NOT EXISTS call_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_id        uuid NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
    contact_jid     text NOT NULL,
    timestamp       timestamptz NOT NULL,
    duration        integer DEFAULT 0,       -- seconds
    is_video        boolean DEFAULT false,
    call_result     integer,                 -- 0=missed, 2=answered, 5=rejected, etc.
    from_me         boolean DEFAULT false,
    wa_call_id      bigint,                  -- original _id from msgstore.call_log
    created_at      timestamptz DEFAULT now(),
    UNIQUE(phone_id, wa_call_id)
);

CREATE INDEX IF NOT EXISTS idx_calls_phone ON call_logs(phone_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON call_logs(contact_jid);
CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON call_logs(phone_id, timestamp DESC);

-- ============================================
-- 4. Read receipts table (maps msgstore.receipt_user)
-- ============================================
CREATE TABLE IF NOT EXISTS receipts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      uuid REFERENCES messages(id) ON DELETE CASCADE,
    phone_id        uuid NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
    recipient_jid   text NOT NULL,
    receipt_timestamp   timestamptz,         -- delivered
    read_timestamp      timestamptz,         -- read (double blue tick)
    played_timestamp    timestamptz,         -- played (voice/video)
    wa_message_row_id   bigint,              -- original message_row_id from msgstore
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_message ON receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_receipts_phone ON receipts(phone_id);

-- ============================================
-- 5. Group members table (maps msgstore.group_participant_user)
-- ============================================
CREATE TABLE IF NOT EXISTS group_members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_id        uuid NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
    group_jid       text NOT NULL,
    member_jid      text NOT NULL,
    rank            smallint DEFAULT 0,      -- 0=member, 1=admin, 2=superadmin
    joined_at       timestamptz,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    UNIQUE(phone_id, group_jid, member_jid)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(phone_id, group_jid);

-- ============================================
-- 6. Reactions table (maps msgstore.message_add_on_reaction)
-- ============================================
CREATE TABLE IF NOT EXISTS message_reactions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      uuid REFERENCES messages(id) ON DELETE CASCADE,
    phone_id        uuid NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
    sender_jid      text NOT NULL,
    reaction        text NOT NULL,           -- emoji
    timestamp       timestamptz,
    wa_message_row_id   bigint,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);

-- ============================================
-- 7. Add missing columns to existing messages table
-- ============================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_size bigint;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_duration integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_caption text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_width integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_height integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_message_id text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_text text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_row_id bigint;

-- ============================================
-- 8. Add encryption_key_verified to phones
-- ============================================
ALTER TABLE phones ADD COLUMN IF NOT EXISTS encryption_key_verified boolean DEFAULT false;
ALTER TABLE phones ADD COLUMN IF NOT EXISTS drive_folder_id text;
ALTER TABLE phones ADD COLUMN IF NOT EXISTS last_backup_date date;
ALTER TABLE phones ADD COLUMN IF NOT EXISTS backup_source text DEFAULT 'manual';  -- manual, drive, email

-- ============================================
-- 9. Enable RLS on new tables
-- ============================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (allow full access for backend)
CREATE POLICY "service_role_all" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON message_media FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON call_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON receipts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON group_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON message_reactions FOR ALL USING (true) WITH CHECK (true);
