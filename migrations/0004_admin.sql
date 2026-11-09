ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'));
ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1));
CREATE TABLE admin_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id TEXT NOT NULL,
 target_id TEXT NOT NULL,
 action TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX learning_events_created ON learning_events(created_at);
CREATE INDEX users_created ON users(created_at);
