/**
 * SMD - Suez Methanol Derivatives Co.
 * Login Component
 * Displays ONLY:
 * - اسم المستخدم ( User )
 * - كلمة المرور ( Password )
 * with prominent SMD logo.
 *
 * Authentication now goes through the FastAPI backend
 * (`POST /api/auth/login` → JWT bearer token). The demo accounts below are
 * shown only while `VITE_ALLOW_OFFLINE_DEMO` is enabled; production builds set
 * it to `false` so credentials are never checked in the browser.
 */

import React, { useState } from 'react';
import { UserRole } from '../types';
import { AlertCircle, LogIn, Lock, User as UserIcon } from 'lucide-react';

interface LoginProps {
  /**
   * Resolves when the session is established (API or offline demo).
   * Rejects with a user-facing Arabic message on failure.
   */
  onLogin: (username: string, password: string) => Promise<void>;
  /** Show the hard-coded demo accounts (development / offline preview only). */
  showDemoAccounts?: boolean;
}

interface DemoAccount {
  username: string;
  password: string;
  role: UserRole;
  name: string;
  email: string;
  id: string;
}

/** DEMO_MODE accounts — documented in README and UAT checklist. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: 'admin',
    password: 'Admin@12345',
    role: 'ADMIN',
    name: 'أ. محمد عبد الرحمن',
    email: 'admin@smd.com.eg',
    id: 'USR-ADMIN',
  },
  {
    username: 'hr',
    password: 'Hr@12345',
    role: 'HR',
    name: 'أ. منى إبراهيم عطية',
    email: 'hr@smd.com.eg',
    id: 'USR-HR',
  },
  {
    username: 'viewer',
    password: 'Viewer@12345',
    role: 'VIEWER',
    name: 'أحمد السعيد (قراءة فقط)',
    email: 'viewer@smd.com.eg',
    id: 'USR-VIEWER',
  },
];

export const Login: React.FC<LoginProps> = ({ onLogin, showDemoAccounts = true }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@12345');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (!username.trim() || !password) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور.');
      return;
    }

    setBusy(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'اسم المستخدم أو كلمة المرور غير صحيحة.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 selection:bg-blue-600 selection:text-white" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header with Prominent, Large SMD Logo */}
        <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-8 text-center text-white relative">
          
          {/* Enhanced Large Logo Container */}
          <div className="w-36 h-36 sm:w-40 sm:h-40 mx-auto mb-4 bg-white p-3 rounded-3xl shadow-2xl flex items-center justify-center border-4 border-blue-500/40 ring-4 ring-blue-500/10 transition-transform hover:scale-105">
            <img 
              src="/logo.png" 
              alt="شعار شركة السويس لمشتقات الميثانول - SMD HR" 
              className="w-full h-full object-contain filter drop-shadow-sm"
              referrerPolicy="no-referrer"
            />
          </div>

          <h1 className="text-xl font-black tracking-tight text-white mb-1">
            شركة السويس لمشتقات الميثانول
          </h1>
          <p className="text-xs text-blue-300 font-bold tracking-wide">
            Suez Methanol Derivatives Co. (SMD)
          </p>
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1 bg-blue-500/15 text-blue-200 rounded-lg text-xs font-bold border border-blue-500/30">
            <span>الإدارة العامة للموارد البشرية</span>
          </div>
        </div>

        {/* Form Body - Contains ONLY Username and Password as requested */}
        <div className="p-6 sm:p-8">
          <div className="mb-6 text-center">
            <h2 className="text-base font-bold text-slate-800">
              تسجيل الدخول للنظام
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              منظومة الموارد البشرية وإدارة الحضور والانصراف
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Field 1: اسم المستخدم ( User ) */}
            <div>
              <label htmlFor="login-username" className="block text-xs font-bold text-slate-700 mb-1.5">
                اسم المستخدم ( User )
              </label>
              <div className="relative">
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 pl-10 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-left font-sans"
                  dir="ltr"
                  autoComplete="username"
                  placeholder="admin"
                  required
                  disabled={busy}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Field 2: كلمة المرور ( Password ) */}
            <div>
              <label htmlFor="login-password" className="block text-xs font-bold text-slate-700 mb-1.5">
                كلمة المرور ( Password )
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 pl-10 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-left font-mono"
                  dir="ltr"
                  autoComplete="current-password"
                  placeholder="Password"
                  required
                  disabled={busy}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
              </div>
            </div>

            <div role="alert" aria-live="polite">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 text-[11px] rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-semibold leading-relaxed">{error}</span>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 disabled:cursor-wait text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{busy ? 'جارٍ التحقق من البيانات...' : 'تسجيل الدخول'}</span>
              </button>
            </div>
          </form>

          {showDemoAccounts && (
            <details className="mt-5 rounded-xl border border-amber-300 bg-amber-50/70 p-3">
              <summary className="text-[11px] font-bold text-amber-900 cursor-pointer">
                بيانات الحسابات التجريبية (DEMO)
              </summary>
              <ul className="mt-2 space-y-1.5 text-[11px] text-amber-950 font-mono" dir="ltr">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.username} className="flex items-center justify-between gap-2">
                    <span>{account.username} / {account.password}</span>
                    <span className="text-amber-700 font-sans">{account.role}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-amber-800 leading-relaxed">
                هذه حسابات تجريبية للاختبار فقط وتعمل عبر خادم FastAPI. عند تعذّر الاتصال بالخادم
                يمكن فتح وضع العرض المحلي مؤقتًا في بيئة التطوير فقط.
              </p>
            </details>
          )}

          <div className="mt-6 text-center">
            <p className="text-[11px] text-slate-400 font-mono">
              SMD-HR · FastAPI + PostgreSQL · SMD-2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
