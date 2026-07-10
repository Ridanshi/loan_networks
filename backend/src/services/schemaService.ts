import { query } from '../config/db.js';

export type ColumnInfo = {
  column_name: string;
  data_type: string;
  is_nullable: string;
};

export async function getTableColumns(tableName: string) {
  const result = await query<ColumnInfo>(
    `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  );

  return result.rows;
}

export async function tableExists(tableName: string) {
  const result = await query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName]
  );

  return result.rows[0]?.exists ?? false;
}
