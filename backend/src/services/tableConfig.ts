export type PageKey =
  | 'all-dsa'
  | 'projects'
  | 'builders'
  | 'bankers'
  | 'lending-partners'
  | 'lender-offers'
  | 'lender-offer-pools'
  | 'qr-code-generator'
  | 'short-urls'
  | 'disbursements'
  | 'dsa-invoices'
  | 'collections'
  | 'payouts'
  | 'commission-approvals'
  | 'banks'
  | 'bank-offers'
  | 'bank-bills'
  | 'bank-summary'
  | 'billing-companies';

export type TableConfig = {
  table: string;
  label: string;
  columns: string[];
  searchColumns: string[];
  dashboardKey: string;
  includeInDashboard?: boolean;
};

export const tableConfigs: Record<PageKey, TableConfig> = {
  'all-dsa': {
    table: 'external_dsa',
    label: 'All DSA',
    columns: [],
    searchColumns: ['id', 'name', 'full_name', 'email', 'mobile_number', 'status'],
    dashboardKey: 'allDsa',
    includeInDashboard: false
  },
  projects: {
    table: 'projects',
    label: 'All Projects',
    columns: [],
    searchColumns: ['id', 'name', 'project_name', 'status'],
    dashboardKey: 'projects',
    includeInDashboard: true
  },
  builders: {
    table: 'builders',
    label: 'Manage Builders',
    columns: [],
    searchColumns: ['id', 'name', 'builder_name', 'email', 'phone', 'status'],
    dashboardKey: 'builders',
    includeInDashboard: true
  },
  bankers: {
    table: 'bankers',
    label: 'Manage Bankers',
    columns: [],
    searchColumns: ['id', 'name', 'banker_name', 'email', 'phone', 'bank_name', 'status'],
    dashboardKey: 'bankers',
    includeInDashboard: true
  },
  'lending-partners': {
    table: 'lending_partners',
    label: 'Lending Partners',
    columns: [],
    searchColumns: ['id', 'name', 'partner_name', 'email', 'phone', 'status'],
    dashboardKey: 'lendingPartners',
    includeInDashboard: true
  },
  'lender-offers': {
    table: 'lender_offers',
    label: 'Lender Offers',
    columns: [],
    searchColumns: ['id', 'name', 'short_name', 'loan_type_label', 'institution_type'],
    dashboardKey: 'lenderOffers',
    includeInDashboard: false
  },
  'lender-offer-pools': {
    table: 'lender_offer_pools',
    label: 'Lender Offer Pools',
    columns: [],
    searchColumns: ['id', 'type', 'active'],
    dashboardKey: 'lenderOfferPools',
    includeInDashboard: false
  },
  'qr-code-generator': {
    table: 'qrs',
    label: 'QR Code Generator',
    columns: [],
    searchColumns: ['id', 'name', 'status', 'short_url'],
    dashboardKey: 'qrs',
    includeInDashboard: false
  },
  'short-urls': {
    table: 'short_urls',
    label: 'Short URLs',
    columns: [],
    searchColumns: ['id', 'original_path'],
    dashboardKey: 'shortUrls',
    includeInDashboard: false
  },
  disbursements: {
    table: 'disbursements',
    label: 'Disbursements',
    columns: [
      'id',
      'loan_account_number',
      'disbursement_amount',
      'status',
      'disbursement_type',
      'pending_approval_role',
      'acknowledgement_status',
      'primary_payout_status',
      'billing_company_id',
      'commission_amount'
    ],
    searchColumns: ['id', 'loan_account_number', 'status', 'disbursement_type'],
    dashboardKey: 'disbursements',
    includeInDashboard: true
  },
  'dsa-invoices': {
    table: 'dsa_invoices',
    label: 'DSA Invoices',
    columns: [
      'customer_invoice_number',
      'invoice_amount',
      'invoice_gst',
      'customer_invoice_date',
      'billing_company_id',
      'dsa_id',
      'invoice_url',
      'status'
    ],
    searchColumns: ['id', 'customer_invoice_number', 'status', 'dsa_id', 'billing_company_id'],
    dashboardKey: 'dsaInvoices',
    includeInDashboard: true
  },
  collections: {
    table: 'collections',
    label: 'Collections',
    columns: ['id', 'amount', 'amount_collected', 'gst', 'tds', 'collection_date', 'status'],
    searchColumns: ['id', 'amount', 'amount_collected', 'status'],
    dashboardKey: 'collections',
    includeInDashboard: true
  },
  payouts: {
    table: 'payouts',
    label: 'Payouts',
    columns: ['payment_reference_id', 'payment_date', 'amount_credited', 'payment_gateway', 'payment_mode', 'status', 'invoice_id', 'dsa_id'],
    searchColumns: ['id', 'payment_reference_id', 'status', 'payment_gateway', 'payment_mode'],
    dashboardKey: 'payouts',
    includeInDashboard: true
  },
  'commission-approvals': {
    table: 'commission_approvals',
    label: 'Commission Approvals',
    columns: ['commission_structure_id', 'reporting_manager_id', 'next_approval_id', 'status'],
    searchColumns: ['id', 'status', 'reporting_manager_id', 'next_approval_id'],
    dashboardKey: 'commissionApprovals',
    includeInDashboard: true
  },
  banks: {
    table: 'banks',
    label: 'Banks',
    columns: [],
    searchColumns: ['id', 'name', 'short_name', 'status'],
    dashboardKey: 'banks',
    includeInDashboard: false
  },
  'bank-offers': {
    table: 'bank_offers',
    label: 'Bank Offers',
    columns: [],
    searchColumns: ['id', 'name', 'status'],
    dashboardKey: 'bankOffers',
    includeInDashboard: false
  },
  'bank-bills': {
    table: 'bank_bills',
    label: 'Bank Bills',
    columns: [],
    searchColumns: ['id', 'invoice_number', 'status'],
    dashboardKey: 'bankBills',
    includeInDashboard: false
  },
  'bank-summary': {
    table: 'bank_summary',
    label: 'Bank Summary',
    columns: [],
    searchColumns: ['id', 'status'],
    dashboardKey: 'bankSummary',
    includeInDashboard: false
  },
  'billing-companies': {
    table: 'billing_company',
    label: 'Billing Companies',
    columns: [],
    searchColumns: ['id', 'name', 'status'],
    dashboardKey: 'billingCompanies',
    includeInDashboard: false
  }
};

export const dashboardTables = Object.values(tableConfigs).filter((config) => config.includeInDashboard);
