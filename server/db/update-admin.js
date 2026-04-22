require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const pool = require('./pool');

async function updateAdmin() {
  const client = await pool.connect();
  try {
    const newEmail = 'admin@rqsolimited.com';
    const newHash = await bcrypt.hash('Rad1Pitere20@', 10);

    const result = await client.query(`
      UPDATE users
      SET email = $1, password_hash = $2
      WHERE role = 'admin'
      RETURNING email
    `, [newEmail, newHash]);

    if (result.rowCount === 0) {
      console.log('No admin user found — run seed.js instead.');
    } else {
      console.log(`✓ Admin updated: ${result.rows[0].email}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Update failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

updateAdmin();
