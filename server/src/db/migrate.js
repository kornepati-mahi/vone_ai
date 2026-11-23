const { migrate } = require('./schema');

async function main() {
  try {
    const { ensureDatabase } = require('../config/db');
    await ensureDatabase();
    await migrate();
    console.log('Migration complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

main();