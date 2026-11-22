/**
 * SMD - Suez Methanol Derivatives Co.
 * HR/Admin screen for approved shift times and overtime thresholds (Phase 4B).
 *
 * Reads/writes only through `GET/PATCH /api/settings/work`. The API performs
 * the permission check, Pydantic validation and audit logging; this screen
 * adds inline validation and optimistic-lock conflict handling.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, Save } from 'lucide-react';
import { UserSession, WorkSettings } from '../types';
import * as api from '../services/apiClient';
import { canEdit } from '../utils/roles';
import {
  WorkSettingsForm,
  WorkSettingsFormErrors,
  formFromWorkSettings,
  toWorkSettingsPatch,
  validateWorkSettingsForm,
} from '../utils/workSettings';

interface WorkSettingsManagerProps {
  user: UserSession;
}

interface FieldSpec {
  key: keyof WorkSettingsForm;
  label: string;
  inputType: 'time' | 'number' | 'text';
  hint?: string;
  min?: string;
  max?: string;
  step?: string;
}

const GROUPS: { title: string; icon: React.ElementType; fields: FieldSpec[] }[] = [
  {
    title: 'أساسيات العمل',
    icon: Clock,
    fields: [
      { key: 'timezone', label: 'المنطقة الزمنية', inputType: 'text', hint: 'مثال: Africa/Cairo' },
      {
        key: 'lateGraceMinutes',
        label: 'دقائق السماح للتأخير',
        inputType: 'number',
        min: '0',
        max: '120',
        step: '1',
      },
    ],
  },
  {
    title: 'مواعيد الورديات',
    icon: Clock,
    fields: [
      { key: 'normalStart', label: 'بداية الوردية العادية', inputType: 'time' },
      { key: 'normalEnd', label: 'نهاية الوردية العادية', inputType: 'time' },
      { key: 'dayStart', label: 'بداية الوردية النهارية', inputType: 'time' },
      { key: 'dayEnd', label: 'نهاية الوردية النهارية', inputType: 'time' },
      { key: 'nightStart', label: 'بداية الوردية الليلية', inputType: 'time' },
      { key: 'nightEnd', label: 'نهاية الوردية الليلية', inputType: 'time' },
    ],
  },
  {
    title: 'حدود ومعاملات الإضافي',
    icon: Clock,
    fields: [
      { key: 'overtimeDayStart', label: 'بداية احتساب الإضافي النهاري', inputType: 'time' },
      { key: 'overtimeCutoff', label: 'حد انتقال الإضافي الليلي', inputType: 'time' },
      {
        key: 'overtimeDayMultiplier',
        label: 'معامل الإضافي النهاري',
        inputType: 'number',
        min: '0.01',
        max: '5',
        step: '0.01',
      },
      {
        key: 'overtimeNightMultiplier',
        label: 'معامل الإضافي الليلي',
        inputType: 'number',
        min: '0.01',
        max: '5',
        step: '0.01',
      },
    ],
  },
];

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const WorkSettingsManager: React.FC<WorkSettingsManagerProps> = ({ user }) => {
  const allowed = canEdit(user.role);
  const [settings, setSettings] = useState<WorkSettings | null>(null);
  const [form, setForm] = useState<WorkSettingsForm | null>(null);
  const [errors, setErrors] = useState<WorkSettingsFormErrors>({});
  const [loading, setLoading] = useState(allowed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchWorkSettings();
      setSettings(data);
      setForm(formFromWorkSettings(data));
      setErrors({});
    } catch (loadError) {
      setSettings(null);
      setForm(null);
      setError(messageOf(loadError, 'تعذر تحميل إعدادات العمل من الخادم.'));
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeField = (key: keyof WorkSettingsForm, value: string) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setNotice(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || !settings || saving) return;
    const validation = validateWorkSettingsForm(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      setError('يرجى تصحيح الحقول المميزة قبل الحفظ.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.patchWorkSettings(
        toWorkSettingsPatch(form, settings.version),
      );
      setSettings(updated);
      setForm(formFromWorkSettings(updated));
      setNotice('تم حفظ إعدادات الورديات والإضافي بنجاح.');
    } catch (saveError) {
      if (
        saveError instanceof api.ApiError &&
        saveError.code === 'SETTINGS_VERSION_CONFLICT'
      ) {
        setError(
          'تم تعديل الإعدادات من جلسة أخرى. سيتم تحديث البيانات؛ راجع القيم ثم أعد الحفظ.',
        );
        await load();
      } else {
        setError(messageOf(saveError, 'تعذر حفظ إعدادات العمل.'));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <div className="bg-white rounded-xl border border-amber-200 p-6 text-sm text-amber-900">
        <div className="flex items-center gap-2 font-black">
          <AlertCircle className="w-4 h-4" />
          هذه الشاشة متاحة لمدير النظام وموارد بشرية فقط.
        </div>
        <p className="mt-2 text-xs text-amber-800">لا تملك صلاحية تعديل إعدادات العمل.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-900">إعدادات الورديات والإضافي</h1>
          <p className="text-xs text-slate-500 mt-1">
            القيم المعتمدة من الموارد البشرية؛ تُحفظ على الخادم مع سجل تدقيق ورقم إصدار.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-semibold flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-start gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center gap-3 text-slate-600">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-700" />
          <p className="text-xs font-bold">جارٍ تحميل إعدادات العمل...</p>
        </div>
      ) : !settings || !form ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <p className="text-sm font-bold text-slate-800">لا توجد إعدادات متاحة حاليًا.</p>
          <p className="text-xs text-slate-500 mt-1">حاول تحديث الصفحة أو راجع اتصال الخادم.</p>
        </div>
      ) : (
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-slate-600">
            <span>
              الإصدار الحالي: <strong className="font-mono text-slate-900">{settings.version}</strong>
            </span>
            <span>
              آخر تحديث: <strong className="text-slate-900">{settings.updatedAt}</strong>
            </span>
            {settings.updatedBy && (
              <span>
                بواسطة: <strong className="text-slate-900">{settings.updatedBy}</strong>
              </span>
            )}
          </div>

          {GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section
                key={group.title}
                className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5"
              >
                <h2 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-4">
                  <GroupIcon className="w-4 h-4 text-blue-700" />
                  {group.title}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.fields.map((field) => {
                    const inputId = `work-settings-${field.key}`;
                    const fieldError = errors[field.key];
                    return (
                      <div key={field.key}>
                        <label
                          htmlFor={inputId}
                          className="block text-xs font-bold text-slate-700 mb-1.5"
                        >
                          {field.label}
                        </label>
                        <input
                          id={inputId}
                          type={field.inputType}
                          value={form[field.key]}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          onChange={(event) => changeField(field.key, event.target.value)}
                          aria-invalid={Boolean(fieldError)}
                          aria-describedby={fieldError ? `${inputId}-error` : undefined}
                          className={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${
                            fieldError
                              ? 'border-rose-400 bg-rose-50'
                              : 'border-slate-300 focus:border-blue-600'
                          } outline-none`}
                        />
                        {fieldError ? (
                          <p id={`${inputId}-error`} className="text-[11px] text-rose-700 mt-1">
                            {fieldError}
                          </p>
                        ) : field.hint ? (
                          <p className="text-[11px] text-slate-500 mt-1">{field.hint}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <div className="flex items-center justify-end gap-3 pb-4">
            <button
              type="button"
              onClick={() => void load()}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              إلغاء التغييرات
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-white bg-blue-800 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              حفظ الإعدادات
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
