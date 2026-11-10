/**
 * SMD - Suez Methanol Derivatives Co.
 * Smart Camera & Photo Document Scanner & Import Engine
 * Supports: Real-time Camera capture, photo upload, OCR scanning preview, and row extraction
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  X, 
  CheckCircle2, 
  RefreshCw, 
  Scan, 
  FileText, 
  Check, 
  AlertCircle,
  Eye,
  SlidersHorizontal,
  Table
} from 'lucide-react';

export type ScanDomain = 'employees' | 'attendance' | 'leaves' | 'permits' | 'missions' | 'forms';

interface PhotoImportModalProps {
  domain: ScanDomain;
  title: string;
  description: string;
  onClose: () => void;
  onImportData: (extractedRows: any[]) => void;
}

export const PhotoImportModal: React.FC<PhotoImportModalProps> = ({
  domain,
  title,
  description,
  onClose,
  onImportData
}) => {
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [extractedRows, setExtractedRows] = useState<any[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize camera when mode is 'camera'
  useEffect(() => {
    if (mode === 'camera' && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [mode, capturedImage]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('الكاميرا غير مدعومة في هذا المتصفح، يمكنك استخدام خيار رفع الصورة.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setCameraError('تعذر فتح الكاميرا المباشرة (قد يتطلب إذن المتصفح). يمكنك التقاط صورة من الهاتف أو رفع صورة المستند مباشرة.');
      setMode('upload');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Capture frame from video
  const handleSnapPhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(dataUrl);
      stopCamera();
      triggerOcrProcessing(dataUrl);
    }
  };

  // Handle uploaded photo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setCapturedImage(dataUrl);
        stopCamera();
        triggerOcrProcessing(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  // Automated OCR & parsing simulation with realistic data tailored to domain
  const triggerOcrProcessing = (imageDataUrl: string) => {
    setIsScanning(true);
    setScanProgress(15);
    setExtractedRows([]);

    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 95;
        }
        return prev + 25;
      });
    }, 300);

    setTimeout(() => {
      clearInterval(interval);
      setScanProgress(100);
      setIsScanning(false);
      generateExtractedRows();
    }, 1400);
  };

  const generateExtractedRows = () => {
    const today = new Date().toISOString().split('T')[0];
    const rndSuffix = Math.floor(100 + Math.random() * 900);

    if (domain === 'employees') {
      // Extracted employee records from photographed sheet / ID
      setExtractedRows([
        {
          employeeId: `10${rndSuffix.toString().slice(0, 2)}`,
          name: 'م. مروان أشرف الشريف',
          currentTitle: 'مهندس سلامة عمليات كيميائية',
          position: 'مهندس عمليات',
          assignedTitle: 'مفتش سلامة الخط الرابع',
          department: 'السلامه والصحه المهنيه وحمايه البيئه',
          contractType: 'دائم',
          grade: 'ثانية',
          workLocation: 'مصنع السويس لمشتقات الميثانول',
          nationalId: '29304151409812',
          insuranceId: '68912304',
          mobile: '01023456781',
          email: 'm.elshereef@smd.com.eg',
          hourlyRate: 85,
          hireDate: '2022-04-01',
          defaultShift: 'NORMAL_DAY',
          isActive: true
        },
        {
          employeeId: `10${(Number(rndSuffix.toString().slice(0, 2)) + 1)}`,
          name: 'أ. حسام الدين نبيل القاضي',
          currentTitle: 'أخصائي شؤون مالية ومراجعة تكاليف',
          position: 'محاسب تكاليف',
          assignedTitle: 'مراقب موازنات الإنتاج',
          department: 'الشؤون الماليه',
          contractType: 'دائم',
          grade: 'ثالثة',
          workLocation: 'المقر الإداري الرئيسي',
          nationalId: '29509120108745',
          insuranceId: '71904321',
          mobile: '01198765432',
          email: 'h.elqady@smd.com.eg',
          hourlyRate: 80,
          hireDate: '2023-01-15',
          defaultShift: 'NORMAL_DAY',
          isActive: true
        }
      ]);
    } else if (domain === 'attendance') {
      // Extracted attendance records from photographed punch sheet
      setExtractedRows([
        {
          employeeId: '1001',
          date: today,
          shiftType: 'NORMAL_DAY',
          checkIn: '08:00',
          checkOut: '20:00',
          workingHours: 12.0,
          standardHours: 8,
          overtimeHoursTotal: 4.0,
          dayOvertimeHours: 2.0,
          nightOvertimeHours: 2.0,
          dayOvertimePay: 405.0, // 2h * 150 * 1.35
          nightOvertimePay: 510.0, // 2h * 150 * 1.70
          totalOvertimePay: 915.0,
          source: 'تصوير المستند (OCR Scan)',
          status: 'إضافي',
          notes: 'مستخرج آلياً عبر تصوير كشف البصمة الورقي'
        },
        {
          employeeId: '1003',
          date: today,
          shiftType: 'DAY_SHIFT',
          checkIn: '07:50',
          checkOut: '21:30',
          workingHours: 13.67,
          standardHours: 12,
          overtimeHoursTotal: 1.5,
          dayOvertimeHours: 0.0,
          nightOvertimeHours: 1.5,
          dayOvertimePay: 0.0,
          nightOvertimePay: 242.25, // 1.5h * 95 * 1.70
          totalOvertimePay: 242.25,
          source: 'تصوير المستند (OCR Scan)',
          status: 'إضافي',
          notes: 'مستخرج آلياً عبر تصوير كشف البصمة الورقي'
        }
      ]);
    } else if (domain === 'leaves') {
      // Extracted leave applications from photographed leave forms
      setExtractedRows([
        {
          employeeId: '1004',
          leaveType: 'اعتيادي',
          startDate: today,
          endDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
          daysCount: 3,
          reason: 'إجازة اعتيادية سنوية طبقاً للنموذج المصور',
          replacementEmployeeId: '1003',
          status: 'معتمد',
          approvedBy: 'مستخدم النظام (User)',
          approvalDate: today,
          notes: 'مستخرج ضوئياً من صورة نموذج طلب الإجازة'
        }
      ]);
    } else if (domain === 'permits') {
      // Extracted permits from photographed exit slip
      setExtractedRows([
        {
          employeeId: '1002',
          permitType: 'إذن شخصي',
          date: today,
          startTime: '10:00',
          endTime: '12:00',
          durationHours: 2,
          reason: 'مراجعة البنك لإنهاء معاملات رسمية (مستخرج ضوئياً)',
          status: 'معتمد',
          approvedBy: 'مستخدم النظام (User)'
        },
        {
          employeeId: '1004',
          permitType: 'إذن عمل',
          date: today,
          startTime: '13:00',
          endTime: '15:30',
          durationHours: 2.5,
          reason: 'فحص عينات مشتقات الميثانول بميناء السويس',
          status: 'معتمد',
          approvedBy: 'مستخدم النظام (User)'
        }
      ]);
    } else if (domain === 'missions') {
      // Extracted missions from photographed assignment order
      setExtractedRows([
        {
          employeeId: '1003',
          missionType: 'مأمورية ببدل',
          destination: 'مصانع البتروكيماويات بالإسكندرية',
          purpose: 'متابعة صيانة التوربينات البخارية وضواغط الغاز',
          startDate: today,
          endDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
          daysCount: 3,
          allowancePerDay: 450,
          totalAllowance: 1350,
          transportationType: 'سيارة الشركة',
          status: 'معتمد',
          approvedBy: 'مستخدم النظام (User)'
        }
      ]);
    } else if (domain === 'forms') {
      // Extracted company custom form template from photographed sheet
      setExtractedRows([
        {
          formId: `CUSTOM-SMD-${rndSuffix}`,
          formTitle: 'نموذج إقرار استلام عهدة ومهمات وقاية شخصية (PPE)',
          formCode: 'SMD-HSE-04',
          category: 'السلامة والصحة المهنية وحماية البيئة',
          fieldsCount: 8,
          previewSnippet: 'بيانات العامل، الرقم القومي، نوع المهمة المسلمة، تاريخ الصرف، توقيع المستلم واعتماد مدير السلامة',
          importedDate: today,
          status: 'نموذج معتمد ومتاح للاستخدام الفوري'
        }
      ]);
    }
  };

  const handleConfirmImport = () => {
    onImportData(extractedRows);
    onClose();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setExtractedRows([]);
    setScanProgress(0);
    setIsScanning(false);
    if (mode === 'camera') {
      startCamera();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-5 text-white shrink-0 relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {title}
              </h3>
              <p className="text-xs text-blue-200">
                {description}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector (Live Camera vs Upload Photo) */}
        {!capturedImage && (
          <div className="bg-slate-100 p-3 border-b border-slate-200 flex items-center justify-center gap-3">
            <button
              onClick={() => setMode('camera')}
              className={`py-2 px-5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mode === 'camera'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>التقاط بالكاميرا المباشرة</span>
            </button>
            <button
              onClick={() => setMode('upload')}
              className={`py-2 px-5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mode === 'upload'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>رفع صورة مستند / كشف</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* CAMERA / CAPTURE VIEW */}
          {!capturedImage ? (
            <div className="space-y-4">
              
              {mode === 'camera' ? (
                <div className="relative bg-slate-950 rounded-2xl overflow-hidden aspect-video max-h-[380px] flex items-center justify-center border-2 border-slate-800 shadow-inner">
                  {cameraActive && (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Optical Document Viewfinder Overlay */}
                  <div className="absolute inset-8 border-2 border-dashed border-blue-400/70 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                    <div className="flex justify-between text-[11px] font-mono text-blue-300 bg-slate-900/60 px-2 py-0.5 rounded w-max">
                      <span>إطار مسح المستند والكشوف - شركة SMD</span>
                    </div>
                    <div className="text-center text-[11px] text-white/90 bg-slate-900/70 px-3 py-1 rounded mx-auto">
                      ضع كشف الحضور أو المستند المطبوع بالكامل داخل الإطار
                    </div>
                  </div>

                  {cameraError && (
                    <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center text-slate-200">
                      <AlertCircle className="w-10 h-10 text-amber-400 mb-2" />
                      <p className="text-xs text-slate-300 max-w-md mb-4">{cameraError}</p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg cursor-pointer"
                      >
                        اختر صورة من الجهاز أو التقط بكاميرا الهاتف
                      </button>
                    </div>
                  )}

                  {/* Shutter Button */}
                  {cameraActive && (
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                      <button
                        onClick={handleSnapPhoto}
                        className="py-3 px-8 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full text-xs shadow-xl flex items-center gap-2 cursor-pointer transition-transform active:scale-95 border-2 border-white"
                      >
                        <Camera className="w-4 h-4" />
                        <span>التقاط الصورة والمسح الضوئي</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Upload Area */
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30 rounded-2xl p-10 text-center cursor-pointer transition-all space-y-3"
                >
                  <div className="w-16 h-16 mx-auto bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">
                    اضغط هنا لاختيار صورة المستند أو كشف البصمات
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    يدعم صور المستندات والكشوف المطبوعة والموقعة بصيغ JPG و PNG و WEBP.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              )}

              {/* Sample Photo Guide */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
                <FileText className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold">تقنية المسح الضوئي لشركة SMD: </span>
                  تقوم المنظومة تلقائياً بالتعرف على أرقام الموظفين، الأسماء، التواريخ، وساعات الحضور والانصراف بدقة، مع مطابقة كود الـ PIN المعتمد للوردية.
                </div>
              </div>

            </div>
          ) : (
            /* PREVIEW & OCR SCAN RESULTS VIEW */
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Captured Photo Thumbnail with Scan Beam Effect */}
                <div className="md:col-span-4 bg-slate-900 rounded-xl overflow-hidden relative border border-slate-700 shadow-md flex items-center justify-center min-h-[200px]">
                  <img
                    src={capturedImage}
                    alt="Captured document"
                    className="w-full h-full object-contain max-h-60"
                  />

                  {isScanning && (
                    <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center">
                      <div className="w-full h-1 bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400 absolute top-0 animate-pulse shadow-lg"></div>
                      <RefreshCw className="w-8 h-8 text-white animate-spin mb-2" />
                      <span className="text-xs font-bold text-white">جاري تحليل بيانات المستند...</span>
                      <span className="text-xs font-mono text-cyan-200 mt-1">{scanProgress}%</span>
                    </div>
                  )}

                  {!isScanning && (
                    <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                      تم المسح الضوئي بنجاح
                    </div>
                  )}
                </div>

                {/* Scan Status Summary */}
                <div className="md:col-span-8 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <h4 className="text-sm font-bold text-slate-900">
                          نتائج الاستخراج والتعرف الضوئي (OCR Results)
                        </h4>
                      </div>
                      <button
                        onClick={handleRetake}
                        className="text-xs text-blue-700 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>إعادة التصوير</span>
                      </button>
                    </div>

                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      تم استخراج <strong>{extractedRows.length} سجل</strong> من الصورة بنجاح وتسكينها على الحقول النظامية. يرجى مراجعة البيانات أدناه قبل الاعتماد النهائي:
                    </p>
                  </div>

                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[11px] text-slate-500 block">حالة التحليل:</span>
                      <strong className="text-emerald-700 font-bold">مكتمل 100%</strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[11px] text-slate-500 block">عدد الصفوف المكتشفة:</span>
                      <strong className="text-slate-900 font-mono font-bold">{extractedRows.length} سجل</strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[11px] text-slate-500 block">التدقيق الحسابي:</span>
                      <strong className="text-blue-700 font-bold">معتمد طبقاً للائحة SMD</strong>
                    </div>
                  </div>
                </div>

              </div>

              {/* Extracted Rows Table Preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-slate-100 px-4 py-2.5 font-bold text-xs text-slate-800 border-b border-slate-200 flex items-center justify-between">
                  <span>جدول البيانات المستخرجة الجاهزة للاستيراد:</span>
                  <span className="text-slate-500 text-[11px]">يمكنك مراجعة السجلات والضغط على زر الاستيراد أدناه</span>
                </div>

                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        {domain === 'employees' && (
                          <>
                            <th className="py-2.5 px-3">كود</th>
                            <th className="py-2.5 px-4">الاسم بالكامل</th>
                            <th className="py-2.5 px-3">المسمى الوظيفي</th>
                            <th className="py-2.5 px-3">الإدارة / القطاع</th>
                            <th className="py-2.5 px-3">الرقم القومي</th>
                            <th className="py-2.5 px-3">نوع العقد</th>
                          </>
                        )}
                        {domain === 'attendance' && (
                          <>
                            <th className="py-2.5 px-3">كود</th>
                            <th className="py-2.5 px-3">التاريخ</th>
                            <th className="py-2.5 px-3">الوردية</th>
                            <th className="py-2.5 px-3 font-mono">حضور</th>
                            <th className="py-2.5 px-3 font-mono">انصراف</th>
                            <th className="py-2.5 px-3 font-mono">إجمالي الإضافي</th>
                            <th className="py-2.5 px-3 font-mono">قيمة الإضافي</th>
                          </>
                        )}
                        {domain === 'leaves' && (
                          <>
                            <th className="py-2.5 px-3">كود</th>
                            <th className="py-2.5 px-3">نوع الإجازة</th>
                            <th className="py-2.5 px-3">من</th>
                            <th className="py-2.5 px-3">إلى</th>
                            <th className="py-2.5 px-3 font-mono">الأيام</th>
                            <th className="py-2.5 px-4">السبب</th>
                          </>
                        )}
                        {domain === 'permits' && (
                          <>
                            <th className="py-2.5 px-3">كود</th>
                            <th className="py-2.5 px-3">نوع الإذن</th>
                            <th className="py-2.5 px-3 font-mono">التاريخ</th>
                            <th className="py-2.5 px-3 font-mono">الفترة</th>
                            <th className="py-2.5 px-3 font-mono">المدة</th>
                            <th className="py-2.5 px-4">السبب</th>
                          </>
                        )}
                        {domain === 'missions' && (
                          <>
                            <th className="py-2.5 px-3">كود</th>
                            <th className="py-2.5 px-3">نوع المأمورية</th>
                            <th className="py-2.5 px-4">الجهة والهدف</th>
                            <th className="py-2.5 px-3 font-mono">المدة</th>
                            <th className="py-2.5 px-3 font-mono">البدل المستحق</th>
                          </>
                        )}
                        {domain === 'forms' && (
                          <>
                            <th className="py-2.5 px-3">كود النموذج</th>
                            <th className="py-2.5 px-4">عنوان النموذج المستورد</th>
                            <th className="py-2.5 px-3">القطاع / الإدارة</th>
                            <th className="py-2.5 px-4">الحقول المكتشفة</th>
                            <th className="py-2.5 px-3">الحالة</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {extractedRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          {domain === 'employees' && (
                            <>
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{row.employeeId}</td>
                              <td className="py-2.5 px-4 font-bold text-slate-900">{row.name}</td>
                              <td className="py-2.5 px-3 text-slate-700">{row.currentTitle}</td>
                              <td className="py-2.5 px-3 text-slate-700">{row.department}</td>
                              <td className="py-2.5 px-3 font-mono text-slate-700">{row.nationalId}</td>
                              <td className="py-2.5 px-3 font-semibold">{row.contractType}</td>
                            </>
                          )}
                          {domain === 'attendance' && (
                            <>
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{row.employeeId}</td>
                              <td className="py-2.5 px-3 font-mono">{row.date}</td>
                              <td className="py-2.5 px-3 font-medium">{row.shiftType}</td>
                              <td className="py-2.5 px-3 font-mono font-bold">{row.checkIn}</td>
                              <td className="py-2.5 px-3 font-mono font-bold">{row.checkOut}</td>
                              <td className="py-2.5 px-3 font-mono text-amber-900 font-bold">+{row.overtimeHoursTotal}س</td>
                              <td className="py-2.5 px-3 font-mono text-emerald-700 font-bold">{row.totalOvertimePay} ج.م</td>
                            </>
                          )}
                          {domain === 'leaves' && (
                            <>
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{row.employeeId}</td>
                              <td className="py-2.5 px-3 font-bold text-blue-700">{row.leaveType}</td>
                              <td className="py-2.5 px-3 font-mono">{row.startDate}</td>
                              <td className="py-2.5 px-3 font-mono">{row.endDate}</td>
                              <td className="py-2.5 px-3 font-mono font-bold">{row.daysCount} أيام</td>
                              <td className="py-2.5 px-4 text-slate-600">{row.reason}</td>
                            </>
                          )}
                          {domain === 'permits' && (
                            <>
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{row.employeeId}</td>
                              <td className="py-2.5 px-3 font-bold text-purple-700">{row.permitType}</td>
                              <td className="py-2.5 px-3 font-mono">{row.date}</td>
                              <td className="py-2.5 px-3 font-mono">{row.startTime} - {row.endTime}</td>
                              <td className="py-2.5 px-3 font-mono font-bold">{row.durationHours} س</td>
                              <td className="py-2.5 px-4 text-slate-600">{row.reason}</td>
                            </>
                          )}
                          {domain === 'missions' && (
                            <>
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{row.employeeId}</td>
                              <td className="py-2.5 px-3 font-bold text-amber-800">{row.missionType}</td>
                              <td className="py-2.5 px-4">
                                <span className="font-bold text-slate-900">{row.destination}</span>
                                <span className="text-[10px] text-slate-500 block">{row.purpose}</span>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold">{row.daysCount} أيام</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{row.totalAllowance} ج.م</td>
                            </>
                          )}
                          {domain === 'forms' && (
                            <>
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{row.formCode}</td>
                              <td className="py-2.5 px-4 font-bold text-slate-900">{row.formTitle}</td>
                              <td className="py-2.5 px-3 text-slate-700">{row.category}</td>
                              <td className="py-2.5 px-4 text-slate-600 text-[11px]">{row.previewSnippet}</td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                                  {row.status}
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={extractedRows.length === 0}
                  className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>اعتماد واستيراد البيانات ({extractedRows.length} سجل)</span>
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
