import {describe, expect, it} from 'vitest';
import {FormTemplate} from '../../src/types';
import {
  applyTemplateUpdate,
  assertDemoFileAllowed,
  detectDemoFileKind,
} from '../../src/services/formStore';

/**
 * The temporary browser demo store must reject exactly what it cannot handle
 * (anything LibreOffice would have converted) and must never mutate a stored
 * template in place. These helpers are pure so they can be tested without
 * IndexedDB.
 */

function fileOf(name: string, type: string, size = 4): File {
  return new File([new Uint8Array(size)], name, {type});
}

function templateOf(): FormTemplate {
  return {
    id: 'tpl-1',
    name: 'طلب إجازة',
    category: 'الإجازات',
    description: 'نموذج الشركة',
    fileId: 'file-1',
    isActive: true,
    createdAt: '2026-11-13T10:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
    fields: [
      {
        key: 'employee_name',
        binding: 'employee.name',
        label: 'اسم الموظف',
        page: 1,
        x: 10,
        y: 10,
        width: 30,
        height: 5,
        fontSize: 12,
        fontWeight: 'normal',
        align: 'right',
        color: '#000000',
      },
    ],
  };
}

describe('detectDemoFileKind', () => {
  it('accepts PDFs and supported images by MIME type', () => {
    expect(detectDemoFileKind(fileOf('form.pdf', 'application/pdf'))).toBe('pdf');
    expect(detectDemoFileKind(fileOf('scan.png', 'image/png'))).toBe('image');
    expect(detectDemoFileKind(fileOf('scan.jpg', 'image/jpeg'))).toBe('image');
    expect(detectDemoFileKind(fileOf('scan.webp', 'image/webp'))).toBe('image');
  });

  it('falls back to the extension when the browser reports no MIME type', () => {
    expect(detectDemoFileKind(fileOf('form.PDF', ''))).toBe('pdf');
    expect(detectDemoFileKind(fileOf('scan.JPEG', ''))).toBe('image');
  });

  it('rejects Word, Excel and unsupported image formats', () => {
    expect(
      detectDemoFileKind(
        fileOf(
          'form.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ),
    ).toBeNull();
    expect(detectDemoFileKind(fileOf('form.xlsx', 'application/vnd.ms-excel'))).toBeNull();
    expect(detectDemoFileKind(fileOf('scan.gif', 'image/gif'))).toBeNull();
    expect(detectDemoFileKind(fileOf('notes.txt', 'text/plain'))).toBeNull();
  });
});

describe('assertDemoFileAllowed', () => {
  it('returns the kind for an allowed file', () => {
    expect(assertDemoFileAllowed(fileOf('form.pdf', 'application/pdf'))).toBe('pdf');
  });

  it('explains that Word/Excel need the server', () => {
    expect(() => assertDemoFileAllowed(fileOf('form.docx', ''))).toThrow(/LibreOffice/);
  });

  it('enforces the 20MB upload limit', () => {
    const big = fileOf('big.pdf', 'application/pdf', 21 * 1024 * 1024);
    expect(() => assertDemoFileAllowed(big)).toThrow(/20/);
  });
});

describe('applyTemplateUpdate', () => {
  it('applies the patch and refreshes updatedAt without mutating the input', () => {
    const original = templateOf();
    const snapshot = JSON.stringify(original);

    const updated = applyTemplateUpdate(original, {
      name: 'طلب إجازة سنوية',
      fields: [{...original.fields[0], x: 22}],
    });

    expect(updated.name).toBe('طلب إجازة سنوية');
    expect(updated.fields[0].x).toBe(22);
    expect(updated.category).toBe(original.category);
    expect(updated.updatedAt).not.toBe(original.updatedAt);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
