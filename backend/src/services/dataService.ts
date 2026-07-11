import { query } from '../config/db.js';
import { dashboardTables, tableConfigs, type PageKey, type TableConfig } from './tableConfig.js';
import { getTableColumns, tableExists } from './schemaService.js';

const tabsByPage: Partial<Record<PageKey, Record<string, { column: string; operator: '=' | 'in'; value: string | string[] }>>> = {
  disbursements: {
    pending_ops: { column: 'pending_approval_role', operator: '=', value: 'operations' },
    pending_finance: { column: 'pending_approval_role', operator: 'in', value: ['finance', 'finance_manager'] },
    changes_requested: { column: 'status', operator: '=', value: 'changes_requested' },
    approved: { column: 'status', operator: '=', value: 'approved' },
    acknowledged: { column: 'acknowledgement_status', operator: '=', value: 'acknowledged' },
    rejected: { column: 'status', operator: '=', value: 'rejected' },
    paid: { column: 'primary_payout_status', operator: '=', value: 'paid' },
    needs_review: { column: 'status', operator: '=', value: 'needs_review' }
  },
  'dsa-invoices': {
    approved: { column: 'status', operator: '=', value: 'approved' },
    paid: { column: 'status', operator: '=', value: 'paid' }
  },
  'commission-approvals': {
    pending: { column: 'status', operator: '=', value: 'pending' },
    approval_waiting: { column: 'status', operator: '=', value: 'approval_waiting' },
    approved: { column: 'status', operator: '=', value: 'approved' },
    auto_approved: { column: 'status', operator: '=', value: 'auto_approved' },
    rejected: { column: 'status', operator: '=', value: 'rejected' },
    auto_rejected: { column: 'status', operator: '=', value: 'auto_rejected' }
  }
};

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function resolveConfig(page: PageKey) {
  const config = tableConfigs[page];

  if (!config) {
    throw new Error(`Unknown page: ${page}`);
  }

  const exists = await tableExists(config.table);
  if (!exists) {
    throw new Error(`Table "${config.table}" was not found in the public schema`);
  }

  const schemaColumns = await getTableColumns(config.table);
  const availableColumnSet = new Set(schemaColumns.map((column) => column.column_name));
  const selectedColumns = config.columns.length
    ? config.columns.filter((column) => availableColumnSet.has(column))
    : schemaColumns.map((column) => column.column_name);
  const missingColumns = config.columns.filter((column) => !availableColumnSet.has(column));
  const searchColumns = config.searchColumns.filter((column) => availableColumnSet.has(column));

  return {
    config,
    selectedColumns: selectedColumns.length ? selectedColumns : schemaColumns.slice(0, 8).map((column) => column.column_name),
    missingColumns,
    searchColumns,
    availableColumnSet
  };
}

function buildTabWhere(
  page: PageKey,
  tab: string | undefined,
  availableColumnSet: Set<string>,
  params: unknown[]
) {
  const tabConfig = tab ? tabsByPage[page]?.[tab] : undefined;

  if (!tabConfig || !availableColumnSet.has(tabConfig.column)) {
    return '';
  }

  if (tabConfig.operator === 'in') {
    params.push(tabConfig.value);
    return `${quoteIdentifier(tabConfig.column)} = ANY($${params.length})`;
  }

  params.push(tabConfig.value);
  return `${quoteIdentifier(tabConfig.column)} = $${params.length}`;
}

function buildSearchWhere(search: string | undefined, columns: string[], params: unknown[]) {
  const trimmed = search?.trim();

  if (!trimmed || columns.length === 0) {
    return '';
  }

  params.push(`%${trimmed}%`);
  const paramRef = `$${params.length}`;

  return columns.map((column) => `${quoteIdentifier(column)}::text ILIKE ${paramRef}`).join(' OR ');
}

function buildOrderBy(config: TableConfig, selectedColumns: string[], availableColumnSet: Set<string>) {
  if (availableColumnSet.has('id')) {
    return 'ORDER BY "id" DESC NULLS LAST';
  }

  if (availableColumnSet.has('created_at')) {
    return 'ORDER BY "created_at" DESC NULLS LAST';
  }

  return `ORDER BY ${quoteIdentifier(selectedColumns[0] || config.columns[0])} DESC`;
}

