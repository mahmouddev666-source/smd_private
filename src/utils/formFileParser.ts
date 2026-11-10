/**
 * SMD - Suez Methanol Derivatives Co.
 * Form File Parser: Supports PDF, Word (.docx, .doc), Excel (.xlsx, .xls, .csv), and Images
 * Converts any imported file into a visual interactive form template with overlay typing.
 */

import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

export interface FormCustomField {
  id: string;
  label: string;
  value: string;
  type?: 'text' | 'textarea' | 'date' | 'number';
}

export interface OverlayField {
  id: string;
  label: string;
  value: string;
  xPercent: number; // 0 to 100%
  yPercent: number; // 0 to 100%
  fontSize: number;  // font size in px (e.g. 13)
  isBold?: boolean;
  color?: string;
  widthPx?: number;
}

export interface CustomFormTemplate {
  formId: string;
  formTitle: string;
  formCode: string;
  category: string;
  sourceType: 'word' | 'pdf' | 'excel' | 'scanned' | 'json' | 'text' | 'manual';
  sourceFileName?: string;
  uploadedAt: string;
  description: string;
  headerPreamble: string;
  fields: FormCustomField[];
  footerNotes: string;
  signatures: { title: string; name: string }[];
  
  // High-fidelity visual document representation
  documentDataUrl?: string; // Data URL for images / PDFs
  rawHtmlContent?: string;  // Original formatted HTML from Word document
  excelTableData?: {
    headers: string[];
    rows: string[][];
  };
  overlayFields?: OverlayField[]; // Fillable fields placed on top of original document
}

/**
 * Reads a File as Data URL string
 */
export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * Extracts text from binary PDF data
 */
function extractTextFromPdfArrayBuffer(buffer: ArrayBuffer): string {
  try {
    const uint8 = new Uint8Array(buffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawStr = decoder.decode(uint8);

    const textPieces: string[] = [];
    const stringRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let match;
    while ((match = stringRegex.exec(rawStr)) !== null) {
      if (match[1] && match[1].trim().length > 1) {
        textPieces.push(match[1].trim());
      }
    }

    const arrayRegex = /\[([^\]]+)\]\s*TJ/g;
    while ((match = arrayRegex.exec(rawStr)) !== null) {
      const inner = match[1];
      const innerStrings = inner.match(/\(([^)]+)\)/g);
      if (innerStrings) {
        innerStrings.forEach(s => {
          const clean = s.replace(/[()]/g, '').trim();
          if (clean.length > 0) textPieces.push(clean);
        });
      }
    }

    return textPieces.join(' ');
  } catch (err) {
    console.warn('PDF stream extraction error:', err);
    return '';
  }
}

/**
 * Parses any uploaded form file (PDF, Word, Excel, Images, JSON, TXT)
 */
