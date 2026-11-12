/**
 * SMD - Suez Methanol Derivatives Co.
 * Storage abstraction for the document engine.
 *
 * Production / normal use: `apiFormStore` calls the FastAPI server, where files
 * are converted with LibreOffice and everything is audited.
 *
 * Trial use without a server: `createDemoFormStore()` keeps files, templates
 * and submissions in this browser's IndexedDB. This is a TEMPORARY DEMO ONLY
 * and is available only when `VITE_ALLOW_OFFLINE_DEMO` is on (development /
 * preview builds). It is disabled in the production image.
 *
 * AGENTS.md §1/§2: the demo is never presented as real data — the UI must show
 * a permanent banner and the mode is reported by `store.mode`.
 */

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  FormFieldPlacement,
  FormFile,
  FormFileKind,
  FormSubmission,
  FormTemplate,
  FormTemplateInput,
} from '../types';
import * as api from './apiClient';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_UPLOAD_MB = 20;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export interface FormStore {
  /** `demo` means browser-only storage (IndexedDB), never the company server. */
  readonly mode: 'api' | 'demo';

  listFiles(): Promise<FormFile[]>;
  uploadFile(file: File, onProgress?: (percent: number) => void): Promise<FormFile>;
  downloadFile(fileId: string): Promise<Blob>;
  deleteFile(fileId: string): Promise<void>;

  listTemplates(): Promise<FormTemplate[]>;
  createTemplate(input: FormTemplateInput): Promise<FormTemplate>;
  updateTemplate(templateId: string, payload: Partial<FormTemplateInput>): Promise<FormTemplate>;
  deleteTemplate(templateId: string): Promise<void>;

  createSubmission(payload: {
    templateId: string;
    employeeId?: string | null;
    values: Record<string, string | number>;
    status?: 'مسودة' | 'نهائي';
  }): Promise<FormSubmission>;
  listSubmissions(params?: {
    templateId?: string;
    employeeId?: string;
  }): Promise<FormSubmission[]>;

  /** Demo only: wipe every browser-stored form. */
  reset?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Server-backed store (the real thing)
// ---------------------------------------------------------------------------

export const apiFormStore: FormStore = {
  mode: 'api',
  listFiles: () => api.fetchFormFiles(),
  uploadFile: (file, onProgress) => api.uploadFormFile(file, onProgress),
  downloadFile: (fileId) => api.downloadFormFile(fileId),
  deleteFile: (fileId) => api.deleteFormFile(fileId),
  listTemplates: () => api.fetchFormTemplates(),
  createTemplate: (input) => api.createFormTemplate(input),
  updateTemplate: (templateId, payload) => api.updateFormTemplate(templateId, payload),
  deleteTemplate: (templateId) => api.deleteFormTemplate(templateId),
  createSubmission: (payload) => api.createFormSubmission(payload),
  listSubmissions: (params) => api.fetchFormSubmissions(params),
};

// ---------------------------------------------------------------------------
// Demo helpers (pure, unit-tested)
// ---------------------------------------------------------------------------

export type DemoUploadKind = 'pdf' | 'image';

/**
 * Demo mode cannot run LibreOffice, so only PDFs and images are accepted.
 * Never guess from the extension alone when the browser reports an MIME type.
 */
export function detectDemoFileKind(file: File): DemoUploadKind | null {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) {
    if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mime)) return 'image';
    return null;
  }
  const extension = (file.name.toLowerCase().split('.').pop() || '').trim();
  if (extension === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension)) return 'image';
  return null;
}

export function assertDemoFileAllowed(file: File): DemoUploadKind {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`حجم الملف يتجاوز الحد المسموح (${MAX_UPLOAD_MB} ميجابايت).`);
  }
  const kind = detectDemoFileKind(file);
  if (!kind) {
    throw new Error(
      'وضع التجربة المحلي يدعم PDF والصور فقط. ملفات Word/Excel تحتاج الخادم (LibreOffice) لتحويلها إلى PDF.',
    );
  }
  return kind;
}

/** Patch a template record without mutating the stored object. */
export function applyTemplateUpdate(
  template: FormTemplate,
  payload: Partial<FormTemplateInput>,
): FormTemplate {
  return {
    ...template,
    name: payload.name ?? template.name,
    category: payload.category ?? template.category,
    description: payload.description ?? template.description,
    fields: (payload.fields ?? template.fields).map((field) => ({ ...field })),
    updatedAt: new Date().toISOString(),
  };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneFields(fields: FormFieldPlacement[]): FormFieldPlacement[] {
  return fields.map((field) => ({ ...field }));
}

// ---------------------------------------------------------------------------
// Demo store (IndexedDB)
// ---------------------------------------------------------------------------

const DB_NAME = 'smd_hr_forms_demo';
const DB_VERSION = 1;
type StoreName = 'files' | 'templates' | 'submissions';

interface DemoFileRecord extends FormFile {
  blob: Blob;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('هذا المتصفح لا يدعم التخزين المحلي (IndexedDB).'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      (['files', 'templates', 'submissions'] as StoreName[]).forEach((name) => {
        if (!database.objectStoreNames.contains(name)) {
          database.createObjectStore(name, { keyPath: 'id' });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('تعذّر فتح التخزين المحلي.'));
  });
  return databasePromise;
}

/**
 * Run one IndexedDB request and resolve on transaction completion, so writes
 * are durable before the UI reports success.
 */
async function runRequest<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result: T;
    const request = action(store);
    request.onsuccess = () => {
      result = request.result as T;
    };
    request.onerror = () => reject(request.error ?? new Error('تعذّر تنفيذ عملية التخزين.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error('تعذّر إتمام عملية التخزين.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('أُلغيت عملية التخزين.'));
  });
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  return runRequest<T[]>(storeName, 'readonly', (store) => store.getAll());
}

