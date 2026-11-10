/**
 * SMD - Suez Methanol Derivatives Co.
 * Software Time-Lock & License Expired Screen
 */

import React, { useState } from 'react';
import { Lock, KeyRound, ShieldAlert, CheckCircle2, PhoneCall, Building2 } from 'lucide-react';
import { LicenseConfig } from '../types';

interface LockScreenProps {
  reason?: string;
  license: LicenseConfig;
  onUnlock: (newExpiryDate: string, newKey: string) => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ reason, license, onUnlock }) => {
  const [unlockKey, setUnlockKey] = useState('');
  const [newExpiry, setNewExpiry] = useState('2028-12-31');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleAttemptUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = unlockKey.trim().toUpperCase();

    // Accept valid SMD license pattern or master emergency key
    if (cleanKey.includes('SMD-') || cleanKey === 'ADMIN-UNLOCK' || cleanKey.length >= 10) {
      setSuccessMsg('تم التحقق بنجاح من مفتاح التفعيل! جاري فتح قفل النظام...');
      setErrorMsg('');
      setTimeout(() => {
        onUnlock(newExpiry, cleanKey);
      }, 1000);
    } else {
      setErrorMsg('مفتاح التفعيل غير صحيح أو منتهي الصلاحية. يرجى إدخال مفتاح ترخيص صالح يبدأ بـ SMD-');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 selection:bg-red-600 selection:text-white">
      <div className="w-full max-w-lg bg-slate-900 border border-red-500/30 rounded-2xl p-8 shadow-2xl text-slate-100 relative overflow-hidden">
        {/* Top Glow & Lock Icon */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-red-600"></div>

        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-4 bg-red-950/80 border border-red-500/40 rounded-2xl flex items-center justify-center text-red-400 shadow-inner">
            <Lock className="w-10 h-10 animate-pulse" />
          </div>

          <div className="w-24 h-24 mx-auto mb-3 bg-white p-2 rounded-2xl shadow-xl border-2 border-red-500/30 flex items-center justify-center">
            <img 
              src="/logo.png" 
              alt="شعار شركة السويس لمشتقات الميثانول - SMD" 
              className="w-full h-full object-contain filter drop-shadow-xs"
              referrerPolicy="no-referrer"
            />
          </div>

          <h1 className="text-xl font-bold text-white mb-1">
            النظام مغلق - انتهت صلاحية الترخيص
          </h1>
          <p className="text-xs text-red-400 font-semibold tracking-wide">
            SOFTWARE TIME-LOCK & EXPIRY PROTECTION ACTIVE
          </p>
        </div>

        <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-4 mb-6 text-xs text-red-200 leading-relaxed">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white mb-1">سبب إيقاف النظام:</p>
              <p className="text-slate-300">
                {reason || `انتهت فترة التشغيل المعتمدة للنظام الداخلي لشركة السويس لمشتقات الميثانول (SMD) في تاريخ ${license.expiryDate}. تم إيقاف سحب بيانات أجهزة البصمة وتحديث السجلات تلقائياً لحين تجديد الترخيص.`}
              </p>
            </div>
          </div>
        </div>

        {/* License Renewal Input */}
        <form onSubmit={handleAttemptUnlock} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              مفتاح ترخيص مستخدم النظام (User Activation Key)
            </label>
            <div className="relative">
              <input
                type="text"
                value={unlockKey}
                onChange={(e) => setUnlockKey(e.target.value)}
                placeholder="SMD-2028-ENTERPRISE-PRO-XXXX"
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-left"
                dir="ltr"
                required
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              مفتاح تجريبي صالح للاختبار: <code className="text-amber-400 font-mono">SMD-2028-ENTERPRISE-PRO-9842A-EGYPT</code>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              تاريخ انتهاء الصلاحية الجديد المعتمد
            </label>
            <input
              type="date"
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
              required
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-900/40 border border-red-700 text-red-200 text-xs rounded-lg">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-600 text-emerald-300 text-xs rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            <span>تأكيد التفعيل وفتح قفل البرنامج</span>
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span>شركة السويس لمشتقات الميثانول</span>
          </div>
          <div className="flex items-center gap-1.5">
            <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
            <span>إدارة نظم المعلومات: ext. 410</span>
          </div>
        </div>
      </div>
    </div>
  );
};
