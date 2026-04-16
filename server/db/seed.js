require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const pool = require('./pool');

async function seed() {
  const client = await pool.connect();
  try {
    // Run schema first
    const fs = require('fs');
    const schema = fs.readFileSync(require('path').join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    const adminHash = await bcrypt.hash('admin123', 10);
    const empHash = await bcrypt.hash('employee123', 10);

    await client.query(`
      INSERT INTO users (name, email, password_hash, role, department) VALUES
        ('Admin User', 'admin@company.com', $1, 'admin', 'Management')
      ON CONFLICT (email) DO NOTHING
    `, [adminHash]);

    const employees = [
      { name: 'Alice Johnson', email: 'alice@company.com', department: 'Engineering' },
      { name: 'Bob Smith',     email: 'bob@company.com',   department: 'Marketing'   },
      { name: 'Carol Williams',email: 'carol@company.com', department: 'Design'      },
    ];

    for (const emp of employees) {
      await client.query(`
        INSERT INTO users (name, email, password_hash, role, department)
        VALUES ($1, $2, $3, 'employee', $4)
        ON CONFLICT (email) DO NOTHING
      `, [emp.name, emp.email, empHash, emp.department]);
    }

    console.log('✓ Seed complete');
    console.log('  Admin    : admin@company.com  / admin123');
    console.log('  Employee : alice@company.com  / employee123');
    console.log('  Employee : bob@company.com    / employee123');
    console.log('  Employee : carol@company.com  / employee123');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seed();
