/**
 * SMD - Suez Methanol Derivatives Co.
 * File Handling: Excel, Word, and PDF Export / Import Engine
 */

import * as XLSX from 'xlsx';
import { Employee, AttendanceRecord, LeaveBalance, LeaveRecord } from '../types';

export function exportToExcel(data: any[], filename: string, sheetName: string = 'Sheet1') {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportAttendanceToExcel(records: AttendanceRecord[], employees: Employee[]) {
  const empMap = new Map(employees.map(e => [e.employeeId, e]));

  const rows = records.map(r => {
    const emp = empMap.get(r.employeeId);
    return {
      'كود الموظف': r.employeeId,
      'الاسم': emp?.name || '',
      'الإدارة / القطاع': emp?.department || '',
      'التاريخ': r.date,
      'الوردية': r.shiftType === 'NORMAL_DAY' ? 'يوم عمل عادي' : r.shiftType === 'DAY_SHIFT' ? 'وردية نهارية' : 'وردية ليلية',
      'حضور': r.checkIn,
      'انصراف': r.checkOut,
      'ساعات العمل': r.workingHours,
      'إجمالي الإضافي (س)': r.overtimeHoursTotal,
      'إضافي نهاري (س - قبل 6م)': r.dayOvertimeHours,
      'إضافي ليلي (س - بعد 6م)': r.nightOvertimeHours,
      'قيمة الإضافي المستحق (ج.م)': r.totalOvertimePay,
      'الحالة': r.status,
      'المصدر': r.source,
      'ملاحظات': r.notes || ''
    };
  });

  exportToExcel(rows, `تقرير_حضور_وانصراف_SMD_${new Date().toISOString().split('T')[0]}`, 'سجل الحضور');
}

export function exportEmployeesToExcel(employees: Employee[]) {
  const rows = employees.map(e => ({
    'م': e.serial,
    'كود الموظف': e.employeeId,
    'الاسم بالكامل': e.name,
    'رقم المحمول': e.mobile,
    'البريد الإلكتروني': e.email,
    'المسمى الوظيفي': e.currentTitle,
    'الوظيفة': e.position,
    'المسمى المكلف به': e.assignedTitle || '',
    'الإدارة / القطاع': e.department,
    'نوع العقد': e.contractType,
    'الدرجة الوظيفية': e.grade,
    'موقع العمل': e.workLocation,
    'الرقم القومي': e.nationalId,
    'الرقم التأميني': e.insuranceId,
    'أجر الساعة (ج.م)': e.hourlyRate,
    'تاريخ التعيين': e.hireDate,
    'الحالة': e.isActive ? 'على رأس العمل' : 'متوقف'
  }));

  exportToExcel(rows, `دليل_العاملين_شركة_السويس_لمشتقات_الميثانول_${new Date().toISOString().split('T')[0]}`, 'العاملين');
}

export function exportLeaveBalancesToExcel(balances: LeaveBalance[], employees: Employee[]) {
  const empMap = new Map(employees.map(e => [e.employeeId, e]));

  const rows = balances.map(b => {
    const emp = empMap.get(b.employeeId);
    const remAnnual = Math.max(0, b.annualOpening - b.annualUsed);
    const remCasual = Math.max(0, b.casualOpening - b.casualUsed);
    const remSick = Math.max(0, b.sickOpening - b.sickUsed);

    return {
      'كود الموظف': b.employeeId,
      'اسم الموظف': emp?.name || '',
      'المسمى الوظيفي': emp?.currentTitle || '',
      'الإدارة / القطاع': emp?.department || '',
      'السنة': b.year,
      'رصيد اعتيادي افتتاحي': b.annualOpening,
      'مستهلك اعتيادي': b.annualUsed,
      'متبقي اعتيادي': remAnnual,
      'رصيد عارضة افتتاحي': b.casualOpening,
      'مستهلك عارضة': b.casualUsed,
      'متبقي عارضة': remCasual,
      'رصيد مرضي (دورة 3 سنوات)': b.sickOpening,
      'مستهلك مرضي': b.sickUsed,
      'متبقي مرضي': remSick,
      'بداية دورة المرضي': b.sickCycleStartYear
    };
  });

  exportToExcel(rows, `ارصدة_الاجازات_SMD_${new Date().getFullYear()}`, 'أرصدة الإجازات');
}

export function exportPermitsToExcel(permits: any[], employees: Employee[]) {
  const empMap = new Map(employees.map(e => [e.employeeId, e]));
  const rows = permits.map(p => {
    const emp = empMap.get(p.employeeId);
    return {
      'رقم الإذن': p.id,
      'كود الموظف': p.employeeId,
      'اسم الموظف': emp?.name || '',
      'الإدارة / القطاع': emp?.department || '',
      'نوع الإذن': p.permitType,
      'التاريخ': p.date,
      'من الساعة': p.startTime,
      'إلى الساعة': p.endTime,
      'المدة (ساعات)': p.durationHours,
      'السبب': p.reason,
      'المعتمد': p.approvedBy || '',
      'الحالة': p.status
    };
  });
  exportToExcel(rows, `سجل_الاذونات_والتصاريح_SMD_${new Date().toISOString().split('T')[0]}`, 'الأذونات');
}

export function exportMissionsToExcel(missions: any[], employees: Employee[]) {
  const empMap = new Map(employees.map(e => [e.employeeId, e]));
  const rows = missions.map(m => {
    const emp = empMap.get(m.employeeId);
    return {
      'رقم التكليف': m.id,
      'كود الموظف': m.employeeId,
      'اسم الموظف': emp?.name || '',
      'الإدارة / القطاع': emp?.department || '',
      'نوع المأمورية': m.missionType,
      'الجهة والموقع': m.destination,
      'الغرض من التكليف': m.purpose,
      'تاريخ البدء': m.startDate,
      'تاريخ العودة': m.endDate,
      'عدد الأيام': m.daysCount,
      'البدل اليومي': m.allowancePerDay || 0,
      'إجمالي البدل (ج.م)': m.totalAllowance || 0,
      'وسيلة الانتقال': m.transportationType,
      'المعتمد': m.approvedBy || '',
      'الحالة': m.status
    };
  });
  exportToExcel(rows, `سجل_الماموريات_وبدلات_السفر_SMD_${new Date().toISOString().split('T')[0]}`, 'المأموريات');
}

export function exportAllSheetsToExcel(data: {
  employees: Employee[];
  attendance: AttendanceRecord[];
  balances: LeaveBalance[];
  leaves: LeaveRecord[];
  permits: any[];
  missions: any[];
}) {
  const workbook = XLSX.utils.book_new();
  const empMap = new Map(data.employees.map(e => [e.employeeId, e]));

  // Employees sheet
  const empRows = data.employees.map(e => ({
    'م': e.serial,
    'كود الموظف': e.employeeId,
    'الاسم بالكامل': e.name,
    'رقم المحمول': e.mobile,
    'البريد الإلكتروني': e.email,
    'المسمى الوظيفي': e.currentTitle,
    'الوظيفة': e.position,
    'المسمى المكلف به': e.assignedTitle || '',
    'الإدارة / القطاع': e.department,
    'نوع العقد': e.contractType,
    'الدرجة الوظيفية': e.grade,
    'موقع العمل': e.workLocation,
    'الرقم القومي': e.nationalId,
    'الرقم التأميني': e.insuranceId,
    'أجر الساعة (ج.م)': e.hourlyRate,
    'تاريخ التعيين': e.hireDate,
    'الحالة': e.isActive ? 'على رأس العمل' : 'متوقف'
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(empRows), 'دليل العاملين');

  // Attendance sheet
  const attRows = data.attendance.map(r => {
    const emp = empMap.get(r.employeeId);
    return {
      'كود الموظف': r.employeeId,
      'الاسم': emp?.name || '',
      'الإدارة / القطاع': emp?.department || '',
      'التاريخ': r.date,
      'الوردية': r.shiftType,
      'حضور': r.checkIn,
      'انصراف': r.checkOut,
      'ساعات العمل': r.workingHours,
      'إجمالي الإضافي (س)': r.overtimeHoursTotal,
      'إضافي نهاري (س - قبل 6م)': r.dayOvertimeHours,
      'إضافي ليلي (س - بعد 6م)': r.nightOvertimeHours,
      'قيمة الإضافي المستحق (ج.م)': r.totalOvertimePay,
      'الحالة': r.status,
      'المصدر': r.source,
      'ملاحظات': r.notes || ''
    };
  });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(attRows), 'الحضور والانصراف');

  // Leave Balances
  const balRows = data.balances.map(b => {
    const emp = empMap.get(b.employeeId);
    return {
      'كود الموظف': b.employeeId,
      'اسم الموظف': emp?.name || '',
      'الإدارة': emp?.department || '',
      'اعتيادي متبقي': Math.max(0, b.annualOpening - b.annualUsed),
      'عارضة متبقي': Math.max(0, b.casualOpening - b.casualUsed),
      'مرضي متبقي': Math.max(0, b.sickOpening - b.sickUsed)
    };
  });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(balRows), 'أرصدة الإجازات');

  // Permits
  const pRows = data.permits.map(p => {
    const emp = empMap.get(p.employeeId);
    return {
      'رقم الإذن': p.id,
      'كود الموظف': p.employeeId,
      'اسم الموظف': emp?.name || '',
      'نوع الإذن': p.permitType,
      'التاريخ': p.date,
      'الفترة': `${p.startTime} - ${p.endTime}`,
      'المدة (س)': p.durationHours,
      'السبب': p.reason,
      'الحالة': p.status
    };
  });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pRows), 'الأذونات والتصاريح');

  // Missions
  const mRows = data.missions.map(m => {
    const emp = empMap.get(m.employeeId);
    return {
      'رقم التكليف': m.id,
      'كود الموظف': m.employeeId,
      'اسم الموظف': emp?.name || '',
      'نوع المأمورية': m.missionType,
      'الجهة': m.destination,
      'الغرض': m.purpose,
      'الأيام': m.daysCount,
      'إجمالي البدل': m.totalAllowance || 0,
      'الحالة': m.status
    };
  });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mRows), 'المأموريات الرسمية');

  XLSX.writeFile(workbook, `قاعدة_بيانات_شاملة_SMD_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Generates an official Microsoft Word (.doc) document
 * with SMD corporate styling, Arabic RTL formatting, and tables.
 */
export function exportToWordDocument(title: string, htmlContent: string, filename: string) {
  const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
      <style>
        body {
          font-family: 'Cairo', 'Arial', sans-serif;
          direction: rtl;
          text-align: right;
          padding: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
          margin-bottom: 15px;
        }
        th, td {
          border: 1px solid #333;
          padding: 8px 12px;
          font-size: 13px;
        }
        th {
          background-color: #f1f5f9;
          font-weight: bold;
        }
        .header-box {
          border-bottom: 2px solid #0284c7;
          padding-bottom: 10px;
          margin-bottom: 20px;
        }
        .title {
          font-size: 20px;
          color: #0369a1;
          font-weight: bold;
        }
        .signatures {
          margin-top: 40px;
          width: 100%;
        }
      </style>
    </head>
    <body>
      <div class="header-box">
        <h2 style="margin: 0; color: #0f172a;">شركة السويس لمشتقات الميثانول (ش.م.م) - SMD</h2>
        <h4 style="margin: 4px 0; color: #0284c7;">الإدارة العامة للموارد البشرية</h4>
        <p style="margin: 2px 0; font-size: 11px; color: #64748b;">سجل تجاري 14890 - السويس - مصر | نظام الحضور والانصراف الإلكتروني</p>
      </div>
      ${htmlContent}
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', header], {
    type: 'application/msword'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parses an uploaded Excel (.xlsx, .xls) or CSV file into a JSON array of rows.
 */
export async function parseExcelFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

