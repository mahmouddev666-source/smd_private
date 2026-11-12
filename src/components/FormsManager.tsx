/**
 * SMD - Suez Methanol Derivatives Co.
 * Company document library: upload the original forms, keep them on the
 * server, preview them read-only and group them into templates.
 *
 * Nothing here re-draws a document: previews always show the original file
 * (Word/Excel are converted to PDF on the server by LibreOffice).
 *
 * Storage goes through `FormStore`:
 *   - `apiFormStore` when the FastAPI server is reachable (real use);
 *   - `getDemoFormStore()` in trial builds, which keeps everything in this
 *     browser's IndexedDB. That mode is clearly labelled as temporary and is
 *     disabled in the production image (`VITE_ALLOW_OFFLINE_DEMO=false`).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  Eye,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
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
  UserSession,
} from '../types';
import { apiFormStore, FormStore, getDemoFormStore } from '../services/formStore';
import { canEdit } from '../utils/roles';
import { FormDocumentViewer } from './forms/FormDocumentViewer';
import { FormDesigner } from './forms/FormDesigner';
import { FormFiller } from './forms/FormFiller';

const MAX_UPLOAD_MB = 20;

const DEFAULT_CATEGORIES = [
  'الإجازات',
  'المأموريات',
  'الأذونات',
  'الموارد البشرية',
  'الشؤون المالية',
  'السلامة والجودة',
  'عام',
];

interface FormsManagerProps {
  user: UserSession;
  /** True when the FastAPI server is the active data source. */
  apiEnabled: boolean;
  /**
   * Trial builds only (`VITE_ALLOW_OFFLINE_DEMO`): allow the browser-only
   * IndexedDB store when the API is not running. Never enabled in production.
   */
  demoEnabled?: boolean;
  employees?: Employee[];
  leaves?: LeaveRecord[];
  permits?: PermitRecord[];
  missions?: MissionRecord[];
}

interface UploadState {
  name: string;
  percent: number;
}

interface PreviewState {
  file: FormFile;
  template?: FormTemplate;
}

type TemplateModalState =
  | { mode: 'create' }
  | { mode: 'edit'; template: FormTemplate };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function formatDate(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Africa/Cairo',
  }).format(parsed);
}

function kindLabel(file: FormFile): string {
  switch (file.kind) {
    case 'pdf':
      return 'PDF';
    case 'image':
      return 'صورة';
    case 'word':
      return 'Word';
    case 'excel':
      return 'Excel';
    default:
      return file.mime;
  }
}

