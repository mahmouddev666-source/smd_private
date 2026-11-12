/**
 * SMD - Suez Methanol Derivatives Co.
 * Fill mode: choose an employee (and optionally a leave / mission / permit),
 * auto-fill the template fields from the real records, edit any value, then
 * print the original document on A4 or save a submission.
 *
 * The document is only ever the original file; values are text drawn on top of
 * the field layer designed in `FormDesigner`.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Printer,
  RotateCcw,
  Save,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  Employee,
  FormFile,
  FormSubmission,
  FormTemplate,
  LeaveRecord,
  MissionRecord,
  PermitRecord,
} from '../../types';
import { FormStore } from '../../services/formStore';
import { resolveTemplateValues } from '../../utils/formBindings';
import { FormDocumentViewer } from './FormDocumentViewer';

const A4_WIDTH_PX = 794;

const PRINT_STYLES = `
@page { size: A4; margin: 0; }
.form-print-sheet { display: none; }
@media print {
  body.smd-printing #root { display: none !important; }
  body.smd-printing { background: #ffffff !important; }
  body.smd-printing .form-print-sheet { display: block !important; }
  .form-print-page {
    width: ${A4_WIDTH_PX}px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
  }
  .form-print-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .form-print-page .shadow-xl { box-shadow: none !important; }
  .form-print-page .border { border: none !important; }
}
`;

type ContextKind = 'none' | 'leave' | 'permit' | 'mission';

interface FormFillerProps {
  template: FormTemplate;
  file: FormFile;
  store: FormStore;
  employees: Employee[];
  leaves?: LeaveRecord[];
  permits?: PermitRecord[];
  missions?: MissionRecord[];
  /** False for VIEWER: the form can be printed but not stored. */
  canSave: boolean;
  onClose: () => void;
  onSaved?: (submission: FormSubmission) => void;
}

