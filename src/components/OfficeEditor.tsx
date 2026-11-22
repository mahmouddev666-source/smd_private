/**
 * SMD - Suez Methanol Derivatives Co.
 * ONLYOFFICE Document Editor wrapper (Phase 4A).
 *
 * The editor SDK is loaded lazily only after the user explicitly asks to edit
 * a Word/Excel file and the server has issued a signed config. Any failure —
 * config request, SDK download, health/timeout or editor event — offers a
 * one-click return to the existing PDF/Overlay preview (Phase 4E).
 */

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type {
  Config,
  DocumentStateChangeEvent,
  ErrorEvent as OfficeErrorEvent,
} from '@onlyoffice/doceditor-types';
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react';
import { FormFile } from '../types';
import * as api from '../services/apiClient';
import { parseOfficeLoadTimeoutMs } from '../utils/office';

const DocumentEditor = lazy(async () => {
  const module = await import('@onlyoffice/document-editor-react');
  return { default: module.DocumentEditor };
});

type EditorPhase = 'config' | 'editor' | 'ready' | 'error';

interface OfficeEditorProps {
  file: FormFile;
  onClose: () => void;
  /** Return to the legacy preview with an explanatory Arabic notice. */
  onFallback: (reason: string) => void;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function EditorLoading({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-600">
      <Loader2 className="w-7 h-7 animate-spin text-blue-700" />
      <p className="text-xs font-bold">{text}</p>
    </div>
  );
}

export const OfficeEditor: React.FC<OfficeEditorProps> = ({ file, onClose, onFallback }) => {
  const [phase, setPhase] = useState<EditorPhase>('config');
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [documentServerUrl, setDocumentServerUrl] = useState('/onlyoffice');
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const mountedRef = useRef(true);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fail = useCallback(
    (message: string) => {
      if (!mountedRef.current) return;
      clearTimer();
      setError(message);
      setPhase('error');
    },
    [clearTimer],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPhase('config');
    setError(null);
    setConfig(null);
    setDirty(false);

    api
      .fetchOfficeConfig(file.id)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;

        const events: NonNullable<Config['events']> = {
          onAppReady: () => {
            if (cancelled || !mountedRef.current) return;
            clearTimer();
            setPhase('ready');
          },
          onDocumentStateChange: (event: DocumentStateChangeEvent) => {
            if (!cancelled && mountedRef.current) setDirty(Boolean(event.data));
          },
          onError: (event: OfficeErrorEvent) => {
            const detail = event.data?.errorDescription;
            fail(detail ? `أبلغ المحرر عن خطأ: ${detail}` : 'أبلغ المحرر عن خطأ أثناء التحميل.');
          },
        };

        setConfig({ ...(data.config as Config), events });
        setDocumentServerUrl(
          data.documentServerUrl ||
            (import.meta.env.VITE_ONLYOFFICE_URL as string | undefined) ||
            '/onlyoffice',
        );
        setPhase('editor');
        timerRef.current = window.setTimeout(
          () => fail('انتهت مهلة تحميل محرر ONLYOFFICE. يمكنك استخدام المعاينة بدلاً منه.'),
          parseOfficeLoadTimeoutMs(
            import.meta.env.VITE_OFFICE_LOAD_TIMEOUT_MS as string | undefined,
          ),
        );
      })
      .catch((configError: unknown) => {
        if (!cancelled) fail(messageOf(configError, 'تعذر تجهيز جلسة التحرير.'));
      });

    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [file.id, attempt, clearTimer, fail]);

  const releaseSession = useCallback(() => {
    void api.closeOfficeSession(file.id).catch(() => undefined);
  }, [file.id]);

  const handleClose = () => {
    releaseSession();
    onClose();
  };

  const handleFallback = () => {
    releaseSession();
    onFallback(error || 'تعذر تحميل محرر المستند. تم فتح المعاينة بدلاً منه.');
  };

  const handleRetry = () => {
    clearTimer();
    setAttempt((current) => current + 1);
  };

  const editorId = `smd-office-${file.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const statusLabel =
    phase === 'ready'
      ? 'المحرر جاهز'
      : phase === 'error'
        ? 'تعذر التحميل'
        : 'جارٍ التهيئة';

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 no-print">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="office-editor-title"
        className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden"
      >
        <div className="bg-white px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 id="office-editor-title" className="text-sm font-black text-slate-900 truncate">
              تحرير المستند — {file.originalName}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
              <span>ONLYOFFICE</span>
              <span>·</span>
              <span>{statusLabel}</span>
              {dirty && (
                <>
                  <span>·</span>
                  <span className="text-amber-700 font-bold">توجد تعديلات لم تُرسل بعد</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {phase === 'error' && (
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-blue-800 bg-blue-50 hover:bg-blue-100"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                إعادة المحاولة
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="إغلاق المحرر"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {phase === 'error' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-slate-900">تعذر تشغيل محرر ONLYOFFICE</h4>
            <p className="text-xs text-slate-600 max-w-md leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={handleFallback}
              className="mt-2 px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-800 hover:bg-blue-700"
            >
              العودة إلى المعاينة
            </button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 relative bg-slate-200/70">
            {!config && <EditorLoading text="جارٍ تجهيز جلسة التحرير..." />}
            {config && (
              <Suspense fallback={<EditorLoading text="جارٍ تحميل محرر ONLYOFFICE..." />}>
                <DocumentEditor
                  id={editorId}
                  documentServerUrl={documentServerUrl}
                  config={config}
                  onLoadComponentError={(code, description) =>
                    fail(`فشل تحميل مكوّن المحرر (${code}): ${description}`)
                  }
                />
              </Suspense>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
