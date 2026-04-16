-- Users table
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255)        NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255)      NOT NULL,
  role        VARCHAR(20)         NOT NULL DEFAULT 'employee'
                CHECK (role IN ('employee', 'admin')),
  department  VARCHAR(255),
  created_at  TIMESTAMP           DEFAULT NOW()
);

-- Timesheets table
CREATE TABLE IF NOT EXISTS timesheets (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER          REFERENCES users(id) ON DELETE CASCADE,
  week_start_date DATE             NOT NULL,
  status          VARCHAR(20)      NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  notes           TEXT,
  admin_note      TEXT,
  submitted_at    TIMESTAMP,
  reviewed_at     TIMESTAMP,
  created_at      TIMESTAMP        DEFAULT NOW(),
  updated_at      TIMESTAMP        DEFAULT NOW(),
  UNIQUE (user_id, week_start_date)
);

-- Timesheet entries table
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id             SERIAL PRIMARY KEY,
  timesheet_id   INTEGER          REFERENCES timesheets(id) ON DELETE CASCADE,
  day_of_week    VARCHAR(3)       NOT NULL
                   CHECK (day_of_week IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  hours          NUMERIC(4,1)     NOT NULL DEFAULT 0
                   CHECK (hours >= 0 AND hours <= 24),
  UNIQUE (timesheet_id, day_of_week)
);
