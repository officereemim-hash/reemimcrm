import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, Calendar, MessageSquare,
  Video, Settings, Menu, X, Bell, Mail
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'דשבורד', icon: LayoutDashboard },
  { path: '/contacts', label: 'לקוחות', icon: Users },
  { path: '/service-requests', label: 'פניות שירות', icon: FileText },
  { path: '/meetings', label: 'פגישות ומשימות', icon: Calendar },
  { path: '/marketing', label: 'מרכז דיוור', icon: Mail },
  { path: '/communications', label: 'לוג תקשורת', icon: MessageSquare },
  { path: '/webinars', label: 'וובינרים', icon: Video },
  { path: '/excel-imports', label: 'ייבוא אקסלים', icon: FileText },
  { path: '/settings', label: 'הגדרות', icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* Top Nav */}
      <header className="bg-white border-b border-border h-16 flex items-center px-4 md:px-8 gap-4 sticky top-0 z-50 shadow-sm">
        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">ב</span>
          </div>
          <span className="font-bold text-primary text-lg hidden md:block">קרנות ראמים</span>
        </div>

        <nav className="hidden md:flex items-center gap-1 flex-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'text-primary border-b-2 border-primary bg-secondary/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mr-auto flex items-center gap-2">
          <button className="relative p-2 hover:bg-muted rounded-lg">
            <Bell size={18} className="text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)}>
          <div className="bg-white w-64 h-full shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <nav className="flex flex-col gap-1 mt-4">
              {navItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                      active ? 'bg-primary text-white' : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 p-4 md:p-8 max-w-[1400px] mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}