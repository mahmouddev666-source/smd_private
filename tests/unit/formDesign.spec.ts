import {describe, expect, it} from 'vitest';
import {FormFieldPlacement} from '../../src/types';
import {
  MAX_FIELDS,
  clamp,
  nextFieldKey,
  round2,
  validateFields,
} from '../../src/utils/formDesign';

/**
 * The designer must reject locally exactly what the API rejects (Pydantic
 * patterns and 0–100% bounds), otherwise the save fails after the user has
 * already placed every field.
 */

function field(patch: Partial<FormFieldPlacement> = {}): FormFieldPlacement {
  return {
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
    ...patch,
  };
}

describe('validateFields', () => {
  it('accepts a valid field layer', () => {
    expect(validateFields([field(), field({key: 'employee_dept', binding: 'employee.department'})], 1)).toBeNull();
    expect(validateFields([], 1)).toBeNull();
  });

  it('rejects duplicate keys', () => {
    expect(validateFields([field(), field()], 1)).toContain('تكرار');
  });

  it('rejects a key that does not match the server pattern', () => {
    expect(validateFields([field({key: 'Employee-Name'})], 1)).toContain('غير صالح');
    expect(validateFields([field({key: '9name'})], 1)).toContain('غير صالح');
  });

  it('rejects a field outside the page bounds', () => {
    expect(validateFields([field({x: 80, width: 30})], 1)).toContain('يتجاوز حدود الصفحة');
    expect(validateFields([field({y: 98, height: 5})], 1)).toContain('يتجاوز حدود الصفحة');
  });

  it('rejects zero-sized fields and negative coordinates', () => {
    expect(validateFields([field({width: 0})], 1)).toContain('أكبر من صفر');
    expect(validateFields([field({x: -1})], 1)).toContain('سالبة');
  });

  it('rejects a page beyond the document', () => {
    expect(validateFields([field({page: 3})], 2)).toContain('بينما المستند 2 صفحة');
    // pageCount 0 means the document page count is still unknown.
    expect(validateFields([field({page: 3})], 0)).toBeNull();
  });

  it('rejects invalid bindings and colours', () => {
    expect(validateFields([field({binding: 'employee name'})], 1)).toContain('ربط');
    expect(validateFields([field({color: 'red'})], 1)).toContain('لون');
  });

  it('rejects a font size outside 6–72', () => {
    expect(validateFields([field({fontSize: 4})], 1)).toContain('حجم خط');
    expect(validateFields([field({fontSize: 80})], 1)).toContain('حجم خط');
  });

  it('caps the number of fields', () => {
    const many = Array.from({length: MAX_FIELDS + 1}, (_, index) =>
      field({key: `field_${index + 1}`}),
    );
    expect(validateFields(many, 1)).toContain('يتجاوز الحد');
  });
});

describe('designer helpers', () => {
  it('generates the first free field key', () => {
    expect(nextFieldKey([])).toBe('field_1');
    expect(nextFieldKey([{key: 'field_1'}, {key: 'field_2'}])).toBe('field_3');
    expect(nextFieldKey([{key: 'employee_name'}])).toBe('field_1');
  });

  it('rounds to two decimals and clamps', () => {
    expect(round2(12.3456)).toBe(12.35);
    expect(round2(10)).toBe(10);
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(42, 0, 100)).toBe(42);
  });
});
