/**
 * SMD - Suez Methanol Derivatives Co.
 * Employees Directory & Management with Full Schema Fields
 */

import React, { useState } from 'react';
import { 
  Employee, 
  SMD_DEPARTMENTS, 
  ContractType, 
  JobGrade, 
  WorkLocation, 
  ShiftType,
  UserSession 
} from '../types';
import { 
  Search, 
  Plus, 
  Download, 
  Filter, 
  UserPlus, 
  Building2, 
  IdCard, 
  Eye, 
  Edit3, 
  Trash2,
  FileSpreadsheet,
  Camera,
  Upload,
  CheckCircle2
} from 'lucide-react';
import { exportEmployeesToExcel, parseExcelFile } from '../utils/fileExport';
import { PhotoImportModal } from './PhotoImportModal';

interface EmployeeDirectoryProps {
  employees: Employee[];
  user: UserSession;
  onAddEmployee: (emp: Omit<Employee, 'serial'>) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onDeleteEmployee: (employeeId: string) => void;
  onSelectEmployee: (employeeId: string) => void;
}

export const EmployeeDirectory: React.FC<EmployeeDirectoryProps> = ({
  employees,
  user,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onSelectEmployee
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Employee Form State
  const [formData, setFormData] = useState({
    employeeId: '',
    name: '',
    mobile: '',
    email: '',
    currentTitle: '',
    position: '',
    assignedTitle: '',
    department: SMD_DEPARTMENTS[3] as string, // default العمليات
    contractType: 'دائم' as ContractType,
    grade: 'أولى' as JobGrade,
    workLocation: 'مصنع السويس لمشتقات الميثانول' as WorkLocation,
    nationalId: '',
    insuranceId: '',
    hourlyRate: 90,
    hireDate: new Date().toISOString().split('T')[0],
    defaultShift: 'NORMAL_DAY' as ShiftType,
    isActive: true
  });

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      emp.name.includes(searchTerm) ||
      emp.employeeId.includes(searchTerm) ||
      emp.nationalId.includes(searchTerm) ||
      emp.mobile.includes(searchTerm) ||
      emp.currentTitle.includes(searchTerm);
    const matchesDept = selectedDept === 'ALL' || emp.department === selectedDept;
    return matchesSearch && matchesDept;
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.employeeId || !formData.nationalId) {
      alert('يرجى تعبئة الحقول الأساسية: كود الموظف، الاسم، والرقم القومي.');
      return;
    }
    onAddEmployee(formData);
    setShowAddModal(false);
    // Reset form
    setFormData({
      employeeId: '',
      name: '',
      mobile: '',
      email: '',
      currentTitle: '',
      position: '',
      assignedTitle: '',
      department: SMD_DEPARTMENTS[3] as string,
      contractType: 'دائم',
      grade: 'أولى',
      workLocation: 'مصنع السويس لمشتقات الميثانول',
      nationalId: '',
      insuranceId: '',
      hourlyRate: 90,
      hireDate: new Date().toISOString().split('T')[0],
      defaultShift: 'NORMAL_DAY',
      isActive: true
    });
  };

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const excelInputRef = React.useRef<HTMLInputElement | null>(null);

  const handlePhotoImport = (rows: any[]) => {
    rows.forEach(r => {
      onAddEmployee({
        employeeId: r.employeeId || `10${Math.floor(10 + Math.random() * 89)}`,
        name: r.name || 'موظف مستورد',
        mobile: r.mobile || '01000000000',
        email: r.email || '',
        currentTitle: r.currentTitle || 'فني تشغيل',
        position: r.position || r.currentTitle || 'فني',
        assignedTitle: r.assignedTitle || '',
        department: r.department || SMD_DEPARTMENTS[3],
        contractType: (r.contractType as ContractType) || 'دائم',
        grade: (r.grade as JobGrade) || 'ثانية',
        workLocation: (r.workLocation as WorkLocation) || 'مصنع السويس لمشتقات الميثانول',
        nationalId: r.nationalId || '29000000000000',
        insuranceId: r.insuranceId || '00000000',
        hourlyRate: Number(r.hourlyRate) || 85,
        hireDate: r.hireDate || new Date().toISOString().split('T')[0],
        defaultShift: (r.defaultShift as ShiftType) || 'NORMAL_DAY',
        isActive: true
      });
    });
    setImportSuccessMsg(`تم استيراد ${rows.length} موظف بنجاح من المستند المصور!`);
    setTimeout(() => setImportSuccessMsg(null), 3500);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        alert('الملف فارغ أو لا يحتوي على بيانات صالحة.');
        return;
      }
      let addedCount = 0;
      rows.forEach((r: any) => {
        const name = r['الاسم بالكامل'] || r['الاسم'] || r['Name'] || r['name'];
        const empId = String(r['كود الموظف'] || r['الكود'] || r['ID'] || r['id'] || `10${Math.floor(10 + Math.random() * 89)}`);
        if (name) {
          onAddEmployee({
            employeeId: empId,
            name: String(name),
            mobile: String(r['رقم المحمول'] || r['المحمول'] || r['Mobile'] || '01000000000'),
            email: String(r['البريد الإلكتروني'] || r['Email'] || ''),
            currentTitle: String(r['المسمى الوظيفي'] || r['المسمى'] || r['Title'] || 'موظف'),
            position: String(r['الوظيفة'] || r['Position'] || 'موظف'),
            assignedTitle: String(r['المسمى المكلف به'] || ''),
            department: String(r['الإدارة / القطاع'] || r['القطاع'] || r['Department'] || SMD_DEPARTMENTS[3]),
            contractType: (r['نوع العقد'] as ContractType) || 'دائم',
            grade: (r['الدرجة الوظيفية'] as JobGrade) || 'أولى',
            workLocation: (r['موقع العمل'] as WorkLocation) || 'مصنع السويس لمشتقات الميثانول',
            nationalId: String(r['الرقم القومي'] || '29000000000000'),
            insuranceId: String(r['الرقم التأميني'] || '00000000'),
            hourlyRate: Number(r['أجر الساعة (ج.م)'] || r['أجر الساعة'] || 85),
            hireDate: String(r['تاريخ التعيين'] || new Date().toISOString().split('T')[0]),
            defaultShift: 'NORMAL_DAY',
            isActive: true
          });
          addedCount++;
        }
      });
      setImportSuccessMsg(`تم استيراد ${addedCount} موظف بنجاح من ملف Excel!`);
      setTimeout(() => setImportSuccessMsg(null), 3500);
    } catch (err: any) {
      alert('حدث خطأ أثناء قراءة ملف Excel: ' + (err.message || ''));
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Hidden Excel File Input */}
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={handleExcelUpload}
      />

      {/* Header with Search and Actions */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            سجل وبيانات العاملين بشركة SMD
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            قاعدة بيانات الموظفين، القطاعات الـ 17، الأرقام القومية والتأمينية، وأكواد البصمة ZKTeco
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          
          {/* CAMERA / PHOTO IMPORT BUTTON */}
          <button
            onClick={() => setShowPhotoModal(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="التقاط صورة كشف العاملين أو البطاقة واستخراج البيانات آلياً"
          >
            <Camera className="w-4 h-4 text-cyan-200" />
            <span>استيراد بالتصوير (كاميرا)</span>
          </button>

          {/* EXCEL IMPORT BUTTON */}
          <button
            onClick={() => excelInputRef.current?.click()}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            title="استيراد موظفين من ملف Excel أو CSV"
          >
            <Upload className="w-4 h-4 text-slate-600" />
            <span>استيراد Excel</span>
          </button>

          {/* EXCEL EXPORT BUTTON */}
          <button
            onClick={() => exportEmployeesToExcel(employees)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="تصدير كشف العاملين بالكامل إلى ملف Excel"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>تصدير Excel</span>
          </button>

          {/* ADD EMPLOYEE BUTTON (AVAILABLE FOR USER) */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة موظف جديد</span>
          </button>
        </div>
      </div>

      {importSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{importSuccessMsg}</span>
        </div>
      )}

      {/* Photo Import Modal */}
      {showPhotoModal && (
        <PhotoImportModal
          domain="employees"
          title="استيراد بيانات العاملين عن طريق التصوير (كاميرا / مستند مصور)"
          description="قم بتصوير كشف الأسماء الورقي أو استمارة الموظف، وسيقوم النظام بمسحها ضوئياً واستخراج البيانات تلقائياً."
          onClose={() => setShowPhotoModal(false)}
          onImportData={handlePhotoImport}
        />
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="البحث بالاسم، كود الموظف، الرقم القومي، المسمى الوظيفي..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-right"
          />
        </div>

        <div className="w-full md:w-80">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-right"
          >
            <option value="ALL">جميع القطاعات والإدارات ({SMD_DEPARTMENTS.length})</option>
            {SMD_DEPARTMENTS.map((dept, idx) => (
              <option key={idx} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 text-center">م</th>
                <th className="py-3 px-3">كود الموظف</th>
                <th className="py-3 px-4">الاسم بالكامل</th>
                <th className="py-3 px-4">المسمى الحالي / المكلف به</th>
                <th className="py-3 px-4">الإدارة / القطاع</th>
                <th className="py-3 px-3">نوع العقد والدرجة</th>
                <th className="py-3 px-3">موقع العمل</th>
                <th className="py-3 px-3 font-mono">الرقم القومي</th>
                <th className="py-3 px-3 font-mono">الرقم التأميني</th>
                <th className="py-3 px-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                    لم يتم العثور على موظفين مطابقين لشروط البحث.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.employeeId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 text-center font-mono text-slate-400">
                      {emp.serial}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-blue-700">
                      {emp.employeeId}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 hover:text-blue-700 cursor-pointer" onClick={() => onSelectEmployee(emp.employeeId)}>
                        {emp.name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono" dir="ltr">
                        {emp.mobile} · {emp.email || ''}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{emp.currentTitle}</div>
                      {emp.assignedTitle && (
                        <div className="text-[10px] text-slate-500">
                          مكلف بـ: {emp.assignedTitle}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 max-w-xs truncate" title={emp.department}>
                      {emp.department}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-800">{emp.contractType}</span>
                      <span className="text-[10px] text-slate-500 block">{emp.grade}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {emp.workLocation.replace('مصنع السويس لمشتقات الميثانول', 'مصنع السويس')}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {emp.nationalId}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {emp.insuranceId}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => onSelectEmployee(emp.employeeId)}
                        className="p-1.5 text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        title="عرض الملف الكامل للموظف"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  إضافة موظف جديد لقاعدة بيانات SMD
                </h3>
                <p className="text-xs text-slate-500">
                  تسكين الموظف على القطاع والوردية وربطه بجهاز البصمة ZKTeco
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    كود الموظف (ZKTeco PIN) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    placeholder="مثال: 1011"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    الاسم بالكامل (رباعي) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                    placeholder="الاسم الرباعي كما في بطاقة الرقم القومي"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    الرقم القومي (14 رقم) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={14}
                    value={formData.nationalId}
                    onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    placeholder="290xxxxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    الرقم التأميني *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.insuranceId}
                    onChange={(e) => setFormData({ ...formData, insuranceId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    placeholder="48910452"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    رقم المحمول *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    placeholder="010xxxxxxxx"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    الإدارة / القطاع التابع له *
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    {SMD_DEPARTMENTS.map((dept, idx) => (
                      <option key={idx} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    المسمى الوظيفي الحالي *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.currentTitle}
                    onChange={(e) => setFormData({ ...formData, currentTitle: e.target.value, position: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                    placeholder="مثال: مهندس عمليات كيميائية"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    المسمى المكلف به (اختياري)
                  </label>
                  <input
                    type="text"
                    value={formData.assignedTitle}
                    onChange={(e) => setFormData({ ...formData, assignedTitle: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                    placeholder="المشرف على وحدة التقطير"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    نوع العقد
                  </label>
                  <select
                    value={formData.contractType}
                    onChange={(e) => setFormData({ ...formData, contractType: e.target.value as ContractType })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="دائم">دائم</option>
                    <option value="محدد المدة">محدد المدة</option>
                    <option value="مؤقت">مؤقت</option>
                    <option value="إعارة / انتداب">إعارة / انتداب</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    الدرجة الوظيفية
                  </label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value as JobGrade })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="مدير عام / قطاع">مدير عام / قطاع</option>
                    <option value="مدير إدارة">مدير إدارة</option>
                    <option value="رئيس قسم">رئيس قسم</option>
                    <option value="أولى">أولى</option>
                    <option value="ثانية">ثانية</option>
                    <option value="ثالثة">ثالثة</option>
                    <option value="فني / مهني">فني / مهني</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    الوردية المقررة
                  </label>
                  <select
                    value={formData.defaultShift}
                    onChange={(e) => setFormData({ ...formData, defaultShift: e.target.value as ShiftType })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="NORMAL_DAY">يوم عمل عادي (08:00 - 16:00)</option>
                    <option value="DAY_SHIFT">وردية نهارية (08:00 - 20:00)</option>
                    <option value="NIGHT_SHIFT">وردية ليلية (20:00 - 08:00)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    موقع العمل
                  </label>
                  <select
                    value={formData.workLocation}
                    onChange={(e) => setFormData({ ...formData, workLocation: e.target.value as WorkLocation })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="مصنع السويس لمشتقات الميثانول">مصنع السويس لمشتقات الميثانول</option>
                    <option value="المقر الإداري الرئيسي">المقر الإداري الرئيسي</option>
                    <option value="ميناء الإسكندرية">ميناء الإسكندرية</option>
                    <option value="موقع دمياط">موقع دمياط</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    أجر الساعة لحساب الإضافي (ج.م)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.hourlyRate}
                    onChange={(e) => setFormData({ ...formData, hourlyRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
                >
                  حفظ وتسجيل الموظف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
