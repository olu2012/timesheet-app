require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const timesheetRoutes = require('./routes/timesheets');
const adminRoutes = require('./routes/admin');
const errorHandler = require('./middleware/errorHandler');
const { startCronJobs } = require('./services/cron');
const pool = require('./db/pool');

async function runMigrations() {
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS overtime_threshold_hours INTEGER DEFAULT 40;
      ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS total_hours NUMERIC(6,1) DEFAULT 0;
      ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS is_overtime_flagged BOOLEAN DEFAULT false;
      ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS amended_hours NUMERIC(4,1);
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
    console.log('Migrations applied.');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s => s.trim());

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/admin', adminRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3001;
runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startCronJobs();
  });
});
