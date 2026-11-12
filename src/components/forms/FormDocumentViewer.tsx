/**
 * SMD - Suez Methanol Derivatives Co.
 * Renders an original company document (PDF or image) and, on top of it, the
 * field layer stored with the template.
 *
 * The document is never re-drawn: the PDF page (or the scan) is the background
 * and the fields are absolutely positioned with relative percentages, so the
 * same markup is used for the on-screen preview and for A4 printing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { FormFieldPlacement, FormFile } from '../../types';
import * as api from '../../services/apiClient';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** Width of an A4 page at 96dpi; used to scale font sizes with the zoom. */
const A4_WIDTH_PX = 794;

type Source =
  | { kind: 'pdf'; doc: pdfjsLib.PDFDocumentProxy }
  | { kind: 'image'; url: string };

export interface FormDocumentViewerProps {
  file: FormFile;
  /** 1-based page number to render. */
  page: number;
  zoom?: number;
  fields?: FormFieldPlacement[];
  /** Resolved values keyed by `FormFieldPlacement.key`. */
  values?: Record<string, string | number>;
  /** When true the fields become editable inputs. */
  interactive?: boolean;
  onValuesChange?: (key: string, value: string) => void;
  onPageCount?: (count: number) => void;
}

export function FormDocumentViewer({
  file,
  page,
  zoom = 1,
  fields = [],
  values = {},
  interactive = false,
  onValuesChange,
  onPageCount,
}: FormDocumentViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const pageCountCallbackRef = useRef(onPageCount);
  pageCountCallbackRef.current = onPageCount;

  const [source, setSource] = useState<Source | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [pageBox, setPageBox] = useState({
    width: A4_WIDTH_PX,
    height: Math.round(A4_WIDTH_PX * 1.4142),
  });

  // -------------------------------------------------------------------------
  // Load the document once per file (Bearer-authenticated blob).
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    let documentProxy: pdfjsLib.PDFDocumentProxy | null = null;

    setStatus('loading');
    setErrorMessage('');
    setSource(null);

    (async () => {
      try {
        const blob = await api.downloadFormFile(file.id);
        if (cancelled) return;

        if (blob.type.startsWith('image/')) {
          objectUrl = URL.createObjectURL(blob);
          setSource({ kind: 'image', url: objectUrl });
          pageCountCallbackRef.current?.(1);
          setStatus('ready');
          return;
        }

        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        documentProxy = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) {
          void documentProxy.destroy();
          return;
        }
        setSource({ kind: 'pdf', doc: documentProxy });
        pageCountCallbackRef.current?.(documentProxy.numPages);
        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : 'تعذّر عرض المستند. تحقق من الاتصال بالخادم.',
        );
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (documentProxy) void documentProxy.destroy();
    };
  }, [file.id]);

  // -------------------------------------------------------------------------
  // Render the requested PDF page.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!source || source.kind !== 'pdf') return;
    let cancelled = false;

    (async () => {
      try {
        const pdf = source.doc;
        const target = Math.min(Math.max(1, page), pdf.numPages);
        const pdfPage = await pdf.getPage(target);
        if (cancelled) return;

        const base = pdfPage.getViewport({ scale: 1 });
        const cssWidth = Math.round(base.width * zoom);
        const cssHeight = Math.round(base.height * zoom);
        const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
        const viewport = pdfPage.getViewport({ scale: zoom * pixelRatio });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        setPageBox({ width: cssWidth, height: cssHeight });

        renderTaskRef.current?.cancel();
        const task = pdfPage.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;
        try {
          await task.promise;
        } catch (error) {
          if ((error as Error)?.name !== 'RenderingCancelledException') throw error;
        }
      } catch (error) {
        if (cancelled) return;
        if ((error as Error)?.name === 'RenderingCancelledException') return;
        setStatus('error');
        setErrorMessage('تعذّر عرض صفحة المستند.');
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [source, page, zoom]);

  const handleValueChange = useCallback(
    (key: string, value: string) => onValuesChange?.(key, value),
    [onValuesChange],
  );

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-blue-700" />
        <span className="text-xs font-bold">جارٍ تحميل المستند الأصلي...</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 p-3.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-xs font-bold"
      >
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>{errorMessage}</span>
      </div>
    );
  }

  const pageFields = fields.filter((field) => field.page === page);
  const fontScale = pageBox.width / A4_WIDTH_PX;

  return (
    <div className="flex justify-center">
      <div
        className="relative bg-white shadow-xl border border-slate-300 overflow-hidden"
        style={{ width: pageBox.width, height: pageBox.height }}
      >
        {source?.kind === 'image' ? (
          <img
            src={source.url}
            alt={`المستند الأصلي: ${file.originalName}`}
            className="w-full h-full object-contain select-none pointer-events-none"
            onLoad={(event) => {
              const image = event.currentTarget;
              if (!image.naturalWidth) return;
              const width = Math.round(A4_WIDTH_PX * zoom);
              setPageBox({
                width,
                height: Math.round((width * image.naturalHeight) / image.naturalWidth),
              });
            }}
          />
        ) : (
          <canvas ref={canvasRef} className="block" aria-label={`صفحة ${page} من ${file.originalName}`} />
        )}

        {pageFields.map((field) => {
          const value = values[field.key] ?? '';
          const style: CSSProperties = {
            position: 'absolute',
            left: `${field.x}%`,
            top: `${field.y}%`,
            width: `${field.width}%`,
            height: `${field.height}%`,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              field.align === 'center' ? 'center' : field.align === 'left' ? 'flex-start' : 'flex-end',
            fontSize: `${Math.max(6, field.fontSize * fontScale)}px`,
            fontWeight: field.fontWeight === 'bold' ? 700 : 400,
            color: field.color,
            lineHeight: 1.2,
            padding: '0 2px',
          };

          if (interactive) {
            return (
              <div key={field.key} style={style}>
                <input
                  type="text"
                  value={value}
                  onChange={(event) => handleValueChange(field.key, event.target.value)}
                  aria-label={field.label || field.key}
                  placeholder={field.label || field.key}
                  style={{
                    fontSize: 'inherit',
                    fontWeight: 'inherit',
                    color: 'inherit',
                    textAlign: field.align,
                  }}
                  className="w-full h-full bg-blue-50/40 border border-dashed border-blue-500/50 focus:border-blue-700 focus:bg-white focus:ring-1 focus:ring-blue-400 outline-none px-0.5 font-sans"
                />
              </div>
            );
          }

          return (
            <div key={field.key} style={style} className="overflow-hidden whitespace-nowrap">
              <span className="w-full">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
