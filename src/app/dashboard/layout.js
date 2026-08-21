'use client';
import { useState } from 'react';
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
  TrendingUp
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'POS Billing', href: '/pos', icon: ShoppingCart },
  { name: 'Products', href: '/dashboard/products', icon: Package },
  { name: 'Barcodes', href: '/dashboard/barcodes', icon: Barcode },
  { name: 'Purchases (Inward)', href: '/dashboard/purchases', icon: Truck },
  { name: 'Retail Customers', href: '/dashboard/customers', icon: Users },
  { name: 'Suppliers', href: '/dashboard/suppliers', icon: Users },
  { name: 'Invoices & Returns', href: '/dashboard/sales', icon: ReceiptText },
  { name: 'Expenses', href: '/dashboard/expenses', icon: IndianRupee },
  { name: 'Reports', href: '/dashboard/reports', icon: TrendingUp },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

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
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:w-64 flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
            <div className="text-xl font-serif font-bold text-primary">Kajri POS</div>
            <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto custom-scrollbar">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`
                    flex items-center px-4 py-3 text-sm rounded-lg transition-colors
                    ${isActive 
                      ? 'bg-primary/10 text-primary font-semibold' 
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
                  `}
                >
                  <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'text-primary' : 'text-gray-400'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200">
            <button onClick={handleLogout} className="flex items-center w-full px-4 py-3 text-sm text-red-600 rounded-lg hover:bg-red-50 transition-colors">
              <LogOut className="w-5 h-5 mr-3" />
              Logout
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Header */}
          <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 shadow-sm z-10 justify-between lg:justify-end">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-6 h-6 text-gray-600" />
            </button>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">Admin</span>
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold">
                A
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto bg-gray-50 p-6 custom-scrollbar">
            {children}
          </main>
        </div>
      </div>
    </DataProvider>
  );
}
