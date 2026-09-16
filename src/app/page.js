import Link from 'next/link';
import { Download, LayoutDashboard, MonitorSmartphone, ShieldCheck, Zap } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0b12] via-[#2c1220] to-[#1a0b12] text-white selection:bg-[#8B1A4A] selection:text-white">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-[#8B1A4A] to-[#C93370] flex items-center justify-center font-bold text-xl shadow-[0_0_15px_rgba(139,26,74,0.5)]">
              K
            </div>
            <span className="font-bold text-xl tracking-tight text-white/90">Kajri<span className="text-[#C93370]">POS</span></span>
          </div>
          <div className="flex gap-4 items-center">
            <Link 
              href="/dashboard"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Web Login
            </Link>
            <Link 
              href="https://github.com/kajrisarees11-debug/kajri-saree-pos/releases/latest/download/Kajri.POS.Setup.1.0.0.exe"
              className="text-sm font-medium bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-all flex items-center gap-2"
            >
              <Download size={16} />
              <span>Download</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[#C93370] text-sm font-medium mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C93370] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C93370]"></span>
          </span>
          Version 1.0.0 Now Available
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/60">
          The Next-Gen POS for <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#8B1A4A] to-[#D54381]">Kajri Sarees</span>
        </h1>
        
        <p className="text-lg md:text-xl text-white/60 max-w-2xl mb-10 leading-relaxed">
          Lightning-fast offline billing, intelligent inventory syncing, and comprehensive business analytics—all packaged in a beautiful native Windows application.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link 
            href="https://github.com/kajrisarees11-debug/kajri-saree-pos/releases/latest/download/Kajri%20POS%20Setup%201.0.0.exe"
            className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 font-bold text-white transition-all duration-200 bg-[#8B1A4A] rounded-xl hover:bg-[#A32057] hover:shadow-[0_0_40px_rgba(139,26,74,0.4)] hover:-translate-y-1 overflow-hidden"
          >
            <div className="absolute inset-0 w-full h-full -x-100 bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-shimmer" />
            <Download size={22} />
            <span>Download for Windows</span>
          </Link>
          
          <Link 
            href="/dashboard"
            className="inline-flex items-center justify-center gap-3 px-8 py-4 font-semibold text-white/90 transition-all duration-200 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white"
          >
            <LayoutDashboard size={22} />
            <span>Open Web Version</span>
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-6 mt-32 w-full text-left">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-[#8B1A4A]/20 flex items-center justify-center text-[#D54381] mb-4">
              <Zap size={24} />
            </div>
            <h3 className="text-xl font-bold mb-2">Offline First</h3>
            <p className="text-white/60 text-sm leading-relaxed">Continue billing even without internet. Data syncs automatically in the background once you are back online.</p>
          </div>

          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-[#8B1A4A]/20 flex items-center justify-center text-[#D54381] mb-4">
              <MonitorSmartphone size={24} />
            </div>
            <h3 className="text-xl font-bold mb-2">Native Desktop App</h3>
            <p className="text-white/60 text-sm leading-relaxed">A dedicated Windows executable that runs faster and integrates seamlessly with your barcode scanners and thermal printers.</p>
          </div>

          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-[#8B1A4A]/20 flex items-center justify-center text-[#D54381] mb-4">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-xl font-bold mb-2">Enterprise Security</h3>
            <p className="text-white/60 text-sm leading-relaxed">Local database encryption and secure background synchronization ensure your business data remains private and protected.</p>
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="border-t border-white/10 mt-auto py-8 text-center text-white/40 text-sm">
        <p>&copy; {new Date().getFullYear()} Kajri Sarees. All rights reserved.</p>
      </footer>
    </div>
  );
}
