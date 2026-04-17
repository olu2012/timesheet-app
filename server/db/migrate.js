require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('./pool');

async function migrate() {
  console.log('Running database migrations...');
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS overtime_threshold_hours INTEGER DEFAULT 40;

    ALTER TABLE timesheets
      ADD COLUMN IF NOT EXISTS total_hours NUMERIC(6,1) DEFAULT 0;

    ALTER TABLE timesheets
      ADD COLUMN IF NOT EXISTS is_overtime_flagged BOOLEAN DEFAULT false;

    ALTER TABLE timesheet_entries
      ADD COLUMN IF NOT EXISTS amended_hours NUMERIC(4,1);

    CREATE TABLE IF NOT EXISTS timesheet_audit_log (
      id              SERIAL PRIMARY KEY,
      timesheet_id    INTEGER REFERENCES timesheets(id),
      action          VARCHAR(50) NOT NULL,
      performed_by    INTEGER REFERENCES users(id),
      note            TEXT,
      changes_json    JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Migration completed successfully.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
