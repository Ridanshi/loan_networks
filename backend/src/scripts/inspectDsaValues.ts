import { pool, query } from '../config/db.js';

const sections = [
  {
    label: 'dsa_statuses',
    sql: `SELECT status, COUNT(*)::int AS count FROM direct_selling_agent GROUP BY status ORDER BY count DESC NULLS LAST`
  },
  {
    label: 'dsa_sub_types',
    sql: `SELECT sub_type, COUNT(*)::int AS count FROM direct_selling_agent GROUP BY sub_type ORDER BY count DESC NULLS LAST`
  },
  {
    label: 'dsa_flags',
    sql: `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE bt_journey_enabled)::int AS bt,
        COUNT(*) FILTER (WHERE resale_enabled)::int AS resale,
        COUNT(*) FILTER (WHERE is_affordable)::int AS afford
      FROM direct_selling_agent
    `
  },
  {
    label: 'bt_journey_counts',
    sql: `SELECT is_active, journey_for, COUNT(*)::int AS count FROM bt_journeys GROUP BY is_active, journey_for ORDER BY count DESC`
  }
];

for (const section of sections) {
  const result = await query(section.sql);
  console.log(`\n## ${section.label}`);
  console.log(JSON.stringify(result.rows, null, 2));
}

await pool.end();
