/**
 * SMD - Suez Methanol Derivatives Co.
 * Visual field designer for the document engine.
 *
 * The original document is the background (never re-drawn). The user drops
 * fields on top of it, drags/resizes them with the mouse (or types exact
 * percentages in the properties panel) and binds each field to an employee /
 * leave / permit / mission value. Only relative percentages are saved, so the
 * same template prints identically on A4.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crosshair,
  Loader2,
  Plus,
  Save,
  Trash2,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { FormFieldPlacement, FormTemplate, FormFile } from '../../types';
import * as api from '../../services/apiClient';
import { BINDING_GROUPS, bindingLabel, isKnownBinding } from '../../utils/formBindings';
import {
  MAX_FIELDS,
  clamp,
  nextFieldKey,
  round2,
  validateFields,
} from '../../utils/formDesign';
import { FormDocumentViewer } from './FormDocumentViewer';

interface FormDesignerProps {
  template: FormTemplate;
  file: FormFile;
  onClose: () => void;
  onSaved: (template: FormTemplate) => void;
}

interface Interaction {
  key: string;
  mode: 'move' | 'resize';
  startClientX: number;
  startClientY: number;
  origin: FormFieldPlacement;
  pageWidth: number;
  pageHeight: number;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function defaultPlacement(index: number, page: number): Omit<FormFieldPlacement, 'key'> {
  const column = index % 4;
  const row = index % 8;
  return {
    binding: 'employee.name',
    label: 'اسم الموظف',
    page,
    x: round2(6 + column * 6),
    y: round2(10 + row * 8),
    width: 30,
    height: 4.5,
    fontSize: 12,
    fontWeight: 'normal',
    align: 'right',
    color: '#000000',
  };
}

export const FormDesigner: React.FC<FormDesignerProps> = ({
  template,
  file,
  onClose,
  onSaved,
}) => {
  const [fields, setFields] = useState<FormFieldPlacement[]>(template.fields);
  const [selectedKey, setSelectedKey] = useState<string | null>(template.fields[0]?.key ?? null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(Math.max(1, file.pageCount || 1));
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const [pageWidth, setPageWidth] = useState(794);
  const interactionRef = useRef<Interaction | null>(null);

  const selected = useMemo(
    () => fields.find((field) => field.key === selectedKey) || null,
    [fields, selectedKey],
  );

  // Track the rendered page width so the designer's text scales with the zoom.
  useEffect(() => {
    if (!pageEl) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setPageWidth(width);
    });
    observer.observe(pageEl);
    setPageWidth(pageEl.clientWidth || 794);
    return () => observer.disconnect();
  }, [pageEl]);

  // Keep the selection valid when a field is removed (handled by `deleteField`).

  const updateField = useCallback((key: string, patch: Partial<FormFieldPlacement>) => {
    setFields((current) =>
      current.map((field) => (field.key === key ? { ...field, ...patch } : field)),
    );
  }, []);

  /** Renaming the key must follow the selection, otherwise it jumps away. */
  const renameField = (oldKey: string, nextKeyValue: string) => {
    setFields((current) =>
      current.map((field) =>
        field.key === oldKey ? { ...field, key: nextKeyValue.toLowerCase() } : field,
      ),
    );
    setSelectedKey(nextKeyValue.toLowerCase());
  };

  const deleteField = (key: string) => {
    const remaining = fields.filter((field) => field.key !== key);
    setFields(remaining);
    if (selectedKey === key) setSelectedKey(remaining[0]?.key ?? null);
  };

  const addField = () => {
    if (fields.length >= MAX_FIELDS) {
      setError(`لا يمكن إضافة أكثر من ${MAX_FIELDS} حقل للقالب.`);
      return;
    }
    const key = nextFieldKey(fields);
    const created: FormFieldPlacement = { key, ...defaultPlacement(fields.length, page) };
    setFields((current) => [...current, created]);
    setSelectedKey(key);
    setError(null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    if (fields.length >= MAX_FIELDS) {
      setError(`لا يمكن إضافة أكثر من ${MAX_FIELDS} حقل للقالب.`);
      return;
    }
    const key = nextFieldKey(fields);
    const copy: FormFieldPlacement = {
      ...selected,
      key,
      x: round2(clamp(selected.x + 2, 0, 100 - selected.width)),
      y: round2(clamp(selected.y + 2, 0, 100 - selected.height)),
    };
    setFields((current) => [...current, copy]);
    setSelectedKey(key);
  };

  const removeSelected = () => {
    if (!selected) return;
    deleteField(selected.key);
  };

  // -------------------------------------------------------------------------
  // Drag & resize (pointer events → relative percentages)
  // -------------------------------------------------------------------------
  const beginInteraction = (
    event: React.PointerEvent,
    field: FormFieldPlacement,
    mode: Interaction['mode'],
  ) => {
    if (event.button !== 0) return;
    if (!pageEl) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedKey(field.key);

    const rect = pageEl.getBoundingClientRect();
    interactionRef.current = {
      key: field.key,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: { ...field },
      pageWidth: rect.width || 1,
      pageHeight: rect.height || 1,
    };

    const onMove = (moveEvent: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const dx = ((moveEvent.clientX - interaction.startClientX) / interaction.pageWidth) * 100;
      const dy = ((moveEvent.clientY - interaction.startClientY) / interaction.pageHeight) * 100;
      const origin = interaction.origin;

      if (interaction.mode === 'move') {
        updateField(interaction.key, {
          x: round2(clamp(origin.x + dx, 0, 100 - origin.width)),
          y: round2(clamp(origin.y + dy, 0, 100 - origin.height)),
        });
        return;
      }

      // The resize handle sits on the bottom-left corner of the field.
      const maxWidth = 100 - origin.x;
      const maxHeight = 100 - origin.y;
      updateField(interaction.key, {
        width: round2(clamp(origin.width - dx, 1, maxWidth)),
        height: round2(clamp(origin.height + dy, 1, maxHeight)),
      });
    };

    const onUp = () => {
      interactionRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Delete key removes the selected field (unless the user is typing).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (!selectedKey) return;
      event.preventDefault();
      const remaining = fields.filter((field) => field.key !== selectedKey);
      setFields(remaining);
      setSelectedKey(remaining[0]?.key ?? null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedKey, fields]);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  const save = async () => {
    const cleaned = fields.map((field) => ({
      ...field,
      key: field.key.trim(),
      binding: field.binding.trim(),
      label: field.label.trim(),
      x: round2(field.x),
      y: round2(field.y),
      width: round2(field.width),
      height: round2(field.height),
      fontSize: round2(field.fontSize),
    }));

    const problem = validateFields(cleaned, pageCount);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateFormTemplate(template.id, { fields: cleaned });
      onSaved(saved);
    } catch (saveError) {
      setError(messageOf(saveError, 'تعذر حفظ حقول القالب على الخادم.'));
    } finally {
      setSaving(false);
    }
  };

  const changeZoom = (delta: number) =>
    setZoom((current) => clamp(Number((current + delta).toFixed(2)), 0.5, 2));

  const pageFields = fields.filter((field) => field.page === page);
  const fontScale = pageWidth / 794;

  // -------------------------------------------------------------------------
  // Overlay (design handles)
  // -------------------------------------------------------------------------
  const overlay = (
    <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      {pageFields.map((field) => {
        const isSelected = field.key === selectedKey;
        const style: CSSProperties = {
          position: 'absolute',
          left: `${field.x}%`,
          top: `${field.y}%`,
          width: `${field.width}%`,
          height: `${field.height}%`,
          pointerEvents: 'auto',
          cursor: 'move',
          border: isSelected ? '2px solid #1d4ed8' : '1px dashed #b45309',
          background: isSelected ? 'rgba(29, 78, 216, 0.08)' : 'rgba(180, 83, 9, 0.06)',
          boxShadow: isSelected ? '0 0 0 1px rgba(29,78,216,0.35)' : undefined,
          touchAction: 'none',
          overflow: 'visible',
        };

        return (
          <div
            key={field.key}
            style={style}
            onPointerDown={(event) => beginInteraction(event, field, 'move')}
            aria-label={`حقل ${field.label || field.key}`}
            title={`${field.label || field.key} — ${bindingLabel(field.binding)}`}
          >
            <span
              className="absolute -top-4 start-0 px-1 rounded-sm bg-blue-700 text-white whitespace-nowrap"
              style={{ fontSize: '10px', opacity: isSelected ? 1 : 0.85 }}
            >
              {field.label || field.key}
            </span>

            {isSelected && (
              <span
                role="presentation"
                onPointerDown={(event) => beginInteraction(event, field, 'resize')}
                className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border-2 border-blue-700 rounded-sm cursor-sw-resize"
                style={{ touchAction: 'none' }}
                title="سحب لتغيير الحجم"
              />
            )}
          </div>
        );
      })}
    </div>
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-stretch justify-center p-0 sm:p-4 no-print">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-designer-title"
        className="bg-slate-100 w-full max-w-[1500px] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-full"
      >
        {/* Header */}
        <div className="bg-white px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 id="form-designer-title" className="text-sm font-black text-slate-900 truncate">
              تصميم حقول «{template.name}»
            </h3>
            <p className="text-[11px] text-slate-500 truncate">
              {file.originalName} · اسحب الحقل لتحديد مكانه، واسحب المربع السفلي لتغيير الحجم.
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
              onClick={addField}
              className="px-3 py-2 bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة حقل</span>
            </button>

            <button
              onClick={() => void save()}
              disabled={saving}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:bg-slate-400"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? 'جارٍ الحفظ...' : 'حفظ الحقول'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="إغلاق المصمم"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mx-4 mt-3 p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs font-bold flex items-center justify-between shrink-0"
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="إغلاق" className="font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Canvas */}
          <div
            className="flex-1 min-h-[45vh] overflow-auto p-3 sm:p-5 bg-slate-200/70"
            onPointerDown={() => setSelectedKey(null)}
          >
            <div className="w-fit mx-auto" onPointerDown={(event) => event.stopPropagation()}>
              <FormDocumentViewer
                file={file}
                page={page}
                zoom={zoom}
                fields={[]}
                pageRef={setPageEl}
                overlay={overlay}
                onPageCount={(count) => {
                  const safe = Math.max(1, count);
                  setPageCount(safe);
                  setPage((current) => Math.min(current, safe));
                }}
              />
            </div>
          </div>

          {/* Properties panel */}
          <aside className="w-full lg:w-[360px] shrink-0 bg-white border-t lg:border-t-0 lg:border-s border-slate-200 overflow-auto max-h-[50vh] lg:max-h-none">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900">
                الحقول ({fields.length})
              </h4>
              <span className="text-[11px] text-slate-500">
                صفحة {page}: {pageFields.length}
              </span>
            </div>

            <ul className="max-h-44 overflow-auto divide-y divide-slate-100 border-b border-slate-200">
              {fields.length === 0 && (
                <li className="px-4 py-4 text-[11px] text-slate-500">
                  لا توجد حقول بعد. اضغط «إضافة حقل» ثم اسحبه إلى مكانه على المستند.
                </li>
              )}
              {fields.map((field) => (
                <li key={field.key}>
                  <button
                    onClick={() => {
                      setSelectedKey(field.key);
                      setPage(field.page);
                    }}
                    className={`w-full text-start px-4 py-2 flex items-center justify-between gap-2 text-[11px] ${
                      field.key === selectedKey ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{field.label || field.key}</span>
                    <span className="shrink-0 text-slate-400 font-mono">
                      ص{field.page} · {bindingLabel(field.binding)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {selected ? (
              <div className="p-4 space-y-3">
                <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-blue-700" />
                  خصائص الحقل المحدد
                </p>

                <div>
                  <label htmlFor="field-key" className="block text-[11px] font-semibold text-slate-700 mb-1">
                    المفتاح (key) *
                  </label>
                  <input
                    id="field-key"
                    value={selected.key}
                    onChange={(event) => renameField(selected.key, event.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    maxLength={64}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    حروف إنجليزية صغيرة وأرقام و_ فقط (لا يمكن تكراره).
                  </p>
                </div>

                <div>
                  <label htmlFor="field-label" className="block text-[11px] font-semibold text-slate-700 mb-1">
                    التسمية الظاهرة
                  </label>
                  <input
                    id="field-label"
                    value={selected.label}
                    onChange={(event) =>
                      updateField(selected.key, { label: event.target.value })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                    maxLength={80}
                  />
                </div>

                <div>
                  <label htmlFor="field-binding" className="block text-[11px] font-semibold text-slate-700 mb-1">
                    يُعبأ من (Binding) *
                  </label>
                  <select
                    id="field-binding"
                    value={selected.binding}
                    onChange={(event) =>
                      updateField(selected.key, {
                        binding: event.target.value,
                        label:
                          selected.label && isKnownBinding(selected.binding)
                            ? bindingLabel(event.target.value)
                            : selected.label || bindingLabel(event.target.value),
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    {!isKnownBinding(selected.binding) && (
                      <option value={selected.binding}>{selected.binding} (مخصص)</option>
                    )}
                    {BINDING_GROUPS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="field-page" className="block text-[11px] font-semibold text-slate-700 mb-1">
                      الصفحة
                    </label>
                    <input
                      id="field-page"
                      type="number"
                      min={1}
                      max={pageCount}
                      value={selected.page}
                      onChange={(event) =>
                        updateField(selected.key, {
                          page: clamp(Math.round(Number(event.target.value) || 1), 1, pageCount),
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="field-font-size" className="block text-[11px] font-semibold text-slate-700 mb-1">
                      حجم الخط
                    </label>
                    <input
                      id="field-font-size"
                      type="number"
                      min={6}
                      max={72}
                      step={0.5}
                      value={selected.fontSize}
                      onChange={(event) =>
                        updateField(selected.key, {
                          fontSize: clamp(Number(event.target.value) || 6, 6, 72),
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['x', 'X %'],
                      ['y', 'Y %'],
                      ['width', 'العرض %'],
                      ['height', 'الارتفاع %'],
                    ] as const
                  ).map(([property, label]) => (
                    <div key={property}>
                      <label
                        htmlFor={`field-${property}`}
                        className="block text-[11px] font-semibold text-slate-700 mb-1"
                      >
                        {label}
                      </label>
                      <input
                        id={`field-${property}`}
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={selected[property]}
                        onChange={(event) =>
                          updateField(selected.key, {
                            [property]: round2(clamp(Number(event.target.value) || 0, 0, 100)),
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-700 mb-1">
                      المحاذاة
                    </span>
                    <div className="flex items-center gap-1" role="group" aria-label="محاذاة النص">
                      {(
                        [
                          ['right', AlignRight, 'يمين'],
                          ['center', AlignCenter, 'وسط'],
                          ['left', AlignLeft, 'يسار'],
                        ] as const
                      ).map(([align, Icon, label]) => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => updateField(selected.key, { align })}
                          aria-pressed={selected.align === align}
                          title={label}
                          className={`p-1.5 rounded-lg border ${
                            selected.align === align
                              ? 'bg-blue-700 text-white border-blue-700'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] font-semibold text-slate-700 mb-1">
                      النمط
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateField(selected.key, {
                            fontWeight: selected.fontWeight === 'bold' ? 'normal' : 'bold',
                          })
                        }
                        aria-pressed={selected.fontWeight === 'bold'}
                        title="عريض"
                        className={`p-1.5 rounded-lg border ${
                          selected.fontWeight === 'bold'
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="color"
                        aria-label="لون النص"
                        value={selected.color}
                        onChange={(event) =>
                          updateField(selected.key, { color: event.target.value })
                        }
                        className="w-8 h-8 p-0.5 bg-white border border-slate-300 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={duplicateSelected}
                    className="flex-1 px-2.5 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold hover:bg-slate-50 flex items-center justify-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>تكرار</span>
                  </button>
                  <button
                    type="button"
                    onClick={removeSelected}
                    className="flex-1 px-2.5 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold hover:bg-rose-100 flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف الحقل</span>
                  </button>
                </div>

                <p className="text-[10px] text-slate-400 flex items-center gap-1 leading-relaxed">
                  <Crosshair className="w-3 h-3 shrink-0" />
                  الإحداثيات نسبة من الصفحة (0–100%)، لذلك تُطبع بنفس الشكل على A4.
                </p>
              </div>
            ) : (
              <div className="p-4 text-[11px] text-slate-500 leading-relaxed">
                اختر حقلًا من القائمة أو اضغط عليه فوق المستند لتعديل خصائصه.
              </div>
            )}
          </aside>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span>
            {pageFields.length} حقل على هذه الصفحة · إجمالي {fields.length} من {MAX_FIELDS}
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 border border-dashed border-amber-700 bg-amber-100"
              aria-hidden
            />
            غير محدد
            <span
              className="inline-block w-3 h-3 border-2 border-blue-700 bg-blue-100 ms-2"
              aria-hidden
            />
            محدد
          </span>
        </div>
      </div>
    </div>
  );
};