export async function getDashboardSummary() {
  const summary: Record<string, number> = {};

  for (const config of dashboardTables) {
    const exists = await tableExists(config.table);

    if (!exists) {
      throw new Error(`Table "${config.table}" was not found in the public schema`);
    }

    const result = await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(config.table)}`);
    summary[config.dashboardKey] = result.rows[0]?.count ?? 0;
  }

  return summary;
}

// Disbursements alone gets a joined listing — customer_name/bank_name/branch/
// application_id/loan_type/sanction_amount live on applications/leads/
// lending_partners/loan_types, not on disbursements itself. Same join shape
// as verifyService.ts's buildExpectedFields, applied here to the whole list
// instead of a single row. All tab-filter columns below are qualified with
// "d." since disbursements and applications both have a "status" column.
const DISBURSEMENTS_TAB_WHERE: Record<string, { clause: string; value: string | string[] }> = {
  pending_ops: { clause: 'd.pending_approval_role = $', value: 'operations' },
  pending_finance: { clause: 'd.pending_approval_role = ANY($)', value: ['finance', 'finance_manager'] },
  changes_requested: { clause: 'd.status = $', value: 'changes_requested' },
  approved: { clause: 'd.status = $', value: 'approved' },
  acknowledged: { clause: 'd.acknowledgement_status = $', value: 'acknowledged' },
  rejected: { clause: 'd.status = $', value: 'rejected' },
  paid: { clause: 'd.primary_payout_status = $', value: 'paid' },
  needs_review: { clause: 'd.status = $', value: 'needs_review' }
};

const DISBURSEMENTS_JOIN = `
  FROM disbursements d
  JOIN applications      a  ON d.application_id     = a.id
  JOIN leads             l  ON a.lead_id            = l.id
  JOIN lending_partners  lp ON a.lending_partner_id = lp.id
  LEFT JOIN loan_types   lt ON l.loan_type_id        = lt.id
`;

const DISBURSEMENTS_COLUMNS = [
  'id',
  'customer_name',
  'bank_name',
  'application_id',
  'branch',
  'loan_type',
  'loan_account_number',
  'sanction_amount',
  'disbursement_amount',
  'disbursement_date',
  'status',
  'disbursement_type',
  'pending_approval_role',
  'acknowledgement_status',
  'primary_payout_status',
  'billing_company_id',
  'commission_amount'
];

export async function getDisbursementsList(options: { search?: string; tab?: string; page: number; pageSize: number }) {
  const params: unknown[] = [];
  const whereParts: string[] = [];

  const tabConfig = options.tab ? DISBURSEMENTS_TAB_WHERE[options.tab] : undefined;
  if (tabConfig) {
    params.push(tabConfig.value);
    whereParts.push(tabConfig.clause.replace('$', `$${params.length}`));
  }

  const trimmedSearch = options.search?.trim();
  if (trimmedSearch) {
    params.push(`%${trimmedSearch}%`);
    const paramRef = `$${params.length}`;
    whereParts.push(
      `(d.loan_account_number ILIKE ${paramRef} OR l.name ILIKE ${paramRef} OR lp.name ILIKE ${paramRef} OR a.bank_application_id ILIKE ${paramRef})`
    );
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const countResult = await query<{ count: number }>(`SELECT COUNT(*)::int AS count ${DISBURSEMENTS_JOIN} ${whereClause}`, params);

  params.push(options.pageSize);
  const limitRef = `$${params.length}`;
  params.push((options.page - 1) * options.pageSize);
  const offsetRef = `$${params.length}`;

  const dataResult = await query<Record<string, unknown>>(
    `
      SELECT
        d.id,
        l.name                                   AS customer_name,
        lp.name                                   AS bank_name,
        a.bank_application_id                     AS application_id,
        a.branch_name                             AS branch,
        COALESCE(lt.display_name, a.loan_type)    AS loan_type,
        d.loan_account_number,
        (a.sanctioned_amount   / 100.0)::numeric  AS sanction_amount,
        (d.disbursement_amount / 100.0)::numeric  AS disbursement_amount,
        d.disbursement_date,
        d.status,
        d.disbursement_type,
        d.pending_approval_role,
        d.acknowledgement_status,
        d.primary_payout_status,
        d.billing_company_id,
        d.commission_amount
      ${DISBURSEMENTS_JOIN}
      ${whereClause}
      ORDER BY d.id DESC NULLS LAST
      LIMIT ${limitRef}
      OFFSET ${offsetRef}
    `,
    params
  );

  return {
    label: 'Disbursements',
    table: 'disbursements',
    columns: DISBURSEMENTS_COLUMNS,
    missingColumns: [],
    rows: dataResult.rows,
    total: countResult.rows[0]?.count ?? 0,
    page: options.page,
    pageSize: options.pageSize
  };
}

export async function getPageData(page: PageKey, options: { search?: string; tab?: string; page: number; pageSize: number }) {
  const { config, selectedColumns, missingColumns, searchColumns, availableColumnSet } = await resolveConfig(page);
  const params: unknown[] = [];
  const whereParts = [
    buildTabWhere(page, options.tab, availableColumnSet, params),
    buildSearchWhere(options.search, searchColumns, params)
  ].filter(Boolean);

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const countResult = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(config.table)} ${whereClause}`,
    params
  );

  params.push(options.pageSize);
  const limitRef = `$${params.length}`;
  params.push((options.page - 1) * options.pageSize);
  const offsetRef = `$${params.length}`;

  const dataResult = await query<Record<string, unknown>>(
    `
      SELECT ${selectedColumns.map(quoteIdentifier).join(', ')}
      FROM ${quoteIdentifier(config.table)}
      ${whereClause}
      ${buildOrderBy(config, selectedColumns, availableColumnSet)}
      LIMIT ${limitRef}
      OFFSET ${offsetRef}
    `,
    params
  );

  return {
    label: config.label,
    table: config.table,
    columns: selectedColumns,
    missingColumns,
    rows: dataResult.rows,
    total: countResult.rows[0]?.count ?? 0,
    page: options.page,
    pageSize: options.pageSize
  };
}
