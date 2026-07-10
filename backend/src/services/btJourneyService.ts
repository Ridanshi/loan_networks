import { query } from '../config/db.js';

export async function getBtJourneys(options: { page: number; limit: number; search?: string }) {
  const params: unknown[] = [];
  const search = options.search?.trim();
  const whereClause = search
    ? (() => {
        params.push(`%${search}%`);
        return `WHERE bj.name ILIKE $${params.length} OR bj.property_type ILIKE $${params.length} OR bj.journey_for ILIKE $${params.length}`;
      })()
    : '';

  const totalResult = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM bt_journeys bj ${whereClause}`,
    params
  );

  params.push(options.limit);
  const limitRef = `$${params.length}`;
  params.push((options.page - 1) * options.limit);
  const offsetRef = `$${params.length}`;

  const rowsResult = await query<Record<string, unknown>>(
    `
      SELECT
        bj.id,
        bj.name,
        bj.property_type,
        bj.journey_for,
        bj.is_active,
        bj.inserted_at,
        bj.updated_at,
        c.name AS city_name,
        dsa.name AS default_sales_name,
        COALESCE(dsa_pool.dsa_count, 0) AS dsa_count,
        COALESCE(lender_offer_pool.offer_count, 0) AS lender_offer_count
      FROM bt_journeys bj
      LEFT JOIN cities c ON c.id = bj.city_id
      LEFT JOIN direct_selling_agent dsa ON dsa.id = bj.default_sales_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS dsa_count
        FROM bt_journey_dsa_pools pool
        WHERE pool.bt_journey_id = bj.id
          AND pool.active = true
      ) dsa_pool ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS offer_count
        FROM bt_journey_lender_offers offer
        WHERE offer.bt_journey_id = bj.id
          AND offer.is_active = true
      ) lender_offer_pool ON true
      ${whereClause}
      ORDER BY bj.updated_at DESC NULLS LAST, bj.id DESC
      LIMIT ${limitRef}
      OFFSET ${offsetRef}
    `,
    params
  );

  const countsResult = await query<Record<string, number>>(`
    SELECT
      COUNT(*)::int AS all,
      COUNT(*) FILTER (WHERE is_active = true)::int AS active,
      COUNT(*) FILTER (WHERE is_active = false)::int AS inactive
    FROM bt_journeys
  `);

  return {
    rows: rowsResult.rows,
    total: totalResult.rows[0]?.count ?? 0,
    page: options.page,
    pageSize: options.limit,
    counts: countsResult.rows[0],
    mapping: {
      journeys: 'bt_journeys',
      dsaPool: 'bt_journey_dsa_pools.bt_journey_id -> bt_journeys.id',
      lenderOffers: 'bt_journey_lender_offers.bt_journey_id -> bt_journeys.id',
      city: 'bt_journeys.city_id -> cities.id',
      defaultSales: 'bt_journeys.default_sales_id -> direct_selling_agent.id'
    }
  };
}
