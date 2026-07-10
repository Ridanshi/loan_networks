import {
  Banknote,
  Building2,
  ChevronDown,
  CircleDollarSign,
  FileCheck2,
  FilePlus2,
  GitBranch,
  Home,
  Landmark,
  LayoutDashboard,
  Link2,
  Plus,
  QrCode,
  Receipt,
  ScrollText,
  SearchCheck,
  ShieldCheck,
  Users
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const primaryLinks = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/all-dsa', label: 'All DSA', icon: Users },
  { to: '/add-dsa', label: 'Add DSA', icon: Plus, disabled: true }
];

const groupedLinks = [
  {
    label: 'BT Journey',
    items: [
      { to: '/bt-journeys', label: 'All Journeys', icon: GitBranch },
      { to: '/bt-journeys/create', label: 'Create Journey', icon: FilePlus2, disabled: true }
    ]
  },
  {
    label: 'Project Management',
    items: [
      { to: '/projects', label: 'All Projects', icon: Home },
      { to: '/add-project', label: 'Add Project', icon: FilePlus2, disabled: true },
      { to: '/builders', label: 'Manage Builders', icon: Building2 },
      { to: '/bankers', label: 'Manage Bankers', icon: Landmark },
      { to: '/lending-partners', label: 'Lending Partners', icon: Users },
      { to: '/lender-offers', label: 'Lender Offers', icon: SearchCheck },
      { to: '/lender-offer-pools', label: 'Lender Offer Pools', icon: SearchCheck },
      { to: '/qr-code-generator', label: 'QR Code Generator', icon: QrCode },
      { to: '/short-urls', label: 'Short URLs', icon: Link2 }
    ]
  },
  {
    label: 'Operations',
    items: [
      { to: '/disbursements', label: 'Disbursements', icon: Banknote },
      { to: '/dsa-invoices', label: 'DSA Invoices', icon: Receipt },
      { to: '/collections', label: 'Collections', icon: CircleDollarSign },
      { to: '/payouts', label: 'Payouts', icon: ScrollText },
      { to: '/commission-approvals', label: 'Commission Approvals', icon: FileCheck2 }
    ]
  },
  {
    label: 'Banking / Admin',
    items: [
      { to: '/banks', label: 'Banks', icon: Landmark },
      { to: '/bank-offers', label: 'Bank Offers', icon: Banknote },
      { to: '/bank-bills', label: 'Bank Bills', icon: Receipt },
      { to: '/bank-summary', label: 'Bank Summary', icon: ScrollText },
      { to: '/billing-companies', label: 'Billing Companies', icon: ShieldCheck }
    ]
  }
];

function NavRow({ item, nested = false }) {
  const Icon = item.icon;
  const baseClass = [
    'flex w-full shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
    nested ? 'pl-8' : '',
    item.disabled ? 'cursor-not-allowed text-slate-400' : ''
  ].join(' ');

  if (item.disabled) {
    return (
      <NavLink to={item.to} className={`${baseClass} hover:bg-slate-50`} title="Coming soon">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">Soon</span>
      </NavLink>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        [
          baseClass,
          isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
        ].join(' ')
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="min-w-0 truncate">{item.label}</span>
    </NavLink>
  );
}

function NavSection({ group }) {
  const location = useLocation();
  const startsOpen = group.items.some((item) => location.pathname === item.to);
  const [open, setOpen] = useState(startsOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100"
      >
        <span>{group.label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="mt-1 space-y-1">
          {group.items.map((item) => (
            <NavRow key={item.to} item={item} nested />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:border-r">
      <div className="border-b border-slate-200 px-4 py-4">
        <h1 className="text-lg font-semibold text-slate-950">Loan Networks</h1>
        <p className="mt-1 text-sm text-slate-500">Internal operations admin</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 py-3 lg:block lg:space-y-2 lg:overflow-y-auto">
        <div className="flex gap-1 lg:block lg:space-y-1">
          {primaryLinks.map((item) => (
            <NavRow key={item.to} item={item} />
          ))}
        </div>
        {groupedLinks.map((group) => (
          <NavSection key={group.label} group={group} />
        ))}
      </nav>
    </aside>
  );
}
