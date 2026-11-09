-- Preserve the existing 60-day history; new lessons have independent, stable IDs.
DROP TRIGGER IF EXISTS apply_learning_event;
CREATE TABLE progress_v2(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 9999),mode TEXT NOT NULL,score INTEGER NOT NULL,seconds INTEGER NOT NULL DEFAULT 0,completed_at INTEGER NOT NULL,PRIMARY KEY(user_id,day,mode));
INSERT INTO progress_v2 SELECT * FROM progress;
DROP TABLE progress;
ALTER TABLE progress_v2 RENAME TO progress;
CREATE TRIGGER apply_learning_event AFTER INSERT ON learning_events
BEGIN
 INSERT INTO progress(user_id,day,mode,score,seconds,completed_at)
 SELECT NEW.user_id,NEW.day,NEW.mode,NEW.score,NEW.seconds,NEW.created_at WHERE NEW.day>0
 ON CONFLICT(user_id,day,mode) DO UPDATE SET score=MAX(score,excluded.score),seconds=seconds+excluded.seconds,completed_at=excluded.completed_at;
 INSERT INTO activity(user_id,day_key,seconds) VALUES(NEW.user_id,NEW.day_key,NEW.seconds)
 ON CONFLICT(user_id,day_key) DO UPDATE SET seconds=seconds+excluded.seconds;
END;
CREATE TABLE preferences(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,course_id TEXT NOT NULL DEFAULT 'n5',daily_goal INTEGER NOT NULL DEFAULT 60,autoplay INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL);
CREATE TABLE review_cards(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,question_id TEXT NOT NULL,payload TEXT NOT NULL,due_at INTEGER NOT NULL,step INTEGER NOT NULL DEFAULT 0,correct_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,question_id));
CREATE TABLE review_events(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,event_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,event_id));
CREATE INDEX review_due ON review_cards(user_id,due_at);
