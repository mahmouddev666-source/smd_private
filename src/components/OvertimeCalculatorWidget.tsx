/**
 * SMD - Suez Methanol Derivatives Co.
 * Interactive Overtime Engine & 6:00 PM Cutoff Calculator
 */

import React, { useState } from 'react';
import { ShiftType } from '../types';
import { calculateOvertime, getPythonOvertimeCode } from '../utils/overtimeCalculator';
import { 
  Calculator, 
  Clock, 
  CheckCircle2, 
  Sparkles, 
  Code, 
  Info, 
  ArrowLeft,
  DollarSign
} from 'lucide-react';

export const OvertimeCalculatorWidget: React.FC = () => {
  const [shiftType, setShiftType] = useState<ShiftType>('NORMAL_DAY');
  const [checkIn, setCheckIn] = useState<string>('08:00');
  const [checkOut, setCheckOut] = useState<string>('20:00');
  const [hourlyRate, setHourlyRate] = useState<number>(85.0);
  const [showCode, setShowCode] = useState<boolean>(false);

  // Compute live breakdown
  const result = calculateOvertime(shiftType, checkIn, checkOut, hourlyRate);

  // Quick preset test cases from the prompt
  const applyPreset = (presetName: string) => {
    if (presetName === 'example1') {
      // Prompt example: Normal Day (ends at 4 PM), works till 8 PM -> 2h day (1.35) + 2h night (1.70)
      setShiftType('NORMAL_DAY');
      setCheckIn('08:00');
      setCheckOut('20:00');
      setHourlyRate(85.0);
    } else if (presetName === 'example2') {
      // Prompt example 2: Night Shift ends at midnight (or extending to 2 AM) -> 2h night (1.70)
      setShiftType('NIGHT_SHIFT');
      setCheckIn('20:00');
      setCheckOut('02:00');
      setHourlyRate(85.0);
    } else if (presetName === 'day_overtime_only') {
      // Normal Day working until 17:30 -> 1.5h day OT only @ 1.35
      setShiftType('NORMAL_DAY');
      setCheckIn('08:00');
      setCheckOut('17:30');
      setHourlyRate(90.0);
    } else if (presetName === 'day_shift_12h') {
      // Day Shift 08:00 - 20:00 working until 22:00 -> 2h night OT @ 1.70
      setShiftType('DAY_SHIFT');
      setCheckIn('08:00');
      setCheckOut('22:00');
      setHourlyRate(100.0);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-700" />
            <h2 className="text-lg font-bold text-slate-900">
              خوارزمية ومحاكي احتساب الوقت الإضافي (قاعدة الحد الفاصل 6:00 م)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            المنطق الحسابي المعتمد لشركة السويس لمشتقات الميثانول: الساعات النهارية حتى 6:00 م تحتسب بمعدل <strong>1.35</strong>، والساعات الليلية من 6:00 م حتى 6:00 ص تحتسب بمعدل <strong>1.70</strong>.
          </p>
        </div>

        <button
          onClick={() => setShowCode(!showCode)}
          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border border-slate-300 cursor-pointer whitespace-nowrap self-start md:self-auto"
        >
          <Code className="w-4 h-4 text-slate-600" />
          <span>{showCode ? 'إخفاء كود Python' : 'عرض كود خوارزمية Python'}</span>
        </button>
      </div>

      {/* Preset Buttons for Immediate Verification */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <span className="text-xs font-bold text-slate-700 block mb-2">
          أمثلة معتمدة وسيناريوهات الفحص السريع:
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => applyPreset('example1')}
            className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 hover:border-blue-300 border border-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            مثال 1 (المطلوب نصاً): يوم عادي (ينتهي 4م) عمل حتى 8م (ساعتان 1.35 + ساعتان 1.70)
          </button>
          <button
            onClick={() => applyPreset('example2')}
            className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 hover:border-indigo-300 border border-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            مثال 2 (المطلوب نصاً): وردية ليلية تمتد حتى 2 صباحاً (ساعتان ليلي 1.70)
          </button>
          <button
            onClick={() => applyPreset('day_overtime_only')}
            className="px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-700 hover:border-amber-300 border border-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            سيناريو 3: يوم عادي يمتد حتى 5:30م (1.5 ساعة نهاري فقط قبل 6م)
          </button>
          <button
            onClick={() => applyPreset('day_shift_12h')}
            className="px-3 py-1.5 bg-white hover:bg-purple-50 text-purple-700 hover:border-purple-300 border border-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            سيناريو 4: وردية نهارية (تنتهي 8م) تمتد حتى 10م (ساعتان ليلي 1.70)
          </button>
        </div>
      </div>

      {/* Interactive Inputs & Calculation Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Form: Inputs */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            بيانات الوردية والحضور والانصراف
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              نوع الوردية المقررة
            </label>
            <select
              value={shiftType}
              onChange={(e) => setShiftType(e.target.value as ShiftType)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium"
            >
              <option value="NORMAL_DAY">يوم عمل عادي (08:00 ص - 04:00 م) - 8 ساعات</option>
              <option value="DAY_SHIFT">وردية نهارية (08:00 ص - 08:00 م) - 12 ساعة</option>
              <option value="NIGHT_SHIFT">وردية ليلية (08:00 م - 08:00 ص اليوم التالي) - 12 ساعة</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                وقت الحضور الفعلي
              </label>
              <input
                type="time"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                وقت الانصراف الفعلي
              </label>
              <input
                type="time"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              أجر الساعة الأساسي (ج.م / ساعة)
            </label>
            <div className="relative">
              <input
                type="number"
                min="10"
                step="5"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
              />
              <span className="absolute left-3 top-2 text-xs text-slate-400">ج.م / ساعة</span>
            </div>
          </div>

          {/* Dividing Line Rule Info Box */}
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 leading-relaxed">
            <span className="font-bold block mb-1">⚠️ قاعدة الـ 6:00 م الصارمة (Strict 18:00 Cutoff):</span>
            <span>
              أي عمل إضافي يقع في الفترة بين (06:00 ص إلى 06:00 م) يضرب في <strong>1.35</strong>.
              وأي عمل إضافي يقع بين (06:00 م إلى 06:00 ص) يضرب في <strong>1.70</strong>.
            </span>
          </div>
        </div>

        {/* Right Panel: Mathematical Results & Breakdown */}
        <div className="lg:col-span-7 bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-6">
          
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-100 pb-3">
              نتائج الاحتساب المالي والزمني للإضافي
            </h3>

            {/* Metrics cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] text-slate-500 block">ساعات العمل الفعلية</span>
                <span className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                  {result.actualWorkedHours} س
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  الأساسي المقبول: {result.standardHours} س
                </span>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-[11px] text-amber-800 font-bold block">إضافي نهاري (1.35)</span>
                <span className="text-2xl font-black text-amber-900 font-mono tabular-nums">
                  {result.dayOvertimeHours} س
                </span>
                <span className="text-[10px] text-amber-700 block mt-0.5 font-mono">
                  {result.dayOvertimePay} ج.م
                </span>
              </div>

              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <span className="text-[11px] text-indigo-800 font-bold block">إضافي ليلي (1.70)</span>
                <span className="text-2xl font-black text-indigo-900 font-mono tabular-nums">
                  {result.nightOvertimeHours} س
                </span>
                <span className="text-[10px] text-indigo-700 block mt-0.5 font-mono">
                  {result.nightOvertimePay} ج.م
                </span>
              </div>
            </div>

            {/* Total Pay Banner */}
            <div className="p-4 bg-gradient-to-r from-emerald-900 to-teal-950 text-white rounded-xl flex items-center justify-between mb-4">
              <div>
                <span className="text-xs text-emerald-200 font-semibold block">إجمالي المقابل المالي المستحق للإضافي</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black font-mono">{result.totalOvertimePay}</span>
                  <span className="text-xs text-emerald-300 font-bold">جنيه مصري (EGP)</span>
                </div>
              </div>
              <div className="text-left font-mono text-xs text-emerald-200">
                <span>إجمالي الساعات الفعلية: <strong>{result.totalOvertimeHours}س</strong></span>
                <span className="block">تعادل ساعات مدفوعة: <strong>{result.effectivePaidHours}س</strong></span>
              </div>
            </div>

            {/* Detailed Mathematical Audit Trail */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <h4 className="text-xs font-bold text-slate-800 mb-2">خطوات الاحتساب التفصيلية (Audit Trail):</h4>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {result.explanationSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0"></span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-3 flex items-center justify-between">
            <span>نظام احتساب شركة السويس لمشتقات الميثانول SMD</span>
            <span className="font-mono">قانون العمل المصري واللائحة الداخلية</span>
          </div>

        </div>

      </div>

      {/* Python Code Viewer Modal / Collapse */}
      {showCode && (
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 text-slate-200 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white font-mono">overtime_calc.py (Python Backend Engine)</span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(getPythonOvertimeCode());
                alert('تم نسخ كود Python إلى الحافظة بنجاح!');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono transition-colors cursor-pointer"
            >
              نسخ الكود
            </button>
          </div>
          <pre className="text-xs font-mono overflow-x-auto text-emerald-300 p-3 bg-slate-950 rounded-lg max-h-96" dir="ltr">
            {getPythonOvertimeCode()}
          </pre>
        </div>
      )}

    </div>
  );
};
