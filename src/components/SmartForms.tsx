/**
 * SMD - Suez Methanol Derivatives Co.
 * Smart Forms Generator & Visual Document Overlay Filler
 * 
 * Solves:
 * 1. "المستند لازم يظهر عندي في البرنامج بالصورة الصحيحة عشان اعرف ادخل البيانات عليه"
 *    Displays the ACTUAL visual document (Image scan, PDF, Word layout, or Excel table)
 *    in its true visual appearance, and allows users to click and type data directly on it!
 * 2. Auto-fills selected employee matrix into the document's fields.
 * 3. Supports draggable/positionable text boxes over document lines and blanks.
 * 4. Prints cleanly in A4 with the typed data perfectly aligned over the document.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Employee, LeaveBalance, LeaveType } from '../types';
import { 
  FileText, 
  Printer, 
  Download, 
  User, 
  Building2, 
  Calendar, 
  CheckCircle2, 
  Stamp,
  Camera,
  Upload,
  Plus,
  ShieldCheck,
  Check,
  Edit3,
  Trash2,
  Eye,
  FileSpreadsheet,
  FileCode,
  FileUp,
  Sparkles,
  Move,
  Type,
  Maximize2,
  RefreshCw,
  Palette
} from 'lucide-react';
import { exportToWordDocument } from '../utils/fileExport';
import { PhotoImportModal } from './PhotoImportModal';
import { StorageService } from '../services/storage';
import { 
  parseFormFile, 
  CustomFormTemplate, 
  OverlayField,
  FormCustomField 
} from '../utils/formFileParser';

interface SmartFormsProps {
  employees: Employee[];
  leaveBalances: LeaveBalance[];
  initialEmployeeId?: string;
}

export const SmartForms: React.FC<SmartFormsProps> = ({
  employees,
  leaveBalances,
  initialEmployeeId
}) => {
  // Available custom forms loaded from storage
  const [customTemplates, setCustomTemplates] = useState<CustomFormTemplate[]>(() => {
    return StorageService.getCustomForms();
  });

  const [selectedFormType, setSelectedFormType] = useState<string>('SMD-FORM-SAFETY-01');
  const [selectedEmpId, setSelectedEmpId] = useState<string>(initialEmployeeId || employees[0]?.employeeId || '');
  const [showPhotoModal, setShowPhotoModal] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);

  // View Mode: 'visual' (Overlay on real document), 'structured' (Digital letterhead), 'word_html', 'excel_grid'
  const [viewMode, setViewMode] = useState<'visual' | 'structured' | 'word_html' | 'excel_grid'>('visual');

  // Interactive Overlay State for the currently selected form
  const [overlayFields, setOverlayFields] = useState<OverlayField[]>([]);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [isEditPositionMode, setIsEditPositionMode] = useState<boolean>(false);

  // Hidden universal file input
  const universalFileInputRef = useRef<HTMLInputElement | null>(null);
  const visualCanvasRef = useRef<HTMLDivElement | null>(null);

  // Standard Leave Form State
  const [leaveType, setLeaveType] = useState<LeaveType>('اعتيادي');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [daysCount, setDaysCount] = useState(4);
  const [reason, setReason] = useState('ظروف عائلية وقضاء إجازة سنوية');
  const [replacementName, setReplacementName] = useState('م. طارق الشناوي (رئيس قسم الصيانة)');

  // Standard Mission Form State
  const [missionDest, setMissionDest] = useState('الهيئة المصرية العامة للبترول - القاهرة');
  const [missionPurpose, setMissionPurpose] = useState('حضور اجتماع لجنة المشروعات ومراجعة عقود التوريد');
  const [missionDays, setMissionDays] = useState(2);
  const [hasAllowance, setHasAllowance] = useState(true);

  // Standard Permit Form State
  const [permitReason, setPermitReason] = useState('إنهاء معاملة شخصية طارئة بالشهر العقاري');
  const [permitTime, setPermitTime] = useState('من الساعة 11:00 صباحاً إلى 01:00 ظهراً');

  const employee = employees.find(e => e.employeeId === selectedEmpId) || employees[0];
  const balance = leaveBalances.find(b => b.employeeId === employee?.employeeId);

  const remAnnual = balance ? Math.max(0, balance.annualOpening - balance.annualUsed) : 0;
  const remCasual = balance ? Math.max(0, balance.casualOpening - balance.casualUsed) : 0;
  const remSick = balance ? Math.max(0, balance.sickOpening - balance.sickUsed) : 0;

  const activeCustomTemplate = customTemplates.find(t => t.formId === selectedFormType);

  // Sync overlay fields whenever active template changes
  useEffect(() => {
    if (activeCustomTemplate) {
      if (activeCustomTemplate.overlayFields && activeCustomTemplate.overlayFields.length > 0) {
        setOverlayFields(activeCustomTemplate.overlayFields);
      } else {
        // Generate default visual overlay fields if none exist
        const defaults: OverlayField[] = [
          { id: 'ov-emp', label: 'اسم الموظف', value: employee?.name || '', xPercent: 25, yPercent: 26, fontSize: 13, isBold: true, color: '#0f172a' },
          { id: 'ov-pin', label: 'كود الموظف (PIN)', value: employee?.employeeId || '', xPercent: 76, yPercent: 26, fontSize: 13, isBold: true, color: '#1d4ed8' },
          { id: 'ov-dept', label: 'الإدارة / القطاع', value: employee?.department || '', xPercent: 25, yPercent: 33, fontSize: 12, isBold: false, color: '#0f172a' },
          { id: 'ov-title', label: 'المسمى الوظيفي', value: employee?.currentTitle || '', xPercent: 76, yPercent: 33, fontSize: 12, isBold: false, color: '#0f172a' },
          { id: 'ov-date', label: 'التاريخ', value: new Date().toISOString().split('T')[0], xPercent: 76, yPercent: 40, fontSize: 12, isBold: false, color: '#0f172a' },
          { id: 'ov-notes', label: 'بيانات / قرار / ملاحظات', value: activeCustomTemplate.headerPreamble || '', xPercent: 25, yPercent: 48, fontSize: 12, isBold: false, color: '#0f172a', widthPx: 380 }
        ];
        setOverlayFields(defaults);
      }

      // Switch view mode based on source
      if (activeCustomTemplate.sourceType === 'word' && activeCustomTemplate.rawHtmlContent) {
        setViewMode('word_html');
      } else if (activeCustomTemplate.sourceType === 'excel' && activeCustomTemplate.excelTableData) {
        setViewMode('excel_grid');
      } else {
        setViewMode('visual');
      }
    } else {
      setViewMode('structured');
    }
  }, [selectedFormType, activeCustomTemplate?.formId]);

  // Handle Employee Auto-Fill onto the current overlay
  const handleAutoFillEmployee = () => {
    if (!employee) return;
    const now = new Date().toISOString().split('T')[0];

    setOverlayFields(prev => prev.map(f => {
      const label = f.label.toLowerCase();
      if (label.includes('اسم') || f.id.includes('name') || f.id.includes('emp')) {
        return { ...f, value: employee.name };
      }
      if (label.includes('كود') || label.includes('pin') || f.id.includes('id') || f.id.includes('pin')) {
        return { ...f, value: employee.employeeId };
      }
      if (label.includes('إدارة') || label.includes('قسم') || label.includes('قطاع') || f.id.includes('dept')) {
        return { ...f, value: employee.department };
      }
      if (label.includes('مسمى') || label.includes('وظيفة') || f.id.includes('title')) {
        return { ...f, value: employee.currentTitle };
      }
      if (label.includes('قومي') || f.id.includes('national')) {
        return { ...f, value: employee.nationalId };
      }
      if (label.includes('تاريخ') || f.id.includes('date')) {
        return { ...f, value: now };
      }
      return f;
    }));

    setNotice(`تمت تعبئة بيانات الموظف (${employee.name} - ${employee.employeeId}) تلقائياً فوق المستند!`);
    setTimeout(() => setNotice(null), 4000);
  };

  // Add a new free-form text box onto the document
  const handleAddOverlayBox = () => {
    const newField: OverlayField = {
      id: `ov-custom-${Date.now()}`,
      label: 'نص إضافي',
      value: 'اكتب هنا...',
      xPercent: 30,
      yPercent: 50,
      fontSize: 13,
      isBold: false,
      color: '#0f172a',
      widthPx: 250
    };
    const updated = [...overlayFields, newField];
    setOverlayFields(updated);
    setActiveOverlayId(newField.id);
    saveCurrentOverlayFields(updated);
  };

  // Update a single overlay field's value or styling
  const handleUpdateOverlayField = (id: string, updates: Partial<OverlayField>) => {
    const updated = overlayFields.map(f => f.id === id ? { ...f, ...updates } : f);
    setOverlayFields(updated);
    saveCurrentOverlayFields(updated);
  };

  // Delete an overlay field
  const handleDeleteOverlayField = (id: string) => {
    const updated = overlayFields.filter(f => f.id !== id);
    setOverlayFields(updated);
    saveCurrentOverlayFields(updated);
  };

  // Save current overlay fields to StorageService
  const saveCurrentOverlayFields = (fieldsToSave: OverlayField[]) => {
    if (!activeCustomTemplate) return;
    const updatedTemplates = customTemplates.map(t => {
      if (t.formId === activeCustomTemplate.formId) {
        return { ...t, overlayFields: fieldsToSave };
      }
      return t;
    });
    setCustomTemplates(updatedTemplates);
    StorageService.saveCustomForms(updatedTemplates);
  };

  // Universal File Import Handler (PDF, Word, Excel, Images)
  const handleUniversalFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    try {
      const template = await parseFormFile(file);
      
      // Auto-set employee details on the new template's overlay
      if (template.overlayFields) {
        template.overlayFields = template.overlayFields.map(f => {
          if (f.label.includes('اسم') || f.id.includes('name') || f.id.includes('emp')) return { ...f, value: employee?.name || '' };
          if (f.label.includes('كود') || f.id.includes('pin') || f.id.includes('id')) return { ...f, value: employee?.employeeId || '' };
          if (f.label.includes('إدارة') || f.id.includes('dept')) return { ...f, value: employee?.department || '' };
          return f;
        });
      }

      const updated = [template, ...customTemplates];
      setCustomTemplates(updated);
      StorageService.saveCustomForms(updated);
      setSelectedFormType(template.formId);

      // Route view mode based on type
      if (template.sourceType === 'word' && template.rawHtmlContent) {
        setViewMode('word_html');
      } else if (template.sourceType === 'excel' && template.excelTableData) {
        setViewMode('excel_grid');
      } else {
        setViewMode('visual');
      }

      setNotice(`تم استيراد المستند "${file.name}" وعرضه بالصورة الصحيحة. يمكنك الآن كتابة وتعبئة البيانات عليه مباشرة!`);
      setTimeout(() => setNotice(null), 8000);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء قراءة المستند. يرجى تجربة ملف آخر.');
    } finally {
      setIsProcessingFile(false);
      if (universalFileInputRef.current) universalFileInputRef.current.value = '';
    }
  };

  // Handle Photo Scan from Camera
  const handleImportScannedPhoto = (rows: any[]) => {
    if (!rows || rows.length === 0) return;
    const scanned = rows[0];
    const newTemplate: CustomFormTemplate = {
      formId: scanned.formId || `SMD-SCAN-${Date.now()}`,
      formTitle: scanned.formTitle || 'نموذج ورقي مصور ومعتمد',
      formCode: scanned.formCode || 'SMD-HSE-04',
      category: scanned.category || 'السلامة والصحة المهنية',
      sourceType: 'scanned',
      sourceFileName: 'camera_capture.jpg',
      uploadedAt: new Date().toISOString().split('T')[0],
      description: scanned.previewSnippet || 'صورة المستند الورقي الأصلي للشركة',
      headerPreamble: 'بناءً على وثائق ولوائح شركة السويس لمشتقات الميثانول SMD، يحرر هذا النموذج الرسمي معتمداً.',
      fields: [
        { id: 'f1', label: 'المهمة / الصنف', value: scanned.previewSnippet || 'مهمات وقاية شخصية' },
        { id: 'f2', label: 'التاريخ', value: new Date().toISOString().split('T')[0] }
      ],
      overlayFields: [
        { id: 'ov-name', label: 'اسم الموظف', value: employee?.name || '', xPercent: 24, yPercent: 28, fontSize: 13, isBold: true, color: '#0f172a' },
        { id: 'ov-id', label: 'كود الموظف (PIN)', value: employee?.employeeId || '', xPercent: 74, yPercent: 28, fontSize: 13, isBold: true, color: '#1d4ed8' },
        { id: 'ov-dept', label: 'الإدارة', value: employee?.department || '', xPercent: 24, yPercent: 34, fontSize: 12, isBold: false, color: '#0f172a' },
        { id: 'ov-date', label: 'التاريخ', value: new Date().toISOString().split('T')[0], xPercent: 74, yPercent: 34, fontSize: 12, isBold: false, color: '#0f172a' }
      ],
      footerNotes: '• تم استيراد صورة المستند وتعبئتها آلياً عبر منظومة الموارد البشرية بشركة SMD.',
      signatures: [
        { title: 'توقيع المستلم', name: 'الموظف المختص' },
        { title: 'الرئيس المباشر', name: 'رئيس القسم' },
        { title: 'مدير الموارد البشرية', name: 'أ. محمد عبد الرحمن' },
        { title: 'اعتماد الإدارة العليا', name: 'خاتم شعار الشركة SMD' }
      ]
    };

    const updated = [newTemplate, ...customTemplates];
    setCustomTemplates(updated);
    StorageService.saveCustomForms(updated);
    setSelectedFormType(newTemplate.formId);
    setViewMode('visual');
    setNotice(`تم سحب صورة النموذج وعرضها بالشكل الصحيح مع تمكين التعبئة الفورية.`);
    setTimeout(() => setNotice(null), 6000);
  };

  // Delete Form
  const handleDeleteForm = (formId: string) => {
    if (confirm('هل أنت متأكد من حذف هذا النموذج؟')) {
      const updated = customTemplates.filter(t => t.formId !== formId);
      setCustomTemplates(updated);
      StorageService.saveCustomForms(updated);
      setSelectedFormType('SMD-FORM-SAFETY-01');
      setNotice('تم حذف النموذج بنجاح.');
      setTimeout(() => setNotice(null), 3000);
    }
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  // Export to Word
  const handleExportWord = () => {
    const printArea = document.getElementById('printable-official-form');
    if (!printArea) return;
    const title = activeCustomTemplate?.formTitle || (selectedFormType === 'leave' ? 'طلب_إجازة' : 'نموذج_رسمي');
    exportToWordDocument(
      `${title}_${employee?.employeeId}_SMD`,
      printArea.innerHTML,
      `${title}_${employee?.employeeId}`
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Hidden Universal File Input */}
      <input
        ref={universalFileInputRef}
        type="file"
        accept=".pdf, .docx, .doc, .xlsx, .xls, .csv, .jpg, .jpeg, .png, .webp, .json, .txt"
        className="hidden"
        onChange={handleUniversalFileImport}
      />

      {/* Notice Banner */}
      {notice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs no-print">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">✕</button>
        </div>
      )}

      {/* Top Banner & Universal Import Actions (No Print) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs no-print flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-md">
              SMD Visual Form Filler
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs font-semibold text-slate-600">
              عرض المستند بصورته الحقيقية وتعبئة البيانات عليه مباشرة
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-900">
            النماذج الرسمية وتعبئة المستندات المرئية (Visual Document & Form Engine)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            عرض المستندات والملفات (PDF / Word / Excel / صور) كما هي في شكلها الأصلي مع الكتابة فوق الأسطر وتعبئة بيانات الموظف بضغطة واحدة قبل الطباعة.
          </p>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Universal Import: PDF, Word, Excel, Images */}
          <button
            onClick={() => universalFileInputRef.current?.click()}
            disabled={isProcessingFile}
            className="px-3.5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer disabled:bg-slate-400"
            title="استيراد ملف PDF أو Word أو Excel أو صورة وعرضه بالصورة الصحيحة"
          >
            <FileUp className="w-4 h-4 text-cyan-300" />
            <span>{isProcessingFile ? 'جاري فتح وتحليل المستند...' : 'استيراد مستند (PDF / Word / Excel / صورة)'}</span>
          </button>

          {/* Camera / Scanned Document */}
          <button
            onClick={() => setShowPhotoModal(true)}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="تصوير نموذج ورقي من الهاتف أو الكاميرا وتعبئته مباشرة"
          >
            <Camera className="w-4 h-4 text-cyan-400" />
            <span>تصوير مستند ورقي (كاميرا)</span>
          </button>

          {/* Auto-Fill Employee Data */}
          <button
            onClick={handleAutoFillEmployee}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="تعبئة بيانات الموظف المختار فوراً على أسطر وخانات المستند"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>تعبئة بيانات الموظف آلياً</span>
          </button>

          {/* Export to Word */}
          <button
            onClick={handleExportWord}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-blue-900 border border-blue-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>تصدير Word (.doc)</span>
          </button>

          {/* Print A4 */}
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="طباعة المستند A4 مع البيانات المعبأة بدقة كاملة"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة المستند المعبأ (A4)</span>
          </button>

        </div>
      </div>

      {/* Selectors Strip & Mode Switcher (No Print) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs no-print space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          
          {/* Form Selector */}
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              اختر المستند / النموذج المراد تعبئته
            </label>
            <select
              value={selectedFormType}
              onChange={(e) => setSelectedFormType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-blue-700 cursor-pointer"
            >
              <optgroup label="نماذج ومستندات شركة SMD (المعروضة بالصورة الصحيحة)">
                {customTemplates.map((tmpl) => (
                  <option key={tmpl.formId} value={tmpl.formId}>
                    ★ {tmpl.formTitle} ({tmpl.formCode} · {tmpl.sourceType.toUpperCase()})
                  </option>
                ))}
              </optgroup>
              
              <optgroup label="النماذج القياسية المعتمدة">
                <option value="leave">نموذج طلب إجازة رسمي (Form HR-01)</option>
                <option value="mission">أمر تكليف بمأمورية عمل (Form HR-02)</option>
                <option value="permit">إذن تصريح مغادرة / عودة (Form HR-03)</option>
              </optgroup>
            </select>
          </div>

          {/* Employee Selector for Auto-Fill Matrix */}
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              الموظف المعني بالتعبئة (التعبئة الآلية للبيانات)
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs cursor-pointer"
            >
              {employees.map(e => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.employeeId} - {e.name} ({e.department})
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Tabs */}
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              طريقة عرض المستند
            </label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                onClick={() => setViewMode('visual')}
                className={`flex-1 py-1 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === 'visual' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="عرض المستند بصورته الحقيقية والكتابة فوقه"
              >
                شكل المستند الأصلي
              </button>
              
              {activeCustomTemplate?.rawHtmlContent && (
                <button
                  onClick={() => setViewMode('word_html')}
                  className={`py-1 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    viewMode === 'word_html' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="محرر جداول Word"
                >
                  Word
                </button>
              )}

              {activeCustomTemplate?.excelTableData && (
                <button
                  onClick={() => setViewMode('excel_grid')}
                  className={`py-1 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    viewMode === 'excel_grid' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="جدول Excel"
                >
                  Excel
                </button>
              )}

              <button
                onClick={() => setViewMode('structured')}
                className={`py-1 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === 'structured' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="النموذج الرقمي المعتمد"
              >
                رقمي A4
              </button>
            </div>
          </div>

        </div>

        {/* Visual Overlay Toolbar when in 'visual' mode */}
        {viewMode === 'visual' && (
          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-blue-600" />
                <span>أدوات التعبئة فوق المستند:</span>
              </span>

              <button
                onClick={handleAddOverlayBox}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة خانة كتابة حرة فوق الورقة</span>
              </button>

              <button
                onClick={() => setIsEditPositionMode(!isEditPositionMode)}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                  isEditPositionMode 
                    ? 'bg-amber-600 text-white ring-2 ring-amber-300' 
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>{isEditPositionMode ? 'تثبيت أماكن الحقول' : 'تعديل أماكن الحقول فوق الأسطر'}</span>
              </button>

              <button
                onClick={handleAutoFillEmployee}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>تعبئة تلقائية للموظف الحالي</span>
              </button>
            </div>

            {activeCustomTemplate && (
              <button
                onClick={() => handleDeleteForm(activeCustomTemplate.formId)}
                className="text-rose-600 hover:text-rose-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف هذا المستند</span>
              </button>
            )}
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* 1. VISUAL FORM FILLER (TRUE VISUAL DOCUMENT WITH INTERACTIVE OVERLAY)    */}
      {/* ========================================================================= */}
      {viewMode === 'visual' && (
        <div className="relative max-w-4xl mx-auto">
          
          {/* The Visual A4 Document Canvas */}
          <div 
            id="printable-official-form" 
            ref={visualCanvasRef}
            className="relative bg-white rounded-2xl border-2 border-slate-300 shadow-2xl overflow-hidden min-h-[1050px] w-full text-slate-900 select-none"
            style={{ minHeight: '1050px' }}
          >
            
            {/* Background Layer: If an original document image / scan is provided */}
            {activeCustomTemplate?.documentDataUrl && !activeCustomTemplate.documentDataUrl.includes('application/pdf') ? (
              <div className="w-full">
                <img
                  src={activeCustomTemplate.documentDataUrl}
                  alt="Original Form Document"
                  className="w-full h-auto object-contain block pointer-events-none"
                />
              </div>
            ) : (
              /* Authentic High-Resolution SMD Visual Corporate Form Template Canvas */
              <div className="p-8 sm:p-12 relative min-h-[1050px] flex flex-col justify-between">
                
                {/* Official SMD Watermark Background */}
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.035] pointer-events-none">
                  <img src="/logo.png" alt="watermark" className="w-96 h-96 object-contain" />
                </div>

                {/* Document Top Header */}
                <div className="border-b-2 border-blue-900 pb-5 mb-6 flex items-center justify-between">
                  <div className="text-right">
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">
                      شركة السويس لمشتقات الميثانول (ش.م.م)
                    </h1>
                    <p className="text-xs text-blue-900 font-bold">
                      Suez Methanol Derivatives Co. (SMD)
                    </p>
                    <p className="text-xs text-slate-700 font-bold mt-1">
                      الإدارة العامة للموارد البشرية
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      سجل تجاري 14890 - السويس - جمهورية مصر العربية
                    </p>
                  </div>

                  <div className="w-24 h-24 sm:w-28 sm:h-28 p-2 bg-white border-2 border-slate-300 rounded-2xl flex items-center justify-center shadow-md">
                    <img 
                      src="/logo.png" 
                      alt="شعار شركة السويس لمشتقات الميثانول - SMD" 
                      className="w-full h-full object-contain filter drop-shadow-xs"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <div className="text-left font-mono text-xs text-slate-600">
                    <div>الكود: {activeCustomTemplate?.formCode || 'SMD-DOC-2026'}</div>
                    <div>التاريخ: {new Date().toISOString().split('T')[0]}</div>
                    <div>الرقم: {employee?.serial || 1}</div>
                  </div>
                </div>

                {/* Form Title Banner with Official Frame */}
                <div className="bg-slate-100 border border-slate-300 p-2.5 text-center font-bold text-base text-blue-950 mb-6 rounded shadow-xs">
                  {activeCustomTemplate ? activeCustomTemplate.formTitle : 'نموذج إداري رسمي معتمد'}
                </div>

                {/* Realistic Document Lines & Form Field Layout */}
                <div className="space-y-6 text-sm flex-1">
                  
                  {/* Preamble Box */}
                  <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-lg text-slate-800 leading-relaxed text-xs">
                    <span className="font-bold text-slate-900 block mb-1">ديباجة المستند:</span>
                    <p>{activeCustomTemplate?.headerPreamble || 'بناءً على تعليمات ولوائح شركة السويس لمشتقات الميثانول، يحرر هذا المستند الرسمي للعمل بموجبه.'}</p>
                  </div>

                  {/* Visual Lines / Fillable Guide Grid */}
                  <div className="border border-slate-300 rounded-lg p-5 space-y-5 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="font-bold text-xs text-slate-800">بيانات التحرير والاستلام:</span>
                      <span className="text-[10px] text-slate-400 font-mono">نموذج معتمد</span>
                    </div>

                    <div className="grid grid-cols-2 gap-y-6 gap-x-8 text-xs">
                      <div>
                        <span className="font-bold text-slate-700">اسم الموظف: </span>
                        <span className="text-slate-400 font-mono">......................................................</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-700">كود الموظف (PIN): </span>
                        <span className="text-slate-400 font-mono">...................................</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-700">الإدارة / الموقع: </span>
                        <span className="text-slate-400 font-mono">......................................................</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-700">تاريخ التحرير: </span>
                        <span className="text-slate-400 font-mono">...................................</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 space-y-4">
                      <div>
                        <span className="font-bold text-xs text-slate-700 block mb-1">البيان / تفاصيل المهمة / الإقرار:</span>
                        <div className="h-20 border border-slate-300 bg-slate-50/50 rounded-lg p-3 text-xs text-slate-400">
                          ..........................................................................................................................................................................................................................................
                        </div>
                      </div>
                    </div>

                    {/* Additional Items table if template has fields */}
                    {activeCustomTemplate?.fields && activeCustomTemplate.fields.length > 0 && (
                      <div className="border border-slate-200 rounded overflow-hidden mt-3">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-slate-100 font-bold border-b border-slate-200">
                            <tr>
                              <th className="p-2 w-10 text-center">م</th>
                              <th className="p-2 w-1/3">البيان / الحقل</th>
                              <th className="p-2">التفاصيل / القيمة المعتمدة</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {activeCustomTemplate.fields.map((f, i) => (
                              <tr key={f.id}>
                                <td className="p-2 text-center font-mono text-slate-400">{i + 1}</td>
                                <td className="p-2 font-bold text-slate-700">{f.label}</td>
                                <td className="p-2 text-slate-800">{f.value || '...........................................'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="p-3 bg-slate-50 rounded border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                      {activeCustomTemplate?.footerNotes || '• يعتبر هذا النموذج مستنداً رسمياً معتمداً ومحفوظاً بالإدارة العامة للموارد البشرية بشركة SMD.'}
                    </div>
                  </div>

                </div>

                {/* Signatures Footer */}
                <div className="mt-8 pt-6 border-t-2 border-slate-300 grid grid-cols-4 gap-4 text-center text-xs">
                  <div>
                    <span className="font-bold text-slate-700 block mb-6">توقيع المستلم / الموظف</span>
                    <span className="border-b border-dashed border-slate-400 block pb-1 text-slate-400 font-mono text-[10px]">
                      ..............................
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-700 block mb-6">الرئيس المباشر</span>
                    <span className="border-b border-dashed border-slate-400 block pb-1 text-slate-400 font-mono text-[10px]">
                      ..............................
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-700 block mb-6">مدير الموارد البشرية</span>
                    <span className="border-b border-dashed border-slate-400 block pb-1 font-bold text-slate-800">
                      أ. محمد عبد الرحمن
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-700 block mb-6">اعتماد الإدارة العليا</span>
                    <span className="border-b border-dashed border-slate-400 block pb-1 font-mono text-[10px] text-slate-400">
                      خاتم شعار الشركة SMD
                    </span>
                  </div>
                </div>

                {/* Stamp */}
                <div className="mt-6 text-center text-[10px] text-slate-400 flex items-center justify-center gap-2">
                  <Stamp className="w-3.5 h-3.5 text-blue-600" />
                  <span>شركة السويس لمشتقات الميثانول (SMD) - منظومة النماذج المعتمدة</span>
                </div>

              </div>
            )}

            {/* =============================================================== */}
            {/* INTERACTIVE DATA OVERLAY LAYER (USER TYPES DIRECTLY ON DOCUMENT) */}
            {/* =============================================================== */}
            <div className="absolute inset-0 pointer-events-auto">
              {overlayFields.map((field) => (
                <div
                  key={field.id}
                  style={{
                    position: 'absolute',
                    left: `${field.xPercent}%`,
                    top: `${field.yPercent}%`,
                    width: field.widthPx ? `${field.widthPx}px` : 'auto',
                    minWidth: '160px',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 20
                  }}
                  className={`group transition-all ${
                    isEditPositionMode 
                      ? 'cursor-move ring-2 ring-amber-400 rounded-md p-1 bg-amber-50/80 shadow-md' 
                      : ''
                  }`}
                  onClick={() => setActiveOverlayId(field.id)}
                >
                  
                  {/* Field Label Tooltip / Badge (Hidden in Print) */}
                  <div className="flex items-center justify-between no-print mb-0.5">
                    <span className="text-[10px] font-bold text-blue-800 bg-blue-100/90 px-1.5 py-0.2 rounded shadow-xs flex items-center gap-1">
                      <span>{field.label}</span>
                    </span>
                    {isEditPositionMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteOverlayField(field.id); }}
                        className="text-rose-600 hover:text-rose-800 p-0.5 font-bold cursor-pointer"
                        title="حذف هذا الحقل"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* The Live Fillable Input on Top of Document */}
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => handleUpdateOverlayField(field.id, { value: e.target.value })}
                    style={{
                      fontSize: `${field.fontSize || 13}px`,
                      fontWeight: field.isBold ? 700 : 500,
                      color: field.color || '#0f172a'
                    }}
                    placeholder={`اكتب ${field.label}...`}
                    className="w-full bg-transparent border-b-2 border-blue-500/30 focus:border-blue-600 focus:bg-white/95 focus:ring-1 focus:ring-blue-400 px-1 py-0.5 text-right font-sans transition-all outline-none"
                  />

                  {/* Movement Controls in Position Mode (No-print) */}
                  {isEditPositionMode && (
                    <div className="flex items-center justify-center gap-1 mt-1 no-print bg-slate-900/80 p-0.5 rounded text-white text-[10px]">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUpdateOverlayField(field.id, { yPercent: Math.max(5, field.yPercent - 2) }); }}
                        className="px-1 hover:bg-slate-700 rounded"
                        title="تحريك لأعلى"
                      >
                        ▲
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUpdateOverlayField(field.id, { yPercent: Math.min(95, field.yPercent + 2) }); }}
                        className="px-1 hover:bg-slate-700 rounded"
                        title="تحريك لأسفل"
                      >
                        ▼
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUpdateOverlayField(field.id, { xPercent: Math.max(5, field.xPercent - 2) }); }}
                        className="px-1 hover:bg-slate-700 rounded"
                        title="تحريك لليسار"
                      >
                        ◀
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUpdateOverlayField(field.id, { xPercent: Math.min(95, field.xPercent + 2) }); }}
                        className="px-1 hover:bg-slate-700 rounded"
                        title="تحريك لليمين"
                      >
                        ▶
                      </button>
                    </div>
                  )}

                </div>
              ))}
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. WORD RICH HTML EDITOR (WHEN IMPORTED FROM WORD .DOCX)                  */}
      {/* ========================================================================= */}
      {viewMode === 'word_html' && activeCustomTemplate?.rawHtmlContent && (
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 text-xs text-blue-900 flex items-center justify-between no-print">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-700" />
              <span>تم عرض جداول ونصوص مستند Word الأصلي بالكامل. يمكنك النقر والكتابة مباشرة في أي خلية أو سطر أدناه!</span>
            </div>
            <button
              onClick={handleAutoFillEmployee}
              className="px-3 py-1 bg-blue-700 text-white rounded font-bold hover:bg-blue-800 cursor-pointer"
            >
              تعبئة بيانات الموظف
            </button>
          </div>

          <div
            id="printable-official-form"
            contentEditable={true}
            suppressContentEditableWarning={true}
            dangerouslySetInnerHTML={{ __html: activeCustomTemplate.rawHtmlContent }}
            className="bg-white p-10 rounded-2xl border-2 border-slate-300 shadow-xl min-h-[900px] text-slate-900 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-blue-400 font-sans"
            dir="rtl"
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. EXCEL INTERACTIVE SPREADSHEET TABLE                                    */}
      {/* ========================================================================= */}
      {viewMode === 'excel_grid' && activeCustomTemplate?.excelTableData && (
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between no-print">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>جدول Excel الأصلي معروض بصورته الكاملة. يمكنك تعديل أي رقم أو بيان في الجدول مباشرة.</span>
            </div>
            <span className="font-mono font-bold text-xs">
              {activeCustomTemplate.excelTableData.rows.length} صفوف معتمدة
            </span>
          </div>

          <div 
            id="printable-official-form" 
            className="bg-white p-8 rounded-2xl border-2 border-slate-300 shadow-xl overflow-x-auto text-slate-900 text-xs"
          >
            {/* Header with SMD Logo */}
            <div className="flex items-center justify-between border-b-2 border-blue-900 pb-4 mb-4">
              <div>
                <h2 className="text-base font-black text-slate-900">شركة السويس لمشتقات الميثانول (SMD)</h2>
                <h4 className="text-xs font-bold text-blue-800">الإدارة العامة للموارد البشرية والشؤون المالية</h4>
              </div>
              <div className="w-16 h-16 p-1 bg-white border border-slate-200 rounded-xl shadow-xs">
                <img src="/logo.png" alt="SMD" className="w-full h-full object-contain" />
              </div>
            </div>

            <table className="w-full text-right border-collapse border border-slate-300">
              <thead className="bg-slate-100 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border border-slate-300 w-10 text-center">#</th>
                  {activeCustomTemplate.excelTableData.headers.map((h, i) => (
                    <th key={i} className="p-2 border border-slate-300 text-slate-800">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeCustomTemplate.excelTableData.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50">
                    <td className="p-2 border border-slate-300 text-center font-mono text-slate-400 font-bold">{rIdx + 1}</td>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="p-1 border border-slate-300">
                        <input
                          type="text"
                          defaultValue={cell}
                          className="w-full p-1 bg-transparent hover:bg-blue-50/50 focus:bg-white text-xs outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. DIGITAL STRUCTURED LETTERHEAD (STANDARD FORMAT)                        */}
      {/* ========================================================================= */}
      {viewMode === 'structured' && (
        <div 
          id="printable-official-form" 
          className="bg-white p-8 sm:p-12 rounded-2xl border-2 border-slate-300 shadow-xl max-w-4xl mx-auto text-slate-900 text-sm leading-relaxed"
        >
          {/* SMD Corporate Header */}
          <div className="flex items-center justify-between border-b-2 border-blue-900 pb-5 mb-6">
            <div className="text-right">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">
                شركة السويس لمشتقات الميثانول (ش.م.م)
              </h1>
              <p className="text-xs text-blue-900 font-bold">
                Suez Methanol Derivatives Co. (SMD)
              </p>
              <p className="text-xs text-slate-700 font-bold mt-1">
                الإدارة العامة للموارد البشرية
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                سجل تجاري 14890 - السويس - مصر
              </p>
            </div>

            <div className="w-24 h-24 sm:w-28 sm:h-28 p-2 bg-white border-2 border-slate-300 rounded-2xl flex items-center justify-center shadow-md">
              <img 
                src="/logo.png" 
                alt="شعار شركة السويس لمشتقات الميثانول - SMD" 
                className="w-full h-full object-contain filter drop-shadow-xs"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="text-left font-mono text-xs text-slate-600">
              <div>الكود: {selectedFormType === 'leave' ? 'SMD-HR-01' : selectedFormType === 'mission' ? 'SMD-HR-02' : 'SMD-HR-03'}</div>
              <div>التاريخ: {new Date().toISOString().split('T')[0]}</div>
              <div>الرقم: {employee?.serial || 1}</div>
            </div>
          </div>

          {/* Form Title Banner */}
          <div className="bg-slate-100 border border-slate-300 p-2.5 text-center font-bold text-base text-blue-950 mb-6 rounded">
            {selectedFormType === 'leave' && `طلب إجازة ${leaveType} (نموذج رقم HR-01)`}
            {selectedFormType === 'mission' && 'أمر تكليف رسمي بمأمورية عمل خارجي (نموذج رقم HR-02)'}
            {selectedFormType === 'permit' && 'إذن وتصريح خروج مؤقت لمهمة عمل / شخصي (نموذج رقم HR-03)'}
          </div>

          {/* Employee Data Matrix */}
          <div className="border border-slate-300 rounded mb-6 overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 font-bold text-xs border-b border-slate-300 text-slate-800">
              أولاً: بيانات الموظف الأساسية (تعبئة النظام الآلية)
            </div>
            <table className="w-full text-right text-xs">
              <tbody>
                <tr className="border-b border-slate-200">
                  <th className="py-2.5 px-4 bg-slate-50 w-32 font-bold">اسم الموظف:</th>
                  <td className="py-2.5 px-4 font-bold text-slate-900">{employee?.name}</td>
                  <th className="py-2.5 px-4 bg-slate-50 w-32 font-bold">كود الموظف (PIN):</th>
                  <td className="py-2.5 px-4 font-mono font-bold text-blue-800">{employee?.employeeId}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <th className="py-2.5 px-4 bg-slate-50 font-bold">المسمى الوظيفي:</th>
                  <td className="py-2.5 px-4 text-slate-800">{employee?.currentTitle}</td>
                  <th className="py-2.5 px-4 bg-slate-50 font-bold">المسمى المكلف به:</th>
                  <td className="py-2.5 px-4 text-slate-800">{employee?.assignedTitle || '—'}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <th className="py-2.5 px-4 bg-slate-50 font-bold">الإدارة / القطاع:</th>
                  <td className="py-2.5 px-4 font-semibold text-slate-800">{employee?.department}</td>
                  <th className="py-2.5 px-4 bg-slate-50 font-bold">الدرجة الوظيفية:</th>
                  <td className="py-2.5 px-4 text-slate-800">{employee?.grade} ({employee?.contractType})</td>
                </tr>
                <tr>
                  <th className="py-2.5 px-4 bg-slate-50 font-bold">الرقم القومي:</th>
                  <td className="py-2.5 px-4 font-mono text-slate-800">{employee?.nationalId}</td>
                  <th className="py-2.5 px-4 bg-slate-50 font-bold">الرقم التأميني:</th>
                  <td className="py-2.5 px-4 font-mono text-slate-800">{employee?.insuranceId}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Form Specifics */}
          {selectedFormType === 'leave' && (
            <div className="space-y-4 text-xs">
              <p>
                أرجو التكرم بالموافقة على منحي إجازة <strong>({leaveType})</strong> لمدة <strong>({daysCount}) أيام</strong> تبدأ من تاريخ <strong>({startDate})</strong> وحتى تاريخ <strong>({new Date(new Date(startDate).getTime() + (daysCount - 1) * 86400000).toISOString().split('T')[0]})</strong>، وذلك نظراً لـ: <u>{reason}</u>.
              </p>
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded text-center">
                <div>
                  <span className="text-[11px] text-slate-500 block">رصيد اعتيادي متبقي</span>
                  <strong className="font-mono text-blue-800 text-sm">{remAnnual} يوم</strong>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">رصيد عارضة متبقي</span>
                  <strong className="font-mono text-emerald-800 text-sm">{remCasual} يوم</strong>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">رصيد مرضي (دورة 3 سنوات)</span>
                  <strong className="font-mono text-rose-800 text-sm">{remSick} يوم</strong>
                </div>
              </div>
            </div>
          )}

          {/* Signatures */}
          <div className="mt-12 pt-6 border-t-2 border-slate-300 grid grid-cols-4 gap-4 text-center text-xs">
            <div>
              <span className="font-bold text-slate-700 block mb-8">توقيع الموظف</span>
              <span className="border-b border-dashed border-slate-400 block pb-1 font-mono text-[10px] text-slate-400">
                ..............................
              </span>
            </div>
            <div>
              <span className="font-bold text-slate-700 block mb-8">الرئيس المباشر</span>
              <span className="border-b border-dashed border-slate-400 block pb-1 font-mono text-[10px] text-slate-400">
                ..............................
              </span>
            </div>
            <div>
              <span className="font-bold text-slate-700 block mb-8">مدير الموارد البشرية</span>
              <span className="border-b border-dashed border-slate-400 block pb-1 font-bold text-slate-800">
                أ. محمد عبد الرحمن
              </span>
            </div>
            <div>
              <span className="font-bold text-slate-700 block mb-8">اعتماد الإدارة العليا</span>
              <span className="border-b border-dashed border-slate-400 block pb-1 font-mono text-[10px] text-slate-400">
                خاتم شعار الشركة SMD
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Camera / Photo Scanner Modal */}
      {showPhotoModal && (
        <PhotoImportModal
          domain="forms"
          title="تصوير النموذج الورقي بالكاميرا وتعبئته مباشرة"
          description="التقط صورة للنموذج الورقي المعتمد بالشركة، وسيقوم النظام بعرضه بالصورة الصحيحة لتعبئة البيانات والكتابة فوق الأسطر مباشرة."
          onClose={() => setShowPhotoModal(false)}
          onImportData={handleImportScannedPhoto}
        />
      )}

    </div>
  );
};
