ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS nickname_color VARCHAR(7) NOT NULL DEFAULT '#34d399';

CREATE TABLE IF NOT EXISTS user_profiles (
  browser_session VARCHAR(128) PRIMARY KEY,
  nickname VARCHAR(32) NOT NULL,
  nickname_color VARCHAR(7) NOT NULL DEFAULT '#34d399',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_activity_events (
  id BIGSERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  browser_session VARCHAR(128) NOT NULL,
  type VARCHAR(24) NOT NULL,
  nickname VARCHAR(32) NOT NULL,
  nickname_color VARCHAR(7) NOT NULL,
  previous_nickname VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS room_activity_events_room_created_idx
  ON room_activity_events (room_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS room_activity_events_browser_created_idx
  ON room_activity_events (browser_session, created_at DESC, id DESC);
