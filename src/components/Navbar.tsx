/**
 * SMD - Suez Methanol Derivatives Co.
 * Right-side navigation sidebar (RTL).
 *
 * Desktop (md+): a fixed 260px rail on the right; the main content is offset
 * by the same width in `App.tsx`.
 * Mobile: the sidebar becomes a drawer, opened by the hamburger in the slim
 * top bar and closed on navigation, backdrop click or Escape.
 *
 * The component keeps the `ActiveTab` contract so no screen logic changes.
 */

import React, { useEffect, useState } from 'react';
import { UserSession } from '../types';
import {
  LayoutDashboard,
  Users,
  Clock,
  Calculator,
  Calendar,
  Briefcase,
  Cpu,
  BarChart3,
  FileText,
  Database,
  Lock,
  LogOut,
  Menu,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'employees'
  | 'attendance'
  | 'overtime'
  | 'leaves'
  | 'permits'
  | 'zkteco'
  | 'reports'
  | 'forms'
  | 'architecture'
  | 'licensing';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  user: UserSession;
  onLogout: () => void;
  onLockNow: () => void;
  isTimeLocked: boolean;
  onOpenBackupModal: () => void;
  /** Local backup/restore and the demo time-lock are hidden when using the API. */
  showBackupButton?: boolean;
  showLicensingButton?: boolean;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'employees', label: 'العاملين', icon: Users },
  { id: 'attendance', label: 'الحضور والورديات', icon: Clock },
  { id: 'overtime', label: 'حاسبة الإضافي (6م)', icon: Calculator },
  { id: 'leaves', label: 'الإجازات والأرصدة', icon: Calendar },
  { id: 'permits', label: 'الأذونات والمأموريات', icon: Briefcase },
  { id: 'zkteco', label: 'أجهزة ZKTeco', icon: Cpu },
  { id: 'reports', label: 'التحليل القطاعي', icon: BarChart3 },
  { id: 'forms', label: 'النماذج والمستندات', icon: FileText },
  { id: 'architecture', label: 'المعمارية و SQL', icon: Database },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  user,
  onLogout,
  onLockNow,
  isTimeLocked,
  onOpenBackupModal,
  showBackupButton = true,
  showLicensingButton = true,
}) => {
  const [open, setOpen] = useState(false);

  // Close the mobile drawer with Escape and prevent the page behind it from
  // scrolling while it is open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selectTab = (tab: ActiveTab) => {
    onTabChange(tab);
    setOpen(false);
  };

  const roleLabel =
    user.role === 'ADMIN'
      ? 'مدير النظام'
      : user.role === 'HR'
        ? 'موارد بشرية (محرر)'
        : 'مستخدم قراءة فقط';

  const RoleIcon = user.role === 'VIEWER' ? ShieldAlert : ShieldCheck;

  const renderBrand = (compact = false) => (
    <div className="flex items-center gap-3 min-w-0">
      <div
        className={`${
          compact ? 'w-10 h-10' : 'w-14 h-14'
        } rounded-xl p-1 bg-white border-2 border-blue-500/30 shadow-sm flex items-center justify-center shrink-0`}
      >
        <img
          src="/logo.png"
          alt="شعار شركة السويس لمشتقات الميثانول - SMD"
          className="w-full h-full object-contain filter drop-shadow-xs"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="leading-tight min-w-0">
        <span
          className={`${
            compact ? 'text-sm' : 'text-base'
          } font-black text-slate-900 tracking-tight whitespace-nowrap block`}
        >
          SMD الموارد البشرية
        </span>
        <span className="text-[11px] text-blue-800 font-bold block truncate">
          شركة السويس لمشتقات الميثانول
        </span>
      </div>
    </div>
  );

  const renderNavigation = () => (
    <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1" aria-label="أقسام النظام">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => selectTab(item.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-right transition-colors cursor-pointer ${
              isActive
                ? 'bg-blue-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-blue-50 hover:text-blue-900'
            }`}
          >
            <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-cyan-300' : ''}`} />
            <span className="truncate">{item.label}</span>
            {isActive && <span className="ms-auto w-1.5 h-1.5 rounded-full bg-cyan-300 shrink-0" />}
          </button>
        );
      })}
    </nav>
  );

  const renderFooter = () => (
    <div className="border-t border-slate-200 p-3 space-y-2">
      {isTimeLocked && (
        <div
          role="status"
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold"
        >
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>النظام مقفل مؤقتًا</span>
        </div>
      )}

      {showBackupButton && (
        <button
          type="button"
          onClick={onOpenBackupModal}
          title="مركز استرداد وتصدير ملفات وبيانات المنظومة"
          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
        >
          <Database className="w-4 h-4 text-blue-700 shrink-0" />
          <span className="truncate">استرداد وتصدير الملفات</span>
        </button>
      )}

      {showLicensingButton && user.role === 'ADMIN' && (
        <button
          type="button"
          onClick={() => selectTab('licensing')}
          title="إدارة ترخيص وقفل النظام (Time-Lock)"
          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-colors cursor-pointer"
        >
          <Lock className="w-4 h-4 shrink-0" />
          <span className="truncate">إدارة الترخيص والقفل</span>
        </button>
      )}

      <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
        <div className="w-9 h-9 rounded-full bg-blue-900 text-white flex items-center justify-center shrink-0 font-black text-sm">
          {user.name?.trim().charAt(0) || 'S'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-slate-900 truncate" title={user.name}>
            {user.name}
          </p>
          <p className="text-[10px] font-bold text-blue-800 flex items-center gap-1 truncate">
            <RoleIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">{roleLabel}</span>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        <span>تسجيل الخروج</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile top bar with the drawer trigger */}
      <header className="md:hidden fixed inset-x-0 top-0 z-30 h-16 bg-white border-b border-slate-200 shadow-xs flex items-center justify-between gap-3 px-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="فتح القائمة"
          aria-expanded={open}
          aria-controls="smd-mobile-sidebar"
          className="p-2 text-slate-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        {renderBrand(true)}
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40" role="presentation">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            id="smd-mobile-sidebar"
            aria-label="القائمة الرئيسية"
            className="absolute inset-y-0 right-0 w-[260px] max-w-[85vw] bg-white border-l border-slate-200 shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
              {renderBrand()}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق القائمة"
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderNavigation()}
            {renderFooter()}
          </aside>
        </div>
      )}

      {/* Desktop rail (always visible on md+) */}
      <aside
        id="smd-sidebar"
        aria-label="القائمة الرئيسية"
        className="hidden md:flex fixed inset-y-0 right-0 z-30 w-[260px] bg-white border-l border-slate-200 shadow-sm flex-col"
      >
        <div className="p-4 border-b border-slate-200">{renderBrand()}</div>
        {renderNavigation()}
        {renderFooter()}
      </aside>
    </>
  );
};
