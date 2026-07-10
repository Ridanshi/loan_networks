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
    paid: { column: 'primary_payout_status', operator: '=', value: 'paid' }
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
