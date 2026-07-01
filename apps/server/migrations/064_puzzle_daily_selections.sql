CREATE TABLE IF NOT EXISTS puzzle_daily_selections (
  day date NOT NULL,
  slot text NOT NULL DEFAULT 'homepage',
  variant text NOT NULL,
  puzzle_id text NOT NULL,
  source text NOT NULL DEFAULT 'auto',
  selected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, slot)
);

CREATE INDEX IF NOT EXISTS puzzle_daily_selections_puzzle_id_idx
  ON puzzle_daily_selections (puzzle_id);
