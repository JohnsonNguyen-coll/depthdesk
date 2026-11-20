CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  sponsor_id TEXT NOT NULL,
  sponsor_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  pool_address TEXT NOT NULL,
  pair TEXT NOT NULL,
  base_symbol TEXT NOT NULL,
  quote_symbol TEXT NOT NULL,
  benchmark TEXT NOT NULL CHECK (benchmark IN ('equity', 'pool')),
  schedule TEXT NOT NULL CHECK (schedule IN ('continuous', 'market_open')),
  periods INTEGER NOT NULL CHECK (periods BETWEEN 1 AND 14),
  order_size INTEGER NOT NULL CHECK (order_size BETWEEN 1 AND 10000000),
  max_bps INTEGER NOT NULL CHECK (max_bps BETWEEN 1 AND 2000),
  target_pct INTEGER NOT NULL CHECK (target_pct BETWEEN 1 AND 100),
  budget_cents INTEGER NOT NULL CHECK (budget_cents > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'active', 'cancelled')),
  selected_proposal TEXT,
  created_at INTEGER NOT NULL,
  starts_at INTEGER,
  ends_at INTEGER,
  cancelled_at INTEGER,
  UNIQUE (id, selected_proposal),
  FOREIGN KEY (id, selected_proposal) REFERENCES proposals(campaign_id, id)
);
--> statement-breakpoint

CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  curator_id TEXT NOT NULL,
  curator_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  notes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (campaign_id, id),
  UNIQUE (campaign_id, curator_id)
);
--> statement-breakpoint

CREATE TABLE campaign_windows (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, starts_at)
);
--> statement-breakpoint

CREATE TABLE samples (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  slot_at INTEGER NOT NULL,
  observed_at INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'fail', 'unavailable')),
  reading TEXT NOT NULL,
  PRIMARY KEY (campaign_id, slot_at)
);
--> statement-breakpoint

CREATE INDEX campaigns_created ON campaigns(created_at DESC);
--> statement-breakpoint
CREATE INDEX campaign_windows_active ON campaign_windows(starts_at, ends_at);
