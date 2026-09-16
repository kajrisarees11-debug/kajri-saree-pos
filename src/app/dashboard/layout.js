'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { DataProvider } from '@/context/DataContext';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Settings, 
  Menu, 
  X, 
  LogOut,
  ReceiptText,
  Truck,
  IndianRupee,
  Barcode,
  TrendingUp,
  Warehouse,
  ArrowLeftRight,
  CreditCard,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Download,
  BookOpen,
  PieChart,
  Banknote,
  UserCheck,
  Building2,
  FileBarChart,
  RefreshCw,
  Wallet,
} from 'lucide-react';

// ─── Navigation tree (Vyapar-familiar structure) ───────────────────────────────
const navigation = [
  {
    name: 'Home',
    href: '/dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    name: 'POS Billing',
    href: '/pos',
    icon: ShoppingCart,
    badge: 'FAST',
  },
  {
    name: 'Parties',
    icon: Users,
    children: [
      { name: 'Customers',  href: '/dashboard/customers',  icon: UserCheck },
      { name: 'Suppliers',  href: '/dashboard/suppliers',  icon: Building2 },
    ],
  },
  {
    name: 'Items',
    icon: Package,
    children: [
      { name: 'Products',          href: '/dashboard/products',         icon: Package },
      { name: 'Barcodes',          href: '/dashboard/barcodes',         icon: Barcode },
      { name: 'Stock Adjustments', href: '/dashboard/stock-adjustments',icon: Warehouse },
    ],
  },
  {
    name: 'Sale',
    icon: ReceiptText,
    children: [
      { name: 'Sales / Invoices', href: '/dashboard/sales',         icon: ReceiptText },
      { name: 'Sales Returns',    href: '/dashboard/sales-returns',  icon: RotateCcw },
      { name: 'Payments In',      href: '/dashboard/payments-in',    icon: IndianRupee },
    ],
  },
  {
    name: 'Purchase & Expense',
    icon: Truck,
    children: [
      { name: 'Purchases (Inward)', href: '/dashboard/purchases',         icon: Truck },
      { name: 'Purchase Returns',   href: '/dashboard/purchase-returns',  icon: ArrowLeftRight },
      { name: 'Expenses',           href: '/dashboard/expenses',          icon: Banknote },
      { name: 'Payments Out',       href: '/dashboard/payments-out',      icon: CreditCard },
    ],
  },
  {
    name: 'Cash & Bank',
    icon: Wallet,
    children: [
      { name: 'Cash Transactions', href: '/dashboard/cash',        icon: Banknote },
      { name: 'Bank Accounts',     href: '/dashboard/bank',        icon: Building2 },
    ],
  },
  {
    name: 'Reports',
    icon: TrendingUp,
    children: [
      { name: 'Summary Report',    href: '/dashboard/reports',            icon: FileBarChart },
      { name: 'Profit & Loss',     href: '/dashboard/reports/profit-loss',icon: TrendingUp },
      { name: 'Balance Sheet',     href: '/dashboard/reports/balance-sheet', icon: BookOpen },
      { name: 'Trial Balance',     href: '/dashboard/reports/trial-balance', icon: RotateCcw },
      { name: 'Stock Report',      href: '/dashboard/reports/stock',       icon: Warehouse },
      { name: 'Party Statement',   href: '/dashboard/reports/party',       icon: BookOpen },
      { name: 'Item-wise Sales',   href: '/dashboard/reports/items',       icon: PieChart },
    ],
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
];

// ─── Sidebar nav item ──────────────────────────────────────────────────────────
function NavItem({ item, pathname, depth = 0 }) {
  const isExact = item.exact ? pathname === item.href : false;
  const isActive = item.href 
    ? (item.exact ? pathname === item.href : pathname.startsWith(item.href))
    : item.children?.some(c => pathname.startsWith(c.href));
  
  const [open, setOpen] = useState(isActive);
  
  // Auto-open if a child is active
  useEffect(() => {
    if (item.children?.some(c => pathname.startsWith(c.href))) {
      setOpen(true);
    }
  }, [pathname, item.children]);

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className={`
            w-full flex items-center px-4 py-2.5 text-sm rounded-lg transition-all duration-150
            ${isActive 
              ? 'bg-primary/10 text-primary font-semibold' 
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
          `}
        >
          <item.icon className={`w-4.5 h-4.5 mr-3 flex-shrink-0 ${isActive ? 'text-primary' : 'text-gray-400'}`} />
          <span className="flex-1 text-left">{item.name}</span>
          {open 
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          }
        </button>
        {open && (
          <div className="ml-4 mt-0.5 border-l border-gray-100 pl-3 space-y-0.5">
            {item.children.map(child => (
              <NavItem key={child.href} item={child} pathname={pathname} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={`
        flex items-center px-4 py-2.5 text-sm rounded-lg transition-all duration-150 relative
        ${isActive 
          ? 'bg-primary/10 text-primary font-semibold' 
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
      `}
    >
      <item.icon className={`w-4 h-4 mr-3 flex-shrink-0 ${isActive ? 'text-primary' : 'text-gray-400'}`} />
      <span className="flex-1">{item.name}</span>
      {item.badge && (
        <span className="text-[9px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-full leading-none">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// ─── Main layout ───────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <DataProvider>
      <div className="flex h-screen bg-gray-50 overflow-hidden">

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 
          transform transition-transform duration-300 ease-in-out flex flex-col
          lg:translate-x-0 lg:static lg:w-60
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          {/* Logo */}
          <div className="flex items-center justify-between h-14 px-5 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
                <span className="text-[#d4af37] font-bold text-lg font-serif leading-none">K</span>
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900 leading-tight">Kajri POS</div>
                <div className="text-[10px] text-gray-400 leading-tight">Sarees & Retail</div>
              </div>
            </div>
            <button className="lg:hidden p-1" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto custom-scrollbar text-sm">
            {navigation.map((item) => (
              <NavItem key={item.name} item={item} pathname={pathname} />
            ))}
          </nav>

          {/* Bottom user area */}
          <div className="p-3 border-t border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
              <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0">A</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">Admin</div>
                <div className="text-[10px] text-gray-400 truncate">Kajri Sarees</div>
              </div>
            </div>
            <button 
              onClick={handleLogout} 
              className="flex items-center w-full px-3 py-2 text-xs text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Logout
            </button>
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          
          {/* Top header */}
          <header className="h-14 bg-white border-b border-gray-200 flex items-center px-5 shadow-sm z-10 justify-between flex-shrink-0">
            <button className="lg:hidden p-1" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <div className="hidden lg:block text-sm text-gray-500 font-medium">
              {/* breadcrumb placeholder — pages can override via a context if needed */}
            </div>
            <div className="flex items-center gap-3">
              <Link 
                href="https://github.com/kajrisarees11-debug/kajri-saree-pos/releases/latest/download/Kajri%20POS%20Setup%201.0.0.exe"
                className="hidden sm:flex items-center gap-1.5 bg-gradient-to-r from-gray-800 to-black text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Download App
              </Link>
              <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-white font-bold text-xs cursor-pointer">
                A
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-gray-50 p-5 custom-scrollbar">
            {children}
          </main>
        </div>
      </div>
    </DataProvider>
  );
}
