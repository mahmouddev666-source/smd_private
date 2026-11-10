/**
 * SMD - Suez Methanol Derivatives Co.
 * Security & Licensing Manager (Time-Lock Expiry & License Key Management)
 */

import React, { useState } from 'react';
import { LicenseConfig, UserSession, UserRole } from '../types';
import { 
  Lock, 
  Unlock, 
  KeyRound, 
  ShieldCheck, 
  AlertTriangle, 
  Calendar, 
  Building2, 
  RefreshCw,
  Users,
  CheckCircle2
} from 'lucide-react';

interface LicensingManagerProps {
  license: LicenseConfig;
  user: UserSession;
  onUpdateLicense: (newLic: LicenseConfig) => void;
  onSwitchRole: (newRole: UserRole) => void;
  onTriggerLock: () => void;
}

export const LicensingManager: React.FC<LicensingManagerProps> = ({
  license,
  user,
  onUpdateLicense,
  onSwitchRole,
  onTriggerLock
}) => {
  const [expiryDate, setExpiryDate] = useState(license.expiryDate);
  const [licenseKey, setLicenseKey] = useState(license.licenseKey);
  const [licenseType, setLicenseType] = useState(license.licenseType);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isExpired = new Date().toISOString().split('T')[0] > license.expiryDate;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateLicense({
      ...license,
      expiryDate,
      licenseKey,
      licenseType: licenseType as any,
      lastVerifiedAt: new Date().toISOString().split('T')[0]
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const generateNewKey = () => {
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    const year = new Date().getFullYear() + 1;
    const generated = `SMD-${year}-ENTERPRISE-PRO-${randomHex}-EGYPT`;
    setLicenseKey(generated);
  };

  const handleTestLockoutNow = () => {
    // Set expiry to yesterday to trigger lock
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    setExpiryDate(yesterday);
    onUpdateLicense({
      ...license,
      expiryDate: yesterday,
      isTimeLocked: true
    });
    onTriggerLock();
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-700" />
            <h2 className="text-lg font-bold text-slate-900">
              إدارة ترخيص وقفل النظام (Software Time-Lock & Security)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            آلية حماية البرنامج وتحديد تاريخ انتهاء الصلاحية المعتمد لشركة السويس لمشتقات الميثانول
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
            isExpired || license.isTimeLocked
              ? 'bg-red-50 text-red-700 border-red-300'
              : 'bg-emerald-50 text-emerald-700 border-emerald-300'
          }`}>
            <ShieldCheck className="w-4 h-4" />
            <span>{isExpired || license.isTimeLocked ? 'الترخيص مقفل / منتهي' : 'الترخيص ساري ومعتمد'}</span>
          </div>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>تم تحديث إعدادات الترخيص وحفظ تاريخ انتهاء الصلاحية بنجاح!</span>
        </div>
      )}

      {/* Main Settings Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Form Panel */}
        <div className="lg:col-span-8 bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            تحديث بيانات الترخيص وتاريخ الانتهاء (Time-Lock Expiry Date)
          </h3>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                اسم الجهة المرخص لها
              </label>
              <input
                type="text"
                disabled
                value={license.companyName}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  تاريخ انتهاء صلاحية البرنامج (Expiry Date) *
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  عند حلول هذا التاريخ، سيقفل النظام تلقائياً ويطالب بمفتاح التجديد.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  نوع الترخيص المعتمد
                </label>
                <select
                  value={licenseType}
                  onChange={(e) => setLicenseType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium"
                >
                  <option value="ترخيص سنوي للمؤسسة">ترخيص سنوي للمؤسسة (Annual Enterprise)</option>
                  <option value="ترخيص تجاري دائم">ترخيص تجاري دائم (Perpetual)</option>
                  <option value="ترخيص تجريبي مقيد">ترخيص تجريبي مقيد (Trial Evaluation)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  مفتاح التشفير والترخيص (License Key)
                </label>
                <button
                  type="button"
                  onClick={generateNewKey}
                  className="text-xs text-blue-700 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>توليد مفتاح جديد</span>
                </button>
              </div>
              <input
                type="text"
                required
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-left font-bold text-slate-800"
                dir="ltr"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                آخر فحص أمني للنظام: {license.lastVerifiedAt}
              </span>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer"
              >
                حفظ إعدادات الترخيص
              </button>
            </div>
          </form>
        </div>

        {/* Right Emergency Controls */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Emergency Lock Simulator */}
          <div className="bg-red-50/70 border border-red-200 p-5 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-red-900 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>اختبار آلية القفل (Time-Lock Simulator)</span>
            </div>
            <p className="text-xs text-red-800 leading-relaxed">
              يمكنك تجربة إيقاف وتشغيل قفل البرنامج فوراً لاختبار شاشة القفل وتجربة إدخال مفتاح التجديد:
            </p>
            <button
              onClick={handleTestLockoutNow}
              className="w-full py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>قفل النظام الآن (تجربة شاشة القفل)</span>
            </button>
          </div>

          {/* Role Switcher for Testing */}
          <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3 text-xs">
            <span className="font-bold text-slate-800 block">
              تبديل صلاحية المستخدم الحالي (Testing Roles):
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSwitchRole('ADMIN')}
                className={`py-2 px-3 rounded-lg font-bold border transition-colors cursor-pointer ${
                  user.role === 'ADMIN'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                مستخدم user (مستخدم)
              </button>
              <button
                onClick={() => onSwitchRole('VIEWER')}
                className={`py-2 px-3 rounded-lg font-bold border transition-colors cursor-pointer ${
                  user.role === 'VIEWER'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                مستخدم قراءة فقط
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              المستخدم القارئ (Viewer) يتمتع بإمكانية عرض التقارير والشاشات فقط دون تعديل أو إيقاف.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
};
