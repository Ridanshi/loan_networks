import { pool, query } from '../config/db.js';

const tables = await query<{ table_name: string }>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (
      table_name ILIKE '%dsa%'
      OR table_name ILIKE '%scorecard%'
      OR table_name ILIKE '%commission%'
      OR table_name ILIKE '%employee%'
      OR table_name ILIKE '%organisation%'
      OR table_name ILIKE '%organization%'
      OR table_name ILIKE '%billing%'
      OR table_name ILIKE '%journey%'
      OR table_name ILIKE '%bt%'
      OR table_name ILIKE '%city%'
    )
  ORDER BY table_name
`);

const explicitTables = ['direct_selling_agent', 'cities', 'loan_types', 'applications'];
for (const table of explicitTables) {
  if (!tables.rows.some((row) => row.table_name === table)) {
    tables.rows.push({ table_name: table });
  }
}

tables.rows.sort((a, b) => a.table_name.localeCompare(b.table_name));

console.log('TABLES');
console.log(tables.rows.map((row) => row.table_name).join('\n'));

for (const table of tables.rows) {
  const columns = await query<{ column_name: string; data_type: string }>(
    `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [table.table_name]
  );

  console.log(`\n## ${table.table_name}`);
  console.log(columns.rows.map((row) => `${row.column_name}:${row.data_type}`).join(','));
}

const fks = await query<{
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  constraint_name: string;
}>(`
  SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND (
      tc.table_name ILIKE '%dsa%'
      OR tc.table_name ILIKE '%scorecard%'
      OR tc.table_name ILIKE '%commission%'
      OR tc.table_name ILIKE '%journey%'
      OR ccu.table_name ILIKE '%dsa%'
      OR ccu.table_name ILIKE '%employee%'
      OR ccu.table_name ILIKE '%billing%'
    )
  ORDER BY tc.table_name, kcu.column_name
`);

console.log('\nFOREIGN_KEYS');
for (const fk of fks.rows) {
  console.log(`${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name} (${fk.constraint_name})`);
}

await pool.end();
