/**
 * SMD - Suez Methanol Derivatives Co.
 * Backend Architecture, Database Schema, and Local Server Engineering Studio
 */

import React, { useState } from 'react';
import { 
  DATABASE_SQL_SCHEMA, 
  PYTHON_FASTAPI_MAIN, 
  PYTHON_ZKTECO_SERVICE, 
  PYTHON_REQUIREMENTS 
} from '../data/backendArchitecture';
import { getPythonOvertimeCode } from '../utils/overtimeCalculator';
import { 
  Database, 
  Code, 
  Download, 
  Copy, 
  CheckCircle2, 
  Server, 
  Cpu, 
  Layers, 
  FileCode,
  Terminal
} from 'lucide-react';

export const ArchitectureAndDbView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'sql' | 'fastapi' | 'zkteco' | 'overtime' | 'architecture'>('sql');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (codeText: string, key: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadFile = (content: string, filename: string, mime: string = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-blue-900/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-semibold mb-2">
              <Server className="w-4 h-4 text-blue-400" />
              <span>معمارية الخادم المحلي وقواعد البيانات (Local Server / PC Ready)</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              معمارية النظام، مخطط SQL، وخدمات Python
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              المواصفات التقنية الكاملة لتشغيل المنظومة على سيرفر شركة السويس لمشتقات الميثانول: سكريبتات SQLite/PostgreSQL، خادم FastAPI، ومكتبة pyzk لربط البصمات.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownloadFile(DATABASE_SQL_SCHEMA, 'smd_hr_schema.sql', 'application/sql')}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>تحميل schema.sql</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveSubTab('sql')}
          className={`py-2 px-4 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeSubTab === 'sql'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>مخطط قواعد البيانات (Database SQL Schema)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('fastapi')}
          className={`py-2 px-4 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeSubTab === 'fastapi'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          <span>خادم Python FastAPI (main.py)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('zkteco')}
          className={`py-2 px-4 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeSubTab === 'zkteco'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>خدمة pyzk للبصمة (zkteco_service.py)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('overtime')}
          className={`py-2 px-4 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeSubTab === 'overtime'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>خوارزمية الإضافي 6م (overtime_calc.py)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('architecture')}
          className={`py-2 px-4 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeSubTab === 'architecture'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>المخطط الهيكلي للربط المحلي</span>
        </button>
      </div>

      {/* SUB-TAB 1: DATABASE SQL SCHEMA */}
      {activeSubTab === 'sql' && (
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 text-slate-200 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-xs font-bold text-white font-mono">smd_hr_schema.sql (SQLite & PostgreSQL Dual Compatible)</span>
              <p className="text-[11px] text-slate-400">
                يشمل جداول الموظفين، القطاعات الـ 17، الأرصدة والدورات الثلاثية، الأذونات، أجهزة ZKTeco، وسجلات البصمات.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(DATABASE_SQL_SCHEMA, 'sql')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'sql' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'sql' ? 'تم النسخ' : 'نسخ SQL'}</span>
              </button>
              <button
                onClick={() => handleDownloadFile(DATABASE_SQL_SCHEMA, 'schema.sql')}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل ملف SQL</span>
              </button>
            </div>
          </div>
          <pre className="text-xs font-mono overflow-x-auto text-emerald-300 p-4 bg-slate-950 rounded-lg max-h-[600px] leading-relaxed" dir="ltr">
            {DATABASE_SQL_SCHEMA}
          </pre>
        </div>
      )}

      {/* SUB-TAB 2: FASTAPI MAIN.PY */}
      {activeSubTab === 'fastapi' && (
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 text-slate-200 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-xs font-bold text-white font-mono">backend/main.py (FastAPI Application)</span>
              <p className="text-[11px] text-slate-400">
                نقاط النهاية RESTful لإدارة الموظفين، مزامنة ZKTeco، واستدعاء محرك احتساب الإضافي.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(PYTHON_FASTAPI_MAIN, 'fastapi')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'fastapi' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'fastapi' ? 'تم النسخ' : 'نسخ Python'}</span>
              </button>
              <button
                onClick={() => handleDownloadFile(PYTHON_FASTAPI_MAIN, 'main.py')}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل main.py</span>
              </button>
            </div>
          </div>
          <pre className="text-xs font-mono overflow-x-auto text-blue-300 p-4 bg-slate-950 rounded-lg max-h-[600px] leading-relaxed" dir="ltr">
            {PYTHON_FASTAPI_MAIN}
          </pre>
        </div>
      )}

      {/* SUB-TAB 3: ZKTECO_SERVICE.PY */}
      {activeSubTab === 'zkteco' && (
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 text-slate-200 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-xs font-bold text-white font-mono">backend/zkteco_service.py (pyzk Network SDK)</span>
              <p className="text-[11px] text-slate-400">
                الاتصال بالأجهزة عبر TCP Port 4370، قراءة الذاكرة الحية، وسحب الحركات ومطابقتها.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(PYTHON_ZKTECO_SERVICE, 'zkteco')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'zkteco' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'zkteco' ? 'تم النسخ' : 'نسخ pyzk'}</span>
              </button>
              <button
                onClick={() => handleDownloadFile(PYTHON_ZKTECO_SERVICE, 'zkteco_service.py')}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل zkteco_service.py</span>
              </button>
            </div>
          </div>
          <pre className="text-xs font-mono overflow-x-auto text-amber-300 p-4 bg-slate-950 rounded-lg max-h-[600px] leading-relaxed" dir="ltr">
            {PYTHON_ZKTECO_SERVICE}
          </pre>
        </div>
      )}

      {/* SUB-TAB 4: OVERTIME_CALC.PY */}
      {activeSubTab === 'overtime' && (
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 text-slate-200 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-xs font-bold text-white font-mono">backend/overtime_calc.py (SMD Overtime Logic)</span>
              <p className="text-[11px] text-slate-400">
                تطبيق قاعدة الـ 6:00 م الصارمة مع معاملي 1.35 للنهاري و 1.70 لليلي.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(getPythonOvertimeCode(), 'ot')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'ot' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'ot' ? 'تم النسخ' : 'نسخ الكود'}</span>
              </button>
              <button
                onClick={() => handleDownloadFile(getPythonOvertimeCode(), 'overtime_calc.py')}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل overtime_calc.py</span>
              </button>
            </div>
          </div>
          <pre className="text-xs font-mono overflow-x-auto text-emerald-300 p-4 bg-slate-950 rounded-lg max-h-[600px] leading-relaxed" dir="ltr">
            {getPythonOvertimeCode()}
          </pre>
        </div>
      )}

      {/* SUB-TAB 5: SYSTEM ARCHITECTURE DIAGRAM */}
      {activeSubTab === 'architecture' && (
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            المخطط المعماري لنظام SMD على خادم الشركة المحلي (Local Company Server / PC)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            
            {/* Box 1: Edge Biometrics */}
            <div className="p-5 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                <Cpu className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-blue-950 text-sm">1. أجهزة البصمة ZKTeco (الطبقة الميدانية)</h4>
              <p className="text-slate-600 leading-relaxed">
                مثبتة ببوابات مصنع السويس لمشتقات الميثانول والمقر الإداري. تعمل عبر بروتوكول الشبكة TCP/IP Socket (Port 4370) لتخزين حركات البصمات بالذاكرة الداخلية.
              </p>
            </div>

            {/* Box 2: Local Backend Daemon */}
            <div className="p-5 bg-amber-50/50 border border-amber-200 rounded-xl space-y-2">
              <div className="w-10 h-10 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold">
                <Terminal className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-amber-950 text-sm">2. خادم Python الداخلي & pyzk Daemon</h4>
              <p className="text-slate-600 leading-relaxed">
                يعمل كخدمة خلفية (Background Service / Windows Service / Systemd Daemon) يقوم بمسح أجهزة البصمة تلقائياً، واستخراج الحركات الجديدة وتطبيق خوارزمية الـ 6:00 م.
              </p>
            </div>

            {/* Box 3: Storage & Client Web UI */}
            <div className="p-5 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
              <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                <Server className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-emerald-950 text-sm">3. قاعدة البيانات وواجهة React</h4>
              <p className="text-slate-600 leading-relaxed">
                قاعدة بيانات SQLite محلية مدمجة أو PostgreSQL. واجهة الويب التفاعلية تعمل على أي متصفح بالشبكة الداخلية (RTL Arabic) مع ميزات النماذج الذكية والأمان.
              </p>
            </div>

          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <h4 className="text-xs font-bold text-slate-800 mb-2">تعليمات التشغيل السريع على خادم الشركة:</h4>
            <pre className="text-xs font-mono bg-slate-900 text-slate-200 p-3 rounded-lg overflow-x-auto leading-relaxed" dir="ltr">
{`# 1. تثبيت الحزم المطلوبة
pip install -r requirements.txt

# 2. إنشاء قاعدة البيانات وتشغيل الجداول
sqlite3 smd_hr_local.db < schema.sql

# 3. تشغيل خادم FastAPI
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload`}
            </pre>
          </div>

        </div>
      )}

    </div>
  );
};
