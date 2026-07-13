import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import App from './App';
import AllDsaPage from './pages/AllDsaPage';
import BtJourneysPage from './pages/BtJourneysPage';
import ComingSoon from './pages/ComingSoon';
import Dashboard from './pages/Dashboard';
import DataPage from './pages/DataPage';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'all-dsa', element: <AllDsaPage /> },
      { path: 'add-dsa', element: <ComingSoon title="Add DSA" description="DSA creation is not enabled because no verified writable workflow has been mapped." /> },
      { path: 'bt-journeys', element: <BtJourneysPage /> },
      {
        path: 'bt-journeys/create',
        element: (
          <ComingSoon
            title="Create Journey"
            description="BT Journey tables are readable, but this demo has no verified writable create workflow or mutation contract."
          />
        )
      },
      { path: 'projects', element: <DataPage pageKey="projects" title="All Projects" /> },
      {
        path: 'add-project',
        element: <ComingSoon title="Add Project" description="Project creation is not enabled because this demo is read-only against the live schema." />
      },
      { path: 'builders', element: <DataPage pageKey="builders" title="Manage Builders" /> },
      { path: 'bankers', element: <DataPage pageKey="bankers" title="Manage Bankers" /> },
      { path: 'lending-partners', element: <DataPage pageKey="lending-partners" title="Lending Partners" /> },
      { path: 'lender-offers', element: <DataPage pageKey="lender-offers" title="Lender Offers" /> },
      { path: 'lender-offer-pools', element: <DataPage pageKey="lender-offer-pools" title="Lender Offer Pools" /> },
      { path: 'qr-code-generator', element: <DataPage pageKey="qr-code-generator" title="QR Code Generator" /> },
      { path: 'short-urls', element: <DataPage pageKey="short-urls" title="Short URLs" /> },
      {
        path: 'disbursements',
        element: (
          <DataPage
            pageKey="disbursements"
            title="Disbursements"
            enableDisbursementActions
            tabs={[
              { key: 'pending_ops', label: 'Pending on Ops' },
              { key: 'pending_finance', label: 'Pending on Finance' },
              { key: 'changes_requested', label: 'Changes Requested' },
              { key: 'approved', label: 'Approved' },
              { key: 'acknowledged', label: 'Acknowledged' },
              { key: 'rejected', label: 'Rejected' },
              { key: 'paid', label: 'Paid' },
              { key: 'needs_review', label: 'Needs Review' }
            ]}
          />
        )
      },
      {
        path: 'dsa-invoices',
        element: (
          <DataPage
            pageKey="dsa-invoices"
            title="DSA Invoices"
            tabs={[
              { key: 'approved', label: 'Approved' },
              { key: 'paid', label: 'Paid' }
            ]}
          />
        )
      },
      { path: 'collections', element: <DataPage pageKey="collections" title="Collections" /> },
      { path: 'payouts', element: <DataPage pageKey="payouts" title="Payouts" /> },
      {
        path: 'commission-approvals',
        element: (
          <DataPage
            pageKey="commission-approvals"
            title="Commission Approvals"
            tabs={[
              { key: 'pending', label: 'Pending' },
              { key: 'approval_waiting', label: 'Approval Waiting' },
              { key: 'approved', label: 'Approved' },
              { key: 'auto_approved', label: 'Auto Approved' },
              { key: 'rejected', label: 'Rejected' },
              { key: 'auto_rejected', label: 'Auto Rejected' }
            ]}
          />
        )
      },
      { path: 'banks', element: <DataPage pageKey="banks" title="Banks" /> },
      { path: 'bank-offers', element: <DataPage pageKey="bank-offers" title="Bank Offers" /> },
      { path: 'bank-bills', element: <DataPage pageKey="bank-bills" title="Bank Bills" /> },
      { path: 'bank-summary', element: <DataPage pageKey="bank-summary" title="Bank Summary" /> },
      { path: 'billing-companies', element: <DataPage pageKey="billing-companies" title="Billing Companies" /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