const CONTEXT_LABELS: Record<Exclude<ContextKind, 'none'>, string> = {
  leave: 'إجازة',
  permit: 'إذن',
  mission: 'مأمورية',
};

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const FormFiller: React.FC<FormFillerProps> = ({
  template,
  file,
  store,
  employees,
  leaves = [],
  permits = [],
  missions = [],
  canSave,
  onClose,
  onSaved,
}) => {
  const [employeeId, setEmployeeId] = useState(employees[0]?.employeeId || '');
  const [contextKind, setContextKind] = useState<ContextKind>('none');
  const [contextId, setContextId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(Math.max(1, file.pageCount || 1));
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [savedSubmission, setSavedSubmission] = useState<FormSubmission | null>(null);
  const [printing, setPrinting] = useState(false);

  const employee = useMemo(
    () => employees.find((row) => row.employeeId === employeeId) || null,
    [employees, employeeId],
  );

  const employeeLeaves = useMemo(
    () => leaves.filter((row) => row.employeeId === employeeId),
    [leaves, employeeId],
  );
  const employeePermits = useMemo(
    () => permits.filter((row) => row.employeeId === employeeId),
    [permits, employeeId],
  );
  const employeeMissions = useMemo(
    () => missions.filter((row) => row.employeeId === employeeId),
    [missions, employeeId],
  );

  // A different employee invalidates the selected leave / permit / mission.
  useEffect(() => {
    setContextId('');
  }, [employeeId]);

  const context = useMemo(
    () => ({
      employee,
      leave: contextKind === 'leave' ? employeeLeaves.find((row) => row.id === contextId) || null : null,
      permit:
        contextKind === 'permit' ? employeePermits.find((row) => row.id === contextId) || null : null,
      mission:
        contextKind === 'mission'
          ? employeeMissions.find((row) => row.id === contextId) || null
          : null,
    }),
    [employee, contextKind, contextId, employeeLeaves, employeePermits, employeeMissions],
  );

  const autoValues = useMemo(
    () => resolveTemplateValues(template.fields, context),
    [template.fields, context],
  );

  // Re-fill whenever the employee or the selected record changes. Manual edits
  // made afterwards are kept until the context changes again.
  useEffect(() => {
    setValues(autoValues);
  }, [autoValues]);

  const setValue = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSavedSubmission(null);
    setSavingError(null);
  };

  const resetValues = () => {
    setValues(autoValues);
    setSavedSubmission(null);
    setSavingError(null);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSavingError(null);
    try {
      const submission = await store.createSubmission({
        templateId: template.id,
        employeeId: employeeId || null,
        values,
        status: 'نهائي',
      });
      setSavedSubmission(submission);
      onSaved?.(submission);
    } catch (error) {
      setSavingError(messageOf(error, 'تعذر حفظ النموذج المعبأ.'));
    } finally {
      setSaving(false);
    }
  };

  const changeZoom = (delta: number) =>
    setZoom((current) => Math.min(2, Math.max(0.5, Number((current + delta).toFixed(2)))));

  const contextList: { id: string; label: string }[] =
    contextKind === 'leave'
      ? employeeLeaves.map((row) => ({
          id: row.id,
          label: `${row.leaveType} · ${row.startDate} ← ${row.endDate} (${row.daysCount} يوم)`,
        }))
      : contextKind === 'permit'
        ? employeePermits.map((row) => ({
            id: row.id,
            label: `${row.permitType} · ${row.date} · ${row.startTime}–${row.endTime}`,
          }))
        : contextKind === 'mission'
          ? employeeMissions.map((row) => ({
              id: row.id,
              label: `${row.missionType} · ${row.destination} · ${row.startDate}`,
            }))
          : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-stretch justify-center p-0 sm:p-4 no-print">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-filler-title"
        className="bg-slate-100 w-full max-w-[1500px] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-full"
      >
        {/* Header */}
        <div className="bg-white px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 id="form-filler-title" className="text-sm font-black text-slate-900 truncate">
              تعبئة وطباعة «{template.name}»
            </h3>
            <p className="text-[11px] text-slate-500 truncate">
              {template.category} · {file.originalName} · المستند الأصلي هو الخلفية
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded disabled:opacity-40 hover:bg-white"
                aria-label="الصفحة السابقة"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-bold font-mono px-1">
                {page} / {pageCount}
              </span>
              <button
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={page >= pageCount}
                className="p-1.5 rounded disabled:opacity-40 hover:bg-white"
                aria-label="الصفحة التالية"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => changeZoom(-0.1)}
                disabled={zoom <= 0.5}
                className="p-1.5 rounded disabled:opacity-40 hover:bg-white"
                aria-label="تصغير"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-bold font-mono w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => changeZoom(0.1)}
                disabled={zoom >= 2}
                className="p-1.5 rounded disabled:opacity-40 hover:bg-white"
                aria-label="تكبير"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setPrinting(true)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة A4</span>
            </button>

            {canSave && (
              <button
                onClick={() => void save()}
                disabled={saving}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:bg-slate-400"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{saving ? 'جارٍ الحفظ...' : 'حفظ النموذج'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="إغلاق التعبئة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(savingError || savedSubmission) && (
          <div
            className={`mx-4 mt-3 p-3 rounded-xl text-xs font-bold flex items-center justify-between gap-3 shrink-0 border ${
              savingError
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
            role={savingError ? 'alert' : 'status'}
          >
            <span className="flex items-center gap-2">
              {savingError ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              {savingError || `تم حفظ النموذج المعبأ (رقم ${savedSubmission?.id.slice(0, 8)}).`}
            </span>
            <button
              onClick={() => {
                setSavingError(null);
                setSavedSubmission(null);
              }}
              aria-label="إغلاق"
            >
              ✕
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="flex-1 min-h-[45vh] overflow-auto p-3 sm:p-5 bg-slate-200/70">
            <div className="w-fit mx-auto">
              <FormDocumentViewer
                file={file}
                page={page}
                zoom={zoom}
                fields={template.fields}
                values={values}
                interactive
                loadBlob={store.downloadFile}
                onValuesChange={setValue}
                onPageCount={(count) => {
                  const safe = Math.max(1, count);
                  setPageCount(safe);
                  setPage((current) => Math.min(current, safe));
                }}
              />
            </div>
          </div>

          <aside className="w-full lg:w-[380px] shrink-0 bg-white border-t lg:border-t-0 lg:border-s border-slate-200 overflow-auto max-h-[50vh] lg:max-h-none">
            <div className="p-4 space-y-3 border-b border-slate-200">
              <div>
                <label htmlFor="filler-employee" className="block text-[11px] font-semibold text-slate-700 mb-1">
                  الموظف *
                </label>
                <select
                  id="filler-employee"
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="">— بدون موظف (تعبئة يدوية) —</option>
                  {employees.map((row) => (
                    <option key={row.employeeId} value={row.employeeId}>
                      {row.name} ({row.employeeId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="filler-context-kind"
                    className="block text-[11px] font-semibold text-slate-700 mb-1"
                  >
                    تعبئة من سجل
                  </label>
                  <select
                    id="filler-context-kind"
                    value={contextKind}
                    onChange={(event) => {
                      setContextKind(event.target.value as ContextKind);
                      setContextId('');
                    }}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="none">بدون سجل</option>
                    <option value="leave">إجازة</option>
                    <option value="permit">إذن</option>
                    <option value="mission">مأمورية</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="filler-context-id"
                    className="block text-[11px] font-semibold text-slate-700 mb-1"
                  >
                    السجل
                  </label>
                  <select
                    id="filler-context-id"
                    value={contextId}
                    onChange={(event) => setContextId(event.target.value)}
                    disabled={contextKind === 'none' || contextList.length === 0}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs disabled:opacity-60"
                  >
                    <option value="">
                      {contextKind === 'none'
                        ? '—'
                        : contextList.length === 0
                          ? `لا توجد سجلات ${CONTEXT_LABELS[contextKind]}`
                          : 'اختر السجل'}
                    </option>
                    {contextList.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {employees.length === 0 && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                  لا توجد بيانات موظفين محمّلة. يمكنك كتابة القيم يدويًا في الحقول أدناه.
                </p>
              )}

              {employee && (
                <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2 leading-relaxed flex items-start gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-700" />
                  <span>
                    {employee.name} · {employee.department} · {employee.currentTitle}
                  </span>
                </p>
              )}
            </div>

            <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2">
              <h4 className="text-xs font-black text-slate-900">
                قيم الحقول ({template.fields.length})
              </h4>
              <button
                onClick={resetValues}
                className="text-[11px] font-bold text-blue-800 hover:text-blue-900 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                إعادة التعبئة التلقائية
              </button>
            </div>

            {template.fields.length === 0 ? (
              <div className="p-4 text-[11px] text-slate-500 leading-relaxed">
                لا توجد حقول في هذا القالب بعد. أغلق هذه الشاشة واستخدم أيقونة تصميم الحقول
                لإضافتها فوق المستند الأصلي.
              </div>
            ) : (
              <div className="p-4 space-y-2.5">
                {template.fields.map((field) => (
                  <div key={field.key}>
                    <label
                      htmlFor={`filler-field-${field.key}`}
                      className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      <span className="truncate">{field.label || field.key}</span>
                      <span className="shrink-0 text-[10px] text-slate-400 font-mono">ص{field.page}</span>
                    </label>
                    <input
                      id={`filler-field-${field.key}`}
                      value={values[field.key] ?? ''}
                      onFocus={() => setPage(field.page)}
                      onChange={(event) => setValue(field.key, event.target.value)}
                      placeholder={field.label || field.key}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed">
              تغيير الموظف أو السجل يعيد التعبئة التلقائية. أي تعديل يدوي بعد ذلك يُحفظ مع النموذج
              ويُطبع كما هو.
              {!canSave && ' دورك الحالي للقراءة فقط: يمكنك الطباعة لكن ليس حفظ النموذج.'}
            </div>
          </aside>
        </div>
      </div>

      {printing && (
        <FormPrintSheet
          file={file}
          template={template}
          values={values}
          pageCount={pageCount}
          loadBlob={store.downloadFile}
          onDone={() => setPrinting(false)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Print sheet
// ---------------------------------------------------------------------------

/**
 * Renders every page of the document at exactly A4 width in a portal outside
 * `#root`, waits until all pages are painted, then calls `window.print()`.
 * The injected `@page` rule is scoped to this component's lifetime, so printing
 * other screens keeps the normal 15mm margins from `index.css`.
 */
function FormPrintSheet({
  file,
  template,
  values,
  pageCount,
  loadBlob,
  onDone,
}: {
  file: FormFile;
  template: FormTemplate;
  values: Record<string, string>;
  pageCount: number;
  loadBlob: (fileId: string) => Promise<Blob>;
  onDone: () => void;
}) {
  const [renderedPages, setRenderedPages] = useState<number[]>([]);
  const printedRef = useRef(false);

  useEffect(() => {
    document.body.classList.add('smd-printing');
    const style = document.createElement('style');
    style.setAttribute('data-smd-print', 'true');
    style.textContent = PRINT_STYLES;
    document.head.appendChild(style);
    return () => {
      document.body.classList.remove('smd-printing');
      style.remove();
    };
  }, []);

  useEffect(() => {
    const handleAfterPrint = () => onDone();
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [onDone]);

  useEffect(() => {
    if (printedRef.current) return;
    if (renderedPages.length < pageCount) return;
    printedRef.current = true;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [renderedPages, pageCount]);

  // Safety net: never leave the user stuck if one page fails to paint.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (printedRef.current) return;
      printedRef.current = true;
      window.print();
    }, 8000);
    return () => window.clearTimeout(timer);
  }, []);

  const markRendered = (pageNumber: number) => {
    setRenderedPages((current) =>
      current.includes(pageNumber) ? current : [...current, pageNumber],
    );
  };

  return createPortal(
    <div className="form-print-sheet" aria-hidden="true">
      {Array.from({ length: Math.max(1, pageCount) }, (_, index) => {
        const pageNumber = index + 1;
        return (
          <div className="form-print-page" key={pageNumber}>
            <FormDocumentViewer
              file={file}
              page={pageNumber}
              fields={template.fields}
              values={values}
              loadBlob={loadBlob}
              fixedWidth={A4_WIDTH_PX}
              onRendered={() => markRendered(pageNumber)}
            />
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
