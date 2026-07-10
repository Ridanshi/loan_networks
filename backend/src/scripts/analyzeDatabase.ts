import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pool, query } from '../config/db.js';
import { tableConfigs } from '../services/tableConfig.js';

type TableRow = {
  table_name: string;
};

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
};

type ForeignKeyRow = {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  constraint_name: string;
};

async function main() {
  const tables = await query<TableRow>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `
  );

  const columns = await query<ColumnRow>(
    `
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `
  );

  const foreignKeys = await query<ForeignKeyRow>(
    `
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
      ORDER BY tc.table_name, kcu.column_name
    `
  );

  const tableSet = new Set(tables.rows.map((table) => table.table_name));
  const groupedColumns = columns.rows.reduce<Record<string, ColumnRow[]>>((acc, column) => {
    acc[column.table_name] = acc[column.table_name] || [];
    acc[column.table_name].push(column);
    return acc;
  }, {});

  const lines = [
    '# Generated Database Map',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Tables Discovered',
    '',
    ...tables.rows.map((table) => `- \`${table.table_name}\``),
    '',
    '## Columns',
    ''
  ];

  for (const table of tables.rows) {
    lines.push(`### ${table.table_name}`, '');
    lines.push('| Column | Type | Nullable |', '| --- | --- | --- |');
    for (const column of groupedColumns[table.table_name] || []) {
      lines.push(`| \`${column.column_name}\` | \`${column.data_type}\` | ${column.is_nullable} |`);
    }
    lines.push('');
  }

  lines.push('## Foreign Keys', '');
  if (foreignKeys.rows.length === 0) {
    lines.push('No foreign keys discovered in the public schema.', '');
  } else {
    lines.push('| Table | Column | References | Constraint |', '| --- | --- | --- | --- |');
    for (const fk of foreignKeys.rows) {
      lines.push(
        `| \`${fk.table_name}\` | \`${fk.column_name}\` | \`${fk.foreign_table_name}.${fk.foreign_column_name}\` | \`${fk.constraint_name}\` |`
      );
    }
    lines.push('');
  }

  lines.push('## Component To Table Mapping', '');
  lines.push('| Component | Table | Exists In Database | Requested Columns Missing |', '| --- | --- | --- | --- |');
  for (const config of Object.values(tableConfigs)) {
    const actualColumns = new Set((groupedColumns[config.table] || []).map((column) => column.column_name));
    const missing = config.columns.filter((column) => !actualColumns.has(column));
    lines.push(
      `| ${config.label} | \`${config.table}\` | ${tableSet.has(config.table) ? 'yes' : 'no'} | ${
        missing.length ? missing.map((column) => `\`${column}\``).join(', ') : 'none'
      } |`
    );
  }

  lines.push('', '## Assumptions', '', '- This document is generated from the configured live PostgreSQL database.');

  const outputPath = resolve(process.cwd(), '..', 'docs', 'generated-database-map.md');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  await pool.end();

  console.log(`Wrote ${outputPath}`);
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