export async function parseFormFile(file: File): Promise<CustomFormTemplate> {
  const fileName = file.name;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const now = new Date().toISOString().split('T')[0];
  const uniqueId = `SMD-DOC-${Date.now()}`;
  const defaultBaseTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[_|-]/g, ' ');

  // Read data URL so the original document can be displayed visually
  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch (err) {
    console.warn('Could not read data URL:', err);
  }

  // 1. IMAGE / SCANNED DOCUMENT (JPG, PNG, WEBP)
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) || file.type.startsWith('image/')) {
    return {
      formId: uniqueId,
      formTitle: defaultBaseTitle || 'نموذج ورقي رسمي مصور',
      formCode: `SMD-IMG-${Math.floor(10 + Math.random() * 90)}`,
      category: 'الموارد البشرية والعمليات',
      sourceType: 'scanned',
      sourceFileName: fileName,
      uploadedAt: now,
      description: `صورة المستند الأصلي (${fileName}) مع إمكانية التعبئة والكتابة المباشرة فوق أسطر وخانات الورقة.`,
      headerPreamble: 'مستند ورقي رسمي لشركة السويس لمشتقات الميثانول معبأ آلياً وتفاعلياً.',
      documentDataUrl: dataUrl,
      fields: [
        { id: 'f1', label: 'اسم الموظف', value: '' },
        { id: 'f2', label: 'كود الموظف (PIN)', value: '' },
        { id: 'f3', label: 'الإدارة / القطاع', value: '' },
        { id: 'f4', label: 'التاريخ', value: now }
      ],
      overlayFields: [
        { id: 'ov-name', label: 'اسم الموظف', value: '', xPercent: 25, yPercent: 22, fontSize: 13, isBold: true, color: '#0f172a' },
        { id: 'ov-id', label: 'كود الموظف', value: '', xPercent: 78, yPercent: 22, fontSize: 13, isBold: true, color: '#1e40af' },
        { id: 'ov-dept', label: 'الإدارة', value: '', xPercent: 25, yPercent: 29, fontSize: 12, isBold: false, color: '#0f172a' },
        { id: 'ov-date', label: 'التاريخ', value: now, xPercent: 78, yPercent: 29, fontSize: 12, isBold: false, color: '#0f172a' }
      ],
      footerNotes: '• تم استيراد صورة هذا المستند وتعبئته مباشرة عبر منظومة إدارة الموارد البشرية بشركة SMD.',
      signatures: [
        { title: 'توقيع الموظف', name: 'الموظف المختص' },
        { title: 'الرئيس المباشر', name: 'رئيس القسم' },
        { title: 'مدير الموارد البشرية', name: 'أ. محمد عبد الرحمن' },
        { title: 'اعتماد الإدارة العليا', name: 'خاتم شعار الشركة SMD' }
      ]
    };
  }

  // 2. WORD (.docx, .doc)
  if (ext === 'docx' || ext === 'doc') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      let extractedText = '';
      let extractedHtml = '';
      try {
        const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
        extractedHtml = htmlResult.value || '';
        const textResult = await mammoth.extractRawText({ arrayBuffer });
        extractedText = textResult.value || '';
      } catch (err) {
        console.warn('Mammoth extraction failed:', err);
      }

      const lines = extractedText.split('\n').map(l => l.trim()).filter(Boolean);
      const title = lines[0] || defaultBaseTitle;
      const fields: FormCustomField[] = [];

      lines.slice(1, 10).forEach((line, idx) => {
        if (line.includes(':') || line.includes('：')) {
          const parts = line.split(/[:：]/);
          const label = parts[0]?.trim();
          const val = parts.slice(1).join(':').trim();
          if (label && label.length < 50) {
            fields.push({ id: `f-${idx}`, label, value: val || '—' });
          }
        }
      });

      return {
        formId: uniqueId,
        formTitle: title || 'نموذج مستند Word معتمد',
        formCode: `SMD-WD-${Math.floor(10 + Math.random() * 90)}`,
        category: 'الموارد البشرية والشؤون الإدارية',
        sourceType: 'word',
        sourceFileName: fileName,
        uploadedAt: now,
        description: `مستند Word (${fileName}) محتفظ بالجداول والتنسيقات الأصلية مع إمكانية الكتابة والتعديل الحي في خلايا الجدول والأسطر.`,
        headerPreamble: lines[1] || 'بناءً على تعليمات ولوائح شركة السويس لمشتقات الميثانول، يحرر هذا النموذج الرسمي للعمل بموجبه.',
        rawHtmlContent: extractedHtml,
        documentDataUrl: dataUrl,
        fields: fields.length > 0 ? fields : [
          { id: 'f1', label: 'الموضوع', value: title },
          { id: 'f2', label: 'التاريخ', value: now }
        ],
        overlayFields: [
          { id: 'ov-emp', label: 'اسم الموظف', value: '', xPercent: 30, yPercent: 20, fontSize: 13, isBold: true },
          { id: 'ov-code', label: 'كود الموظف', value: '', xPercent: 75, yPercent: 20, fontSize: 13, isBold: true }
        ],
        footerNotes: '• يعتبر هذا النموذج مستنداً رسمياً معتمداً ومحفوظاً بالإدارة العامة للموارد البشرية بشركة SMD.',
        signatures: [
          { title: 'توقيع الموظف المختص', name: 'الموظف القائم بالعمل' },
          { title: 'الرئيس المباشر', name: 'رئيس القسم / المدير' },
          { title: 'مدير الموارد البشرية', name: 'أ. محمد عبد الرحمن' },
          { title: 'اعتماد الإدارة العليا', name: 'خاتم شعار الشركة SMD' }
        ]
      };
    } catch (e) {
      console.error('Word import error:', e);
    }
  }

  // 3. EXCEL (.xlsx, .xls, .csv)
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      const formTitle = (jsonRows[0]?.[0] as string) || sheetName || defaultBaseTitle;
      const headers = (jsonRows[0] || []).map(String);
      const dataRows = jsonRows.slice(1).map(r => (Array.isArray(r) ? r.map(String) : []));

      const fields: FormCustomField[] = [];
      dataRows.slice(0, 10).forEach((row, rIdx) => {
        if (row[0] && row[1]) {
          fields.push({ id: `f-${rIdx}`, label: row[0], value: row[1] });
        }
      });

      return {
        formId: uniqueId,
        formTitle: formTitle,
        formCode: `SMD-XL-${Math.floor(10 + Math.random() * 90)}`,
        category: 'العمليات والتخطيط المالي',
        sourceType: 'excel',
        sourceFileName: fileName,
        uploadedAt: now,
        description: `جدول Excel (${fileName} - ورقة ${sheetName}) معروض بصورته وجداوله الأصلية مع إمكانية تعديل وتعبئة الخلايا مباشرة.`,
        headerPreamble: `نموذج وجدول معتمد طبقاً لكشوف البيانات بشركة السويس لمشتقات الميثانول SMD (${sheetName}).`,
        documentDataUrl: dataUrl,
        excelTableData: {
          headers: headers.length > 0 ? headers : ['البيان', 'القيمة', 'ملاحظات'],
          rows: dataRows.length > 0 ? dataRows : [['بيان مستورد', 'قيمة', 'معتمد']]
        },
        fields: fields.length > 0 ? fields : [
          { id: 'f1', label: 'ورقة العمل', value: sheetName },
          { id: 'f2', label: 'تاريخ الإدراج', value: now }
        ],
        footerNotes: '• تم استخراج هذا الجدول ومطابقته على أنظمة شركة SMD.',
        signatures: [
          { title: 'إعداد ومراجعة', name: 'أخصائي البيانات' },
          { title: 'مدير الإدارة', name: 'المدير المسؤول' },
          { title: 'مدير الموارد البشرية', name: 'أ. محمد عبد الرحمن' },
          { title: 'اعتماد الإدارة العليا', name: 'خاتم شعار الشركة SMD' }
        ]
      };
    } catch (e) {
      console.error('Excel import error:', e);
    }
  }

  // 4. PDF (.pdf)
  if (ext === 'pdf') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const extractedText = extractTextFromPdfArrayBuffer(arrayBuffer);
      const lines = extractedText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const title = lines[0] && lines[0].length < 80 ? lines[0] : defaultBaseTitle;

      return {
        formId: uniqueId,
        formTitle: title || 'نموذج PDF رسمي',
        formCode: `SMD-PDF-${Math.floor(10 + Math.random() * 90)}`,
        category: 'السلامة والصحة المهنية والبيئة',
        sourceType: 'pdf',
        sourceFileName: fileName,
        uploadedAt: now,
        description: `مستند PDF أصلي (${fileName}) معروض مباشرة مع إمكانية تعبئة البيانات فوق خانات المستند وأسطره بدقة كاملة.`,
        headerPreamble: extractedText.length > 20 
          ? extractedText.slice(0, 200) + '...'
          : 'بناءً على وثائق ولوائح شركة السويس لمشتقات الميثانول SMD، يحرر هذا النموذج الرسمي معتمداً ومطابقاً للشروط المعمول بها.',
        documentDataUrl: dataUrl, // Holds PDF data URL for visual preview
        fields: [
          { id: 'f1', label: 'اسم الملف الأصلي', value: fileName },
          { id: 'f2', label: 'تاريخ الإدراج', value: now },
          { id: 'f3', label: 'موقع الاستخدام', value: 'مصنع السويس لمشتقات الميثانول' }
        ],
        overlayFields: [
          { id: 'ov-emp', label: 'اسم الموظف', value: '', xPercent: 28, yPercent: 23, fontSize: 13, isBold: true, color: '#0f172a' },
          { id: 'ov-pin', label: 'كود الموظف (PIN)', value: '', xPercent: 78, yPercent: 23, fontSize: 13, isBold: true, color: '#1e40af' },
          { id: 'ov-dept', label: 'الإدارة', value: '', xPercent: 28, yPercent: 30, fontSize: 12, isBold: false, color: '#0f172a' },
          { id: 'ov-date', label: 'تاريخ التحرير', value: now, xPercent: 78, yPercent: 30, fontSize: 12, isBold: false, color: '#0f172a' },
          { id: 'ov-custom', label: 'ملاحظات / قرار', value: '', xPercent: 28, yPercent: 45, fontSize: 12, isBold: false, color: '#0f172a', widthPx: 320 }
        ],
        footerNotes: '• أقر بصحة البيانات المذكورة أعلاه ومطابقتها للمستند الرسمي.\n• مستخرج ومحرر عبر منظومة إدارة النماذج الذكية بشركة SMD.',
        signatures: [
          { title: 'محرر النموذج', name: 'الموظف المختص' },
          { title: 'الرئيس المباشر', name: 'المدير المعني' },
          { title: 'مدير الموارد البشرية', name: 'أ. محمد عبد الرحمن' },
          { title: 'اعتماد الإدارة العليا', name: 'خاتم شعار الشركة SMD' }
        ]
      };
    } catch (e) {
      console.error('PDF import error:', e);
    }
  }

  // 5. Fallback for text / other data
  return {
    formId: uniqueId,
    formTitle: defaultBaseTitle || 'نموذج مستند إداري مستورد',
    formCode: `SMD-DOC-${Math.floor(10 + Math.random() * 90)}`,
    category: 'الموارد البشرية والشؤون الإدارية',
    sourceType: 'manual',
    sourceFileName: fileName,
    uploadedAt: now,
    description: `نموذج جديد مستورد من ملف (${fileName}) متاح للتعديل الكامل والكتابة وإضافة الحقول.`,
    headerPreamble: 'بناءً على تعليمات شركة السويس لمشتقات الميثانول، يحرر هذا النموذج الرسمي للعمل بموجبه.',
    documentDataUrl: dataUrl,
    fields: [
      { id: 'f1', label: 'اسم الملف المستورد', value: fileName },
      { id: 'f2', label: 'تاريخ الإدراج', value: now },
      { id: 'f3', label: 'الجهة / الموقع', value: 'مصنع السويس لمشتقات الميثانول' }
    ],
    overlayFields: [
      { id: 'ov-1', label: 'اسم الموظف', value: '', xPercent: 30, yPercent: 25, fontSize: 13, isBold: true }
    ],
    footerNotes: '• يعتبر هذا النموذج مستنداً رسمياً معتمداً ومحفوظاً بالإدارة العامة للموارد البشرية بشركة SMD.',
    signatures: [
      { title: 'توقيع الموظف', name: 'الموظف المختص' },
      { title: 'الرئيس المباشر', name: 'المدير المسؤول' },
      { title: 'مدير الموارد البشرية', name: 'أ. محمد عبد الرحمن' },
      { title: 'اعتماد الإدارة العليا', name: 'خاتم شعار الشركة SMD' }
    ]
  };
}
