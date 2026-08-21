import { Inter } from "next/font/google";
import POSLogoutButton from "@/components/POSLogoutButton";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Kajri POS - Billing Counter",
};

export default function POSLayout({ children }) {
  return (
    <div className={`min-h-screen bg-gray-50 flex flex-col ${inter.className}`}>
      {/* Top Bar for POS */}
      <header className="h-14 bg-primary text-white flex items-center justify-between px-6 shadow-md z-10 shrink-0">
        <div className="flex items-center gap-6">
          <div className="text-xl font-serif font-bold tracking-wider">KAJRI SAREES</div>
          <div className="text-xs font-medium bg-white/20 px-3 py-1 rounded-full uppercase tracking-widest hidden md:block">
            Billing Counter
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          <div className="hidden sm:block">Cashier: Admin</div>
          <a href="/dashboard" className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded transition-colors text-xs font-medium">
            Exit to Admin
          </a>
          <POSLogoutButton />
        </div>
      </header>
      
      {/* Main POS Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {children}
      </main>
    </div>
  );
}
