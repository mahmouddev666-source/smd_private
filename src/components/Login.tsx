/**
 * SMD - Suez Methanol Derivatives Co.
 * Login Component
 * Displays ONLY:
 * - اسم المستخدم ( User )
 * - كلمة المرور ( Password )
 * with prominent SMD logo.
 */

import React, { useState } from 'react';
import { UserSession } from '../types';
import { LogIn, Lock, User as UserIcon } from 'lucide-react';

interface LoginProps {
  onLogin: (session: UserSession) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('User');
  const [password, setPassword] = useState('••••••••');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin({
      id: 'USR-001',
      name: username.trim() || 'User',
      email: `${(username.trim() || 'user').toLowerCase().replace(/\s+/g, '.')}@smd.com.eg`,
      role: 'ADMIN'
    });
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
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                اسم المستخدم ( User )
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 pl-10 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-left font-sans"
                  dir="ltr"
                  placeholder="User"
                  required
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Field 2: كلمة المرور ( Password ) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                كلمة المرور ( Password )
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 pl-10 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-left font-mono"
                  dir="ltr"
                  placeholder="Password"
                  required
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>تسجيل الدخول</span>
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[11px] text-slate-400 font-mono">
              خادم محلي مؤمن · ترخيص شركة SMD-2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
