const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../prisma/migrations/20261110_stock_requests_notifications/migration.sql'),
  'utf8'
);

const prisma = new PrismaClient();

async function run() {
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    console.log('Executing:', stmt.substring(0, 60) + '...');
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log('Migration complete.');
}

run().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