function KindIcon({ kind }: { kind: FormFile['kind'] }) {
  if (kind === 'image') return <FileImage className="w-4 h-4 text-emerald-700" />;
  if (kind === 'excel') return <FileSpreadsheet className="w-4 h-4 text-emerald-700" />;
  if (kind === 'word') return <FileText className="w-4 h-4 text-blue-700" />;
  return <FileText className="w-4 h-4 text-rose-700" />;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const FormsManager: React.FC<FormsManagerProps> = ({
  user,
  apiEnabled,
  demoEnabled = false,
  employees = [],
  leaves = [],
  permits = [],
  missions = [],
}) => {
  const editor = canEdit(user.role);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Real server when available; otherwise the temporary browser store, but only
  // when the build allows it. `null` means the engine is unavailable here.
  const store = useMemo<FormStore | null>(() => {
    if (apiEnabled) return apiFormStore;
    if (demoEnabled) return getDemoFormStore();
    return null;
  }, [apiEnabled, demoEnabled]);
  const demoMode = store?.mode === 'demo';

  const [files, setFiles] = useState<FormFile[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(Boolean(store));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [query, setQuery] = useState('');

  const [pendingDeleteFile, setPendingDeleteFile] = useState<FormFile | null>(null);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<FormTemplate | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [designer, setDesigner] = useState<FormTemplate | null>(null);
  const [filler, setFiller] = useState<FormTemplate | null>(null);
  const [templateModal, setTemplateModal] = useState<TemplateModalState | null>(null);

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!store) {
      setLoading(false);
      return;
    }
    setRefreshing(true);
    try {
      const [fileRows, templateRows] = await Promise.all([
        store.listFiles(),
        store.listTemplates(),
      ]);
      setFiles(fileRows);
      setTemplates(templateRows);
      setError(null);
    } catch (loadError) {
      setError(
        messageOf(
          loadError,
          store.mode === 'demo'
            ? 'تعذر تحميل المكتبة من التخزين المحلي للتجربة.'
            : 'تعذر تحميل مكتبة المستندات من الخادم.',
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [store]);

  useEffect(() => {
    void load();
  }, [load]);

  // Close any open overlay with Escape.
  useEffect(() => {
    if (
      !preview &&
      !designer &&
      !filler &&
      !templateModal &&
      !pendingDeleteFile &&
      !pendingDeleteTemplate
    ) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPreview(null);
      setDesigner(null);
      setFiller(null);
      setTemplateModal(null);
      setPendingDeleteFile(null);
      setPendingDeleteTemplate(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview, designer, filler, templateModal, pendingDeleteFile, pendingDeleteTemplate]);

  const fileById = useMemo(
    () => new Map(files.map((file) => [file.id, file])),
    [files],
  );

  const categories = useMemo(() => {
    const found = new Set<string>(DEFAULT_CATEGORIES);
    templates.forEach((template) => found.add(template.category));
    return Array.from(found);
  }, [templates]);

  const normalizedQuery = query.trim();
  const visibleFiles = normalizedQuery
    ? files.filter((file) => file.originalName.includes(normalizedQuery))
    : files;
  const visibleTemplates = normalizedQuery
    ? templates.filter(
        (template) =>
          template.name.includes(normalizedQuery) ||
          template.category.includes(normalizedQuery) ||
          template.description.includes(normalizedQuery),
      )
    : templates;

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------
  const handleFiles = useCallback(
    async (incoming: FileList | File[]) => {
      if (!editor || !store) return;
      const chosen = Array.from(incoming);
      if (chosen.length === 0) return;

      setError(null);
      for (const file of chosen) {
        const limit = MAX_UPLOAD_MB * 1024 * 1024;
        if (file.size > limit) {
          setError(`حجم الملف «${file.name}» يتجاوز الحد المسموح (${MAX_UPLOAD_MB} ميجابايت).`);
          continue;
        }
        setUpload({ name: file.name, percent: 0 });
        try {
          const uploaded = await store.uploadFile(file, (percent) =>
            setUpload({ name: file.name, percent }),
          );
          setFiles((current) => [uploaded, ...current]);
          setNotice(
            `تم رفع «${uploaded.originalName}» بنجاح (${uploaded.pageCount} صفحة، ${kindLabel(uploaded)}).`,
          );
        } catch (uploadError) {
          setError(messageOf(uploadError, `تعذر رفع الملف «${file.name}».`));
        } finally {
          setUpload(null);
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [editor, store],
  );

  const handleDeleteFile = async (file: FormFile) => {
    if (!store) return;
    setPendingDeleteFile(null);
    setError(null);
    try {
      await store.deleteFile(file.id);
      setFiles((current) => current.filter((row) => row.id !== file.id));
      setNotice(`تم حذف الملف «${file.originalName}».`);
    } catch (deleteError) {
      setError(messageOf(deleteError, 'تعذر حذف الملف.'));
    }
  };

  const handleDeleteTemplate = async (template: FormTemplate) => {
    if (!store) return;
    setPendingDeleteTemplate(null);
    setError(null);
    try {
      await store.deleteTemplate(template.id);
      setTemplates((current) => current.filter((row) => row.id !== template.id));
      setNotice(`تم حذف القالب «${template.name}».`);
    } catch (deleteError) {
      setError(messageOf(deleteError, 'تعذر حذف القالب.'));
    }
  };

  const handleResetDemo = async () => {
    if (!store?.reset) return;
    setError(null);
    try {
      await store.reset();
      setFiles([]);
      setTemplates([]);
      setPreview(null);
      setDesigner(null);
      setFiller(null);
      setNotice('تم مسح كل بيانات التجربة من هذا المتصفح.');
    } catch (resetError) {
      setError(messageOf(resetError, 'تعذر مسح بيانات التجربة.'));
    }
  };

  const handleDownloadFile = async (file: FormFile) => {
    if (!store) return;
    try {
      const blob = await store.downloadFile(file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (downloadError) {
      setError(messageOf(downloadError, 'تعذر تنزيل الملف.'));
    }
  };

  const openPreviewForFile = (file: FormFile) => setPreview({ file });

  const openPreviewForTemplate = (template: FormTemplate) => {
    const file = fileById.get(template.fileId);
    if (!file) {
      setError('ملف هذا القالب غير موجود في المكتبة. أعد رفع المستند.');
      return;
    }
    setPreview({ file, template });
  };

  const openDesigner = (template: FormTemplate) => {
    if (!fileById.get(template.fileId)) {
      setError('ملف هذا القالب غير موجود في المكتبة. أعد رفع المستند قبل تصميم الحقول.');
      return;
    }
    setDesigner(template);
  };

  const openFiller = (template: FormTemplate) => {
    if (!fileById.get(template.fileId)) {
      setError('ملف هذا القالب غير موجود في المكتبة. أعد رفع المستند قبل تعبئته.');
      return;
    }
    setFiller(template);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  // No server and no trial store: the production build never falls back.
  if (!store) {
    return (
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h2 className="text-lg font-black text-slate-900">مكتبة مستندات الشركة</h2>
          <p className="text-xs text-slate-500 mt-1">
            رفع نماذج الشركة الأصلية (PDF / Word / Excel / صور) وعرضها كما هي قبل التعبئة والطباعة.
          </p>
        </div>
        <div
          role="status"
          className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            محرك المستندات يعمل على الخادم. شغّل الـ API ثم سجّل الدخول من جديد لرفع مستندات الشركة
            وعرضها وتعبئتها. وضع التجربة المحلي معطّل في نسخة الإنتاج.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept={demoMode ? '.pdf,.png,.jpg,.jpeg,.webp' : '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg'}
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
        }}
      />

      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-md">
              Document Engine
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs font-semibold text-slate-600">
              المستند الأصلي هو الخلفية — لا يُعاد رسمه
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-900">مكتبة مستندات الشركة ونماذجها</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ارفع النموذج كما هو، ثم عاينه واربطه بقالب لتعبئة بيانات الموظف والإجازة والمأمورية
            وطباعته على A4.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={refreshing}
            className="px-3 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            title={demoMode ? 'تحديث المكتبة من التخزين المحلي' : 'تحديث المكتبة من الخادم'}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          {editor && (
            <>
              <button
                onClick={() => setTemplateModal({ mode: 'create' })}
                disabled={files.length === 0}
                className="px-3.5 py-2.5 bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={files.length === 0 ? 'ارفع مستندًا أولًا' : 'إنشاء قالب من مستند مرفوع'}
              >
                <Plus className="w-4 h-4" />
                <span>قالب جديد</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(upload)}
                className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:bg-slate-400"
              >
                {upload ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                <span>{upload ? 'جارٍ الرفع...' : 'رفع مستند'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Temporary trial store: always visible, never disguised as real data */}
      {demoMode && (
        <div
          role="status"
          className="p-4 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-950 text-xs leading-relaxed flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <div>
              <p className="font-black">وضع تجربة مؤقت — بيانات محلية على هذا المتصفح فقط</p>
              <p className="mt-1 font-semibold">
                لا يوجد اتصال بالخادم الآن؛ المستندات والقوالب والنماذج المعبأة تُخزَّن في IndexedDB
                داخل هذا المتصفح ولا تُرسل لأي جهة. الملفات المدعومة هنا: PDF والصور فقط (تحويل
                Word/Excel يحتاج الخادم). هذه البيانات ليست بيانات الشركة الرسمية.
              </p>
            </div>
          </div>
          {editor && store.reset && (
            <button
              onClick={() => void handleResetDemo()}
              className="shrink-0 px-3 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-400 rounded-lg font-bold"
            >
              مسح بيانات التجربة
            </button>
          )}
        </div>
      )}

      {/* Notices */}
      {upload && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold text-blue-900 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">جارٍ رفع «{upload.name}» ...</span>
            <span className="font-mono shrink-0">{upload.percent}%</span>
          </div>
          <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${Math.max(4, upload.percent)}%` }}
            />
          </div>
        </div>
      )}

      {notice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-emerald-700 hover:text-emerald-900 font-bold" aria-label="إغلاق">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 font-bold" aria-label="إغلاق">
            ✕
          </button>
        </div>
      )}

      {/* Search */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث باسم المستند أو القالب أو التصنيف..."
          aria-label="بحث في مكتبة المستندات"
          className="w-full bg-transparent text-xs outline-none py-1.5"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-700 font-bold" aria-label="مسح البحث">
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-xs font-bold">
          <Loader2 className="w-5 h-5 animate-spin text-blue-700" />
          <span>جارٍ تحميل مكتبة المستندات...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* ------------------------------------------------------------- */}
          {/* Uploaded files                                                */}
          {/* ------------------------------------------------------------- */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-900">المستندات المرفوعة</h3>
              <span className="text-[11px] font-bold text-slate-500">{files.length} مستند</span>
            </div>

            {editor && (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  if (event.dataTransfer.files) void handleFiles(event.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`m-3 p-6 rounded-xl border-2 border-dashed text-center cursor-pointer transition-colors ${
                  dragActive
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/40'
                }`}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
                }}
              >
                <UploadCloud className="w-7 h-7 text-blue-700 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  اسحب مستند الشركة هنا أو اضغط للاختيار
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {demoMode
                    ? `PDF · PNG · JPEG · WebP — بحد أقصى ${MAX_UPLOAD_MB} ميجابايت (وضع التجربة)`
                    : `PDF · Word · Excel · PNG · JPEG — بحد أقصى ${MAX_UPLOAD_MB} ميجابايت`}
                </p>
              </div>
            )}

            {visibleFiles.length === 0 ? (
              <p className="px-4 pb-6 text-center text-xs text-slate-500">
                {files.length === 0
                  ? 'لا توجد مستندات بعد. ارفع أول نموذج للشركة للبدء.'
                  : 'لا توجد مستندات مطابقة للبحث.'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleFiles.map((file) => (
                  <li key={file.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50/70">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <KindIcon kind={file.kind} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate" title={file.originalName}>
                        {file.originalName}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {kindLabel(file)} · {formatBytes(file.sizeBytes)} · {file.pageCount} صفحة ·{' '}
                        {formatDate(file.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openPreviewForFile(file)}
                        className="p-1.5 text-blue-700 hover:bg-blue-50 rounded-lg"
                        title="معاينة المستند الأصلي"
                        aria-label={`معاينة ${file.originalName}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void handleDownloadFile(file)}
                        className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                        title="تنزيل نسخة من المستند"
                        aria-label={`تنزيل ${file.originalName}`}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {editor && (
                        <button
                          onClick={() => setPendingDeleteFile(file)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                          title="حذف المستند"
                          aria-label={`حذف ${file.originalName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ------------------------------------------------------------- */}
          {/* Templates                                                     */}
          {/* ------------------------------------------------------------- */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-900">قوالب النماذج</h3>
              <span className="text-[11px] font-bold text-slate-500">{templates.length} قالب</span>
            </div>

            {visibleTemplates.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-xs text-slate-500">
                  {templates.length === 0
                    ? 'لا توجد قوالب بعد. ارفع مستندًا ثم أنشئ منه قالبًا.'
                    : 'لا توجد قوالب مطابقة للبحث.'}
                </p>
                {editor && files.length > 0 && templates.length === 0 && (
                  <button
                    onClick={() => setTemplateModal({ mode: 'create' })}
                    className="mt-3 px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إنشاء أول قالب</span>
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleTemplates.map((template) => {
                  const file = fileById.get(template.fileId);
                  return (
                    <li key={template.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50/70">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-blue-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">{template.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {template.category} · {template.fields.length} حقل ·{' '}
                          {file ? file.originalName : 'ملف مفقود'}
                        </p>
                        {template.description && (
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                            {template.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openFiller(template)}
                          className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg"
                          title="تعبئة النموذج وطباعته"
                          aria-label={`تعبئة ${template.name}`}
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openPreviewForTemplate(template)}
                          className="p-1.5 text-blue-700 hover:bg-blue-50 rounded-lg"
                          title="معاينة القالب"
                          aria-label={`معاينة ${template.name}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {editor && (
                          <>
                            <button
                              onClick={() => openDesigner(template)}
                              className="p-1.5 text-blue-800 hover:bg-blue-50 rounded-lg"
                              title="تصميم حقول القالب على المستند"
                              aria-label={`تصميم حقول ${template.name}`}
                            >
                              <Crosshair className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setTemplateModal({ mode: 'edit', template })}
                              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                              title="تعديل بيانات القالب"
                              aria-label={`تعديل ${template.name}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setPendingDeleteTemplate(template)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                              title="حذف القالب"
                              aria-label={`حذف ${template.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed">
              قالب النموذج = المستند الأصلي + حقول مرتبطة ببيانات الموظف/الإجازة/المأمورية. اضغط أيقونة
              تصميم الحقول لتحديد أماكنها، ثم أيقونة الطباعة لتعبئتها وطبعها على A4.
            </div>
          </section>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <FormPreviewModal
          file={preview.file}
          template={preview.template}
          loadBlob={store.downloadFile}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Create / edit template modal */}
      {templateModal && (
        <TemplateFormModal
          state={templateModal}
          files={files}
          categories={categories}
          store={store}
          onClose={() => setTemplateModal(null)}
          onSaved={(saved, mode) => {
            setTemplates((current) =>
              mode === 'create'
                ? [saved, ...current]
                : current.map((row) => (row.id === saved.id ? saved : row)),
            );
            setTemplateModal(null);
            setNotice(
              mode === 'create'
                ? `تم إنشاء القالب «${saved.name}». استخدم أيقونة تصميم الحقول لإضافة الحقول.`
                : `تم تحديث القالب «${saved.name}».`,
            );
          }}
          onError={(message) => setError(message)}
        />
      )}

      {/* Field designer */}
      {designer && fileById.get(designer.fileId) && (
        <FormDesigner
          template={designer}
          file={fileById.get(designer.fileId)!}
          store={store}
          loadBlob={store.downloadFile}
          onClose={() => setDesigner(null)}
          onSaved={(saved) => {
            setTemplates((current) =>
              current.map((row) => (row.id === saved.id ? saved : row)),
            );
            setDesigner(null);
            setNotice(
              `تم حفظ ${saved.fields.length} حقل على القالب «${saved.name}».`,
            );
          }}
        />
      )}

      {/* Fill + print */}
      {filler && fileById.get(filler.fileId) && (
        <FormFiller
          template={filler}
          file={fileById.get(filler.fileId)!}
          store={store}
          employees={employees}
          leaves={leaves}
          permits={permits}
          missions={missions}
          canSave={editor}
          onClose={() => setFiller(null)}
          onSaved={(submission: FormSubmission) => {
            setNotice(
              `تم حفظ النموذج المعبأ لـ «${filler.name}» (رقم ${submission.id.slice(0, 8)}).`,
            );
          }}
        />
      )}

      {/* Delete confirmations */}
      {pendingDeleteFile && (
        <ConfirmDialog
          title="حذف مستند"
          message={`سيتم حذف «${pendingDeleteFile.originalName}» من المكتبة. لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="تأكيد الحذف"
          onConfirm={() => void handleDeleteFile(pendingDeleteFile)}
          onCancel={() => setPendingDeleteFile(null)}
        />
      )}

      {pendingDeleteTemplate && (
        <ConfirmDialog
          title="حذف قالب"
          message={`سيتم حذف القالب «${pendingDeleteTemplate.name}» (لن يُحذف المستند الأصلي). هل تريد المتابعة؟`}
          confirmLabel="تأكيد الحذف"
          onConfirm={() => void handleDeleteTemplate(pendingDeleteTemplate)}
          onCancel={() => setPendingDeleteTemplate(null)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Preview modal
// ---------------------------------------------------------------------------

function FormPreviewModal({
  file,
  template,
  loadBlob,
  onClose,
}: {
  file: FormFile;
  template?: FormTemplate;
  loadBlob: (fileId: string) => Promise<Blob>;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(file.pageCount || 1);
  const [zoom, setZoom] = useState(1);

  const changeZoom = (delta: number) =>
    setZoom((current) => Math.min(2, Math.max(0.5, Number((current + delta).toFixed(2)))));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 no-print">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-preview-title"
        className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden"
      >
        <div className="bg-white px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 id="form-preview-title" className="text-sm font-black text-slate-900 truncate">
              {template ? template.name : file.originalName}
            </h3>
            <p className="text-[11px] text-slate-500 truncate">
              {template ? `${template.category} · ${file.originalName}` : kindLabel(file)}
            </p>
          </div>

          <div className="flex items-center gap-2">
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
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="إغلاق المعاينة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-6 bg-slate-200/70">
          <FormDocumentViewer
            file={file}
            page={page}
            zoom={zoom}
            fields={template?.fields || []}
            loadBlob={loadBlob}
            onPageCount={(count) => {
              setPageCount(Math.max(1, count));
              setPage((current) => Math.min(current, Math.max(1, count)));
            }}
          />
        </div>

        {template && template.fields.length > 0 && (
          <div className="bg-white px-4 py-2 border-t border-slate-200 text-[11px] text-slate-600">
            الحقول في هذه الصفحة:{' '}
            {template.fields.filter((field) => field.page === page).length} — الحقول المرتبطة
            بالبيانات تظهر بقيمها بعد تعبئة النموذج.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit template
// ---------------------------------------------------------------------------

function TemplateFormModal({
  state,
  files,
  categories,
  store,
  onClose,
  onSaved,
  onError,
}: {
  state: TemplateModalState;
  files: FormFile[];
  categories: string[];
  store: FormStore;
  onClose: () => void;
  onSaved: (template: FormTemplate, mode: 'create' | 'edit') => void;
  onError: (message: string) => void;
}) {
  const editing = state.mode === 'edit' ? state.template : null;
  const [name, setName] = useState(editing?.name || '');
  const [category, setCategory] = useState(editing?.category || DEFAULT_CATEGORIES[0]);
  const [description, setDescription] = useState(editing?.description || '');
  const [fileId, setFileId] = useState(editing?.fileId || files[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setFormError('اسم القالب يجب أن يكون حرفين على الأقل.');
      return;
    }
    if (!editing && !fileId) {
      setFormError('اختر المستند الأصلي للقالب.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const saved = await store.updateTemplate(editing.id, {
          name: name.trim(),
          category: category.trim(),
          description: description.trim(),
        });
        onSaved(saved, 'edit');
      } else {
        const saved = await store.createTemplate({
          name: name.trim(),
          category: category.trim(),
          description: description.trim(),
          fileId,
          fields: [],
        });
        onSaved(saved, 'create');
      }
    } catch (saveError) {
      const message = messageOf(saveError, 'تعذر حفظ القالب.');
      setFormError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-modal-title"
        className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl max-h-[92vh] overflow-auto"
      >
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
          <h3 id="template-modal-title" className="text-sm font-black text-slate-900">
            {editing ? 'تعديل بيانات القالب' : 'إنشاء قالب من مستند'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold" aria-label="إغلاق">
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="template-name" className="block text-xs font-semibold text-slate-700 mb-1">
              اسم القالب *
            </label>
            <input
              id="template-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثال: نموذج طلب إجازة سنوية"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              required
              minLength={2}
              maxLength={160}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="template-category" className="block text-xs font-semibold text-slate-700 mb-1">
                التصنيف *
              </label>
              <input
                id="template-category"
                list="template-categories"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                required
                maxLength={60}
              />
              <datalist id="template-categories">
                {categories.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="template-file" className="block text-xs font-semibold text-slate-700 mb-1">
                المستند الأصلي *
              </label>
              <select
                id="template-file"
                value={fileId}
                onChange={(event) => setFileId(event.target.value)}
                disabled={Boolean(editing)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs disabled:opacity-60"
              >
                {files.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.originalName} ({kindLabel(file)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="template-description" className="block text-xs font-semibold text-slate-700 mb-1">
              وصف مختصر
            </label>
            <textarea
              id="template-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="متى يُستخدم هذا النموذج؟"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs resize-none"
            />
          </div>

          {formError && (
            <p role="alert" className="text-[11px] font-bold text-rose-700">
              {formError}
            </p>
          )}

          {!editing && (
            <p className="text-[11px] text-slate-500 bg-blue-50 border border-blue-200 rounded-lg p-2.5 leading-relaxed">
              يُنشأ القالب بدون حقول. بعد الحفظ اضغط أيقونة تصميم الحقول بجوار القالب لتحديد أماكن
              الحقول فوق المستند الأصلي.
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-xs font-bold hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:bg-slate-400"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{editing ? 'حفظ التعديلات' : 'إنشاء القالب'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 id="confirm-title" className="text-sm font-black text-slate-900">
              {title}
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-3 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-xs font-bold hover:bg-slate-50"
          >
            إلغاء
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