async function getOne<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  return runRequest<T | undefined>(storeName, 'readonly', (store) => store.get(key));
}

async function countPdfPages(blob: Blob): Promise<number> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const documentProxy = await pdfjsLib.getDocument({ data }).promise;
  const pages = documentProxy.numPages;
  await documentProxy.destroy();
  return pages;
}

function toMetadata(record: DemoFileRecord): FormFile {
  const { blob: _blob, ...metadata } = record;
  void _blob;
  return metadata;
}

class DemoFormStore implements FormStore {
  readonly mode = 'demo' as const;

  async listFiles(): Promise<FormFile[]> {
    const rows = await getAll<DemoFileRecord>('files');
    return rows
      .map(toMetadata)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async uploadFile(file: File, onProgress?: (percent: number) => void): Promise<FormFile> {
    const kind = assertDemoFileAllowed(file);
    onProgress?.(5);

    const pageCount = kind === 'pdf' ? await countPdfPages(file) : 1;
    onProgress?.(75);

    const record: DemoFileRecord = {
      id: newId(),
      originalName: file.name,
      mime: file.type || (kind === 'pdf' ? 'application/pdf' : 'image/png'),
      kind: kind as FormFileKind,
      sizeBytes: file.size,
      pageCount: Math.max(1, pageCount),
      createdAt: new Date().toISOString(),
      blob: file,
    };

    await runRequest<IDBValidKey>('files', 'readwrite', (store) => store.put(record));
    onProgress?.(100);
    return toMetadata(record);
  }

  async downloadFile(fileId: string): Promise<Blob> {
    const record = await getOne<DemoFileRecord>('files', fileId);
    if (!record) throw new Error('الملف غير موجود في التخزين المحلي. أعد رفعه.');
    return record.blob;
  }

  async deleteFile(fileId: string): Promise<void> {
    const templates = await getAll<FormTemplate>('templates');
    const linked = templates.find((template) => template.fileId === fileId);
    if (linked) {
      throw new Error(`لا يمكن حذف الملف لأنه مرتبط بالقالب «${linked.name}». احذف القالب أولًا.`);
    }
    await runRequest<undefined>('files', 'readwrite', (store) => store.delete(fileId));
  }

  async listTemplates(): Promise<FormTemplate[]> {
    const rows = await getAll<FormTemplate>('templates');
    return rows
      .map((template) => ({ ...template, fields: cloneFields(template.fields || []) }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createTemplate(input: FormTemplateInput): Promise<FormTemplate> {
    const now = new Date().toISOString();
    const template: FormTemplate = {
      id: newId(),
      name: input.name,
      category: input.category,
      description: input.description,
      fileId: input.fileId,
      fields: cloneFields(input.fields || []),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await runRequest<IDBValidKey>('templates', 'readwrite', (store) => store.put(template));
    return template;
  }

  async updateTemplate(
    templateId: string,
    payload: Partial<FormTemplateInput>,
  ): Promise<FormTemplate> {
    const current = await getOne<FormTemplate>('templates', templateId);
    if (!current) throw new Error('القالب غير موجود في التخزين المحلي.');
    const updated = applyTemplateUpdate(current, payload);
    await runRequest<IDBValidKey>('templates', 'readwrite', (store) => store.put(updated));
    return updated;
  }

  async deleteTemplate(templateId: string): Promise<void> {
    await runRequest<undefined>('templates', 'readwrite', (store) => store.delete(templateId));
    // Keep the demo consistent with the server: submissions follow their template.
    const submissions = await getAll<FormSubmission>('submissions');
    const related = submissions.filter((row) => row.templateId === templateId);
    await Promise.all(
      related.map((row) =>
        runRequest<undefined>('submissions', 'readwrite', (store) => store.delete(row.id)),
      ),
    );
  }

  async createSubmission(payload: {
    templateId: string;
    employeeId?: string | null;
    values: Record<string, string | number>;
    status?: 'مسودة' | 'نهائي';
  }): Promise<FormSubmission> {
    const submission: FormSubmission = {
      id: newId(),
      templateId: payload.templateId,
      employeeId: payload.employeeId || undefined,
      values: { ...payload.values },
      status: payload.status || 'نهائي',
      createdAt: new Date().toISOString(),
    };
    await runRequest<IDBValidKey>('submissions', 'readwrite', (store) => store.put(submission));
    return submission;
  }

  async listSubmissions(params: {
    templateId?: string;
    employeeId?: string;
  } = {}): Promise<FormSubmission[]> {
    const rows = await getAll<FormSubmission>('submissions');
    return rows
      .filter((row) => !params.templateId || row.templateId === params.templateId)
      .filter((row) => !params.employeeId || row.employeeId === params.employeeId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async reset(): Promise<void> {
    await Promise.all(
      (['files', 'templates', 'submissions'] as StoreName[]).map((name) =>
        runRequest<undefined>(name, 'readwrite', (store) => store.clear()),
      ),
    );
  }
}

let demoStore: DemoFormStore | null = null;

export function isDemoFormStoreAllowed(): boolean {
  return api.ALLOW_OFFLINE_DEMO;
}

/**
 * Returns the browser-only store, or `null` when the build is a production one
 * (`VITE_ALLOW_OFFLINE_DEMO=false`). Callers must never silently fall back.
 */
export function getDemoFormStore(): FormStore | null {
  if (!isDemoFormStoreAllowed()) return null;
  if (!demoStore) demoStore = new DemoFormStore();
  return demoStore;
}
