import { query } from '../config/db.js';

type DsaTab = 'all' | 'drafts' | 'active' | 'pending_approval' | 'inactive' | 'rejected';
type DsaType = 'all' | 'bt' | 'resale' | 'afford';

function tabWhere(tab: DsaTab, params: unknown[]) {
  switch (tab) {
    case 'drafts':
      params.push('draft');
      return `d.status = $${params.length}`;
    case 'active':
      params.push('active');
      return `d.status = $${params.length}`;
    case 'pending_approval':
      params.push(['pending', 'pending_changes']);
      return `d.status = ANY($${params.length})`;
    case 'inactive':
      return `d.active = false`;
    case 'rejected':
      params.push('rejected');
      return `d.status = $${params.length}`;
    default:
      return '';
  }
}

function typeWhere(type: DsaType) {
  if (type === 'bt') return 'd.bt_journey_enabled = true';
  if (type === 'resale') return 'd.resale_enabled = true';
  if (type === 'afford') return 'd.is_affordable = true';
  return '';
}

function searchWhere(search: string | undefined, params: unknown[]) {
  const value = search?.trim();
  if (!value) return '';

  params.push(`%${value}%`);
  const ref = `$${params.length}`;
  return `(d.name ILIKE ${ref} OR d.email ILIKE ${ref} OR d.mobile_number ILIKE ${ref} OR o.name ILIKE ${ref} OR e.name ILIKE ${ref})`;
}

function cityWhere(cityId: string | undefined, params: unknown[]) {
  if (!cityId || cityId === 'all') return '';

  params.push(Number(cityId));
  return `d.city_id = $${params.length}`;
}

export async function getDsaOverview(options: {
  page: number;
  limit: number;
  search?: string;
  tab?: string;
  type?: string;
  cityId?: string;
}) {
  const tab = (options.tab || 'all') as DsaTab;
  const type = (options.type || 'all') as DsaType;
  const params: unknown[] = [];
  const filters = [tabWhere(tab, params), typeWhere(type), cityWhere(options.cityId, params), searchWhere(options.search, params)].filter(Boolean);
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const countParams = params.slice();
  const totalResult = await query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM direct_selling_agent d
      LEFT JOIN organization o ON o.id = d.organization_id
      LEFT JOIN employees e ON e.id = d.assigned_employee_id
      ${whereClause}
    `,
    countParams
  );

  params.push(options.limit);
  const limitRef = `$${params.length}`;
  params.push((options.page - 1) * options.limit);
  const offsetRef = `$${params.length}`;

  const rowsResult = await query<Record<string, unknown>>(
    `
      SELECT
        d.id,
        d.name,
        d.email,
        d.country_code,
        d.mobile_number,
        d.status,
        d.active,
        d.sub_type,
        d.platform,
        d.bt_journey_enabled,
        d.resale_enabled,
        d.is_affordable,
        d.inserted_at,
        c.name AS city_name,
        e.name AS assigned_employee_name,
        e.email AS assigned_employee_email,
        e.employee_code AS assigned_employee_code,
        o.name AS organization_name,
        o.firm_address AS organization_address,
        billing.billing_count,
        billing.billing_companies,
        commission.commission_count,
        commission.commission_structures,
        scorecards.scorecard_count,
        scorecards.average_score,
        scorecards.scorecards
      FROM direct_selling_agent d
      LEFT JOIN cities c ON c.id = d.city_id
      LEFT JOIN employees e ON e.id = d.assigned_employee_id
      LEFT JOIN organization o ON o.id = d.organization_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS billing_count,
          json_agg(
            json_build_object(
              'id', bc.id,
              'name', bc.name,
              'status', bc.status,
              'active', bc.active,
              'companyType', bc.company_type,
              'gstin', bc.gstin,
              'pan', bc.pan
            )
            ORDER BY bc.updated_at DESC NULLS LAST
          ) AS billing_companies
        FROM billing_company bc
        WHERE bc.dsa_id = d.id
           OR (d.organization_id IS NOT NULL AND bc.organization_id = d.organization_id)
      ) billing ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS commission_count,
          json_agg(
            json_build_object(
              'id', cs.id,
              'status', cs.status,
              'active', cs.active,
              'loanType', lt.display_name,
              'selfValue', cs.absolute_revenue_commission_processed_by_self,
              'selfUnit', cs.process_by_self_unit,
              'lnValue', cs.absolute_revenue_commission_processed_by_ln,
              'lnUnit', cs.process_by_ln_unit
            )
            ORDER BY cs.updated_at DESC NULLS LAST
          ) AS commission_structures
        FROM commission_structures cs
        LEFT JOIN loan_types lt ON lt.id = cs.loan_type_id
        WHERE cs.organization_id = d.organization_id
      ) commission ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS scorecard_count,
          ROUND(AVG(ds.score)::numeric, 1) AS average_score,
          json_agg(
            json_build_object(
              'id', ds.id,
              'productType', ds.product_type,
              'score', ds.score,
              'partnerRating', ds.partner_rating,
              'btJourneyEnabled', ds.bt_journey_enabled,
              'resaleEnabled', ds.resale_enabled,
              'isAffordable', ds.is_affordable
            )
            ORDER BY ds.updated_at DESC NULLS LAST
          ) AS scorecards
        FROM dsa_scorecards ds
        WHERE ds.dsa_id = d.id
          AND ds.active = true
      ) scorecards ON true
      ${whereClause}
      ORDER BY d.updated_at DESC NULLS LAST, d.id DESC
      LIMIT ${limitRef}
      OFFSET ${offsetRef}
    `,
    params
  );

  const countsResult = await query<Record<string, number>>(`
    SELECT
      COUNT(*)::int AS all,
      COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status IN ('pending', 'pending_changes'))::int AS pending_approval,
      COUNT(*) FILTER (WHERE active = false)::int AS inactive,
      COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
      COUNT(*) FILTER (WHERE bt_journey_enabled = true)::int AS bt,
      COUNT(*) FILTER (WHERE resale_enabled = true)::int AS resale,
      COUNT(*) FILTER (WHERE is_affordable = true)::int AS afford
    FROM direct_selling_agent
  `);

  const citiesResult = await query<{ id: string; name: string; count: number }>(`
    SELECT c.id::text, c.name, COUNT(d.id)::int AS count
    FROM direct_selling_agent d
    JOIN cities c ON c.id = d.city_id
    GROUP BY c.id, c.name
    ORDER BY c.name
  `);

  return {
    rows: rowsResult.rows,
    total: totalResult.rows[0]?.count ?? 0,
    page: options.page,
    pageSize: options.limit,
    counts: countsResult.rows[0],
    filters: {
      cities: citiesResult.rows
    },
    mapping: {
      assignedEmployee: 'direct_selling_agent.assigned_employee_id -> employees.id',
      organisation: 'direct_selling_agent.organization_id -> organization.id',
      billing: 'billing_company.dsa_id or billing_company.organization_id',
      commission: 'commission_structures.organization_id -> organization.id',
      scorecards: 'dsa_scorecards.dsa_id -> direct_selling_agent.id',
      unsupported: ['Separate product category dropdown named "All DSAs" is represented by DSA type flags available in schema.']
    }
  };
}
