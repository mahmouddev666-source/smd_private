import {describe, expect, it} from 'vitest';
import {mapFieldPlacement, mapFormSubmission, mapFormTemplate} from '../../src/services/apiClient';

/**
 * The document engine returns snake_case DTOs; the UI works with camelCase.
 * These tests protect that contract (a silent mismatch would put fields on the
 * wrong position on the original document).
 */

describe('document engine mappers', () => {
  it('maps a server field placement to the UI shape', () => {
    const field = mapFieldPlacement({
      key: 'employee_name',
      binding: 'employee.name',
      label: 'اسم الموظف',
      page: 1,
      x: 10,
      y: 20,
      width: 40,
      height: 5,
      font_size: 13,
      font_weight: 'bold',
      align: 'right',
      color: '#0f172a',
    });

    expect(field).toEqual({
      key: 'employee_name',
      binding: 'employee.name',
      label: 'اسم الموظف',
      page: 1,
      x: 10,
      y: 20,
      width: 40,
      height: 5,
      fontSize: 13,
      fontWeight: 'bold',
      align: 'right',
      color: '#0f172a',
    });
  });

  it('maps a template and its fields without losing the original file id', () => {
    const template = mapFormTemplate({
      id: 'tpl-1',
      name: 'طلب إجازة',
      category: 'الإجازات',
      description: 'نموذج الشركة',
      file_id: 'file-1',
      fields: [
        {
          key: 'start_date',
          binding: 'leave.startDate',
          label: 'تاريخ البدء',
          page: 2,
          x: 55,
          y: 30,
          width: 20,
          height: 4,
          font_size: 11,
          font_weight: 'normal',
          align: 'center',
          color: '#000000',
        },
      ],
      is_active: true,
      created_at: '2026-11-13T10:00:00Z',
      updated_at: '2026-11-13T11:00:00Z',
    });

    expect(template.fileId).toBe('file-1');
    expect(template.isActive).toBe(true);
    expect(template.fields).toHaveLength(1);
    expect(template.fields[0].page).toBe(2);
    expect(template.fields[0].fontWeight).toBe('normal');
  });

  it('maps submissions and keeps the employee link optional', () => {
    const submission = mapFormSubmission({
      id: 'sub-1',
      template_id: 'tpl-1',
      employee_id: null,
      values: {employee_name: 'م. مروان', start_date: '2026-11-15'},
      status: 'مسودة',
      created_by: null,
      created_at: '2026-11-13T10:00:00Z',
    });

    expect(submission.templateId).toBe('tpl-1');
    expect(submission.employeeId).toBeUndefined();
    expect(submission.status).toBe('مسودة');
    expect(submission.values.start_date).toBe('2026-11-15');
  });
});
