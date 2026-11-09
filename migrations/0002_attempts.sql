CREATE TABLE IF NOT EXISTS learning_events (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  mode TEXT NOT NULL,
  score INTEGER NOT NULL,
  seconds INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,event_id)
);
CREATE TRIGGER IF NOT EXISTS apply_learning_event AFTER INSERT ON learning_events
BEGIN
  INSERT INTO progress(user_id,day,mode,score,seconds,completed_at)
    SELECT NEW.user_id,NEW.day,NEW.mode,NEW.score,NEW.seconds,NEW.created_at WHERE NEW.day>0
    ON CONFLICT(user_id,day,mode) DO UPDATE SET score=MAX(score,excluded.score),seconds=seconds+excluded.seconds,completed_at=excluded.completed_at;
  INSERT INTO activity(user_id,day_key,seconds) VALUES(NEW.user_id,NEW.day_key,NEW.seconds)
    ON CONFLICT(user_id,day_key) DO UPDATE SET seconds=seconds+excluded.seconds;
END;
