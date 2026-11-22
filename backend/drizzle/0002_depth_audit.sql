CREATE TABLE depth_audit_samples (
  slot_at INTEGER PRIMARY KEY,
  observed_at INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'fail', 'unavailable')),
  reading TEXT NOT NULL
);
