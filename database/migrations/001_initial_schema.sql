CREATE TABLE shelters (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  latitude double precision,
  longitude double precision,
  initial_status text NOT NULL CHECK (initial_status IN ('green', 'yellow', 'red', 'gray')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id text PRIMARY KEY,
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  role text NOT NULL CHECK (role IN ('demo_operator', 'demo_hq')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shelter_status (
  shelter_id text PRIMARY KEY REFERENCES shelters(id),
  current_count integer NOT NULL CHECK (current_count >= 0),
  confirmed_count integer CHECK (confirmed_count >= 0),
  confirmed_at timestamptz,
  confirmation_slot time,
  status text NOT NULL CHECK (status IN ('green', 'yellow', 'red', 'gray')),
  confidence text NOT NULL CHECK (confidence IN ('confirmed', 'estimated')),
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL REFERENCES users(id)
);

CREATE TABLE events (
  id text PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('visitor_change', 'confirmation', 'supply_received', 'issue_update', 'notice_update')),
  shelter_id text NOT NULL REFERENCES shelters(id),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL REFERENCES users(id),
  payload jsonb NOT NULL,
  status text NOT NULL
);

CREATE TABLE confirmations (
  id bigserial PRIMARY KEY,
  shelter_id text NOT NULL REFERENCES shelters(id),
  confirmation_slot time NOT NULL,
  confirmed_count integer NOT NULL CHECK (confirmed_count >= 0),
  confirmed_at timestamptz NOT NULL,
  updated_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supplies (
  id bigserial PRIMARY KEY,
  shelter_id text NOT NULL REFERENCES shelters(id),
  supply_type text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 1),
  unit text NOT NULL,
  occurred_at timestamptz NOT NULL,
  updated_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE issues (
  id bigserial PRIMARY KEY,
  shelter_id text NOT NULL REFERENCES shelters(id),
  category text NOT NULL CHECK (category IN ('toilet', 'hygiene', 'power', 'water', 'air_conditioning', 'building', 'other')),
  severity text NOT NULL CHECK (severity IN ('normal', 'caution', 'urgent')),
  occurred_at timestamptz NOT NULL,
  updated_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notices (
  id bigserial PRIMARY KEY,
  shelter_id text NOT NULL REFERENCES shelters(id),
  title varchar(30) NOT NULL CHECK (btrim(title) <> ''),
  start_time time NOT NULL,
  location varchar(40) NOT NULL CHECK (btrim(location) <> ''),
  body varchar(100) NOT NULL CHECK (btrim(body) <> ''),
  is_public boolean NOT NULL,
  occurred_at timestamptz NOT NULL,
  updated_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_shelter_occurred_idx ON events (shelter_id, occurred_at DESC);
CREATE INDEX confirmations_shelter_confirmed_idx ON confirmations (shelter_id, confirmed_at DESC);
CREATE INDEX supplies_shelter_occurred_idx ON supplies (shelter_id, occurred_at DESC);
CREATE INDEX issues_shelter_occurred_idx ON issues (shelter_id, occurred_at DESC);
CREATE INDEX notices_shelter_occurred_idx ON notices (shelter_id, occurred_at DESC);
