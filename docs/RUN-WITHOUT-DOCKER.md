# تشغيل SMD-HR بدون Docker

هذا الدليل يغطي مسارين منفصلين:

1. **وضع التجربة في المتصفح** — بدون خادم إطلاقًا (لتجربة التصميم والتعبئة والطباعة).
2. **تشغيل الـ API الحقيقي محليًا** — Python 3.12 + SQLite على Windows (بدون Docker).

> الوضع الأول **مؤقت للتجربة فقط**. البيانات فيه لا تُعد بيانات الشركة ولا تُستخدم في الإنتاج.
> في صورة الإنتاج يُضبط `VITE_ALLOW_OFFLINE_DEMO=false` فلا يوجد أي تخزين محلي للنماذج.

---

## 1) وضع التجربة في المتصفح (بدون Docker وبدون FastAPI)

### المتطلبات

- Node.js 22+ وnpm 10+.
- متصفح حديث (Chrome/Edge).
- لا حاجة لـ Python أو PostgreSQL أو LibreOffice.

### الخطوات

```powershell
cd "D:\DESK TOP\sa3don\SMD-HR-main\SMD-HR-main"
npm install
npm run dev
```

افتح <http://localhost:3000> ثم:

1. سجّل الدخول بالحساب التجريبي `admin` / `Admin@12345` (أو `hr` / `Hr@12345`).
2. من القائمة اختر **النماذج والمستندات**.
3. سيظهر البانر الأصفر: **«وضع تجربة مؤقت — بيانات محلية على هذا المتصفح فقط»**.
4. ارفع مستندًا (**PDF أو صورة فقط** في هذا الوضع).
5. أنشئ قالبًا من المستند، ثم اضغط أيقونة **تصميم الحقول** لإضافة الحقول وسحبها فوق المستند الأصلي.
6. اضغط أيقونة **الطباعة** بجوار القالب لتعبئة الحقول من بيانات الموظف/الإجازة/الإذن/المأمورية، ثم **حفظ النموذج** أو **طباعة A4**.

### أين تُخزَّن البيانات؟

- في **IndexedDB** داخل المتصفح تحت اسم قاعدة `smd_hr_forms_demo`.
- لا تُرسل لأي خادم ولا تُكتب في `localStorage`.
- تبقى بعد تحديث الصفحة، وتُمسح بزر **«مسح بيانات التجربة»** في البانر أو بمسح بيانات الموقع من المتصفح.

### القيود المعروفة (مقصودة)

| القيد | السبب |
|---|---|
| PDF والصور فقط | تحويل Word/Excel يحتاج LibreOffice على الخادم |
| بيانات الموظفين من وضع العرض المحلي | لا يوجد API، لذا التعبئة التلقائية تعمل على بيانات `9001+` التجريبية |
| لا حفظ مركزي ولا Audit Log | لا توجد قاعدة بيانات |
| الطباعة تعتمد على متصفح الجهاز | تُنتج A4 من المتصفح؛ تصدير PDF على الخادم مرحلة لاحقة |

### إيقاف وضع التجربة

- أثناء التطوير: شغّل الواجهة بـ `VITE_ALLOW_OFFLINE_DEMO=false npm run dev` (PowerShell: `$env:VITE_ALLOW_OFFLINE_DEMO='false'; npm run dev`).
- في الإنتاج: مضبوط مسبقًا في `infra/web/Dockerfile` و`docker-compose.yml`، وتظهر رسالة أن محرك المستندات يحتاج الخادم بدل أي عرض وهمي.

---

## 2) تشغيل الـ API الحقيقي محليًا (Python + SQLite)

هذا هو المسار لاستخدام النظام الفعلي على جهازك قبل الانتقال إلى PostgreSQL/Docker.

### 2.1 تثبيت Python 3.12

- نزّل Python 3.12 من <https://www.python.org/downloads/windows/> وفعّل خيار **Add python.exe to PATH**.
- تحقق:

```powershell
python --version
```

> إذا لم يعمل `python` من PATH، استخدم المسار الكامل. على جهاز التطوير الحالي:
> `C:\Users\rrr\AppData\Local\smd-py312\python.exe`.
> في بقية الخطوات استبدل `python` بذلك المسار إن لزم.

### 2.2 إنشاء بيئة افتراضية وتثبيت الاعتماديات

```powershell
cd "D:\DESK TOP\sa3don\SMD-HR-main\SMD-HR-main\apps\api"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

> إذا منع PowerShell تنفيذ السكربت: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.

### 2.3 ملف الإعدادات المحلي

أنشئ `apps/api/.env` (لا ترفعه للمستودع):

```dotenv
APP_ENV=development
TZ=Africa/Cairo

# مفتاح تطوير فقط — غيّره في الإنتاج
SECRET_KEY=dev-only-change-me-0123456789abcdef0123456789abcdef

# SQLite محليًا (الملف يُنشأ داخل apps/api)
DATABASE_URL=sqlite+pysqlite:///./smd_hr_dev.db

# الواجهة على المنفذ 3000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# مستندات الشركة (خارج مجلد الويب)
STORAGE_DIR=./storage
MAX_UPLOAD_MB=20

DEMO_MODE=true
```

> ملف `.env.example` في جذر المستودع مخصص لـ Docker/PostgreSQL. لا تستخدمه كما هو مع SQLite.

### 2.4 إنشاء الجداول وتعبئة البيانات التجريبية

```powershell
alembic upgrade head
python -m app.seed --profile demo
```

إذا لم يعمل `alembic` أو `python -m app.seed` (بيئة embeddable):

```powershell
python -m alembic upgrade head
python -c "import sys; sys.path.insert(0,'.'); sys.argv=['seed','--profile','demo']; from app.seed import main; main()"
```

إن ظهرت مشكلة ترميز في PowerShell:

```powershell
$env:PYTHONIOENCODING='utf-8'
```

### 2.5 تشغيل الخادم

```powershell
uvicorn app.main:app --reload --port 8000
```

أو إن لم يُعرف الأمر:

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

تحقق من:

- الصحة: <http://127.0.0.1:8000/api/health>
- التوثيق التفاعلي: <http://127.0.0.1:8000/api/docs>

### 2.6 تشغيل الواجهة وربطها بالخادم

في نافذة PowerShell أخرى:

```powershell
cd "D:\DESK TOP\sa3don\SMD-HR-main\SMD-HR-main"
npm install
npm run dev
```

- الواجهة: <http://localhost:3000>
- Vite يمرر `/api` تلقائيًا إلى `http://127.0.0.1:8000` (انظر `vite.config.ts`).
- سجّل الدخول بـ `admin` / `Admin@12345`.
- ستجد تبويب **النماذج والمستندات** يعمل على الخادم (بدون بانر التجربة)، ويمكنك رفع PDF/Word/Excel/صور، والتصميم، والتعبئة، والطباعة، وحفظ النماذج في قاعدة البيانات.

### 2.7 تحويل Word/Excel محليًا

- على Windows ثبّت **LibreOffice** (وليس فقط Microsoft Office).
- إذا لم يكن `soffice` على PATH، اضبط في `.env`:

```dotenv
LIBREOFFICE_BIN=C:\Program Files\LibreOffice\program\soffice.exe
```

- بدونه يبقى رفع PDF والصور متاحًا، ويُرفض تحويل Word/Excel برسالة واضحة.

### 2.8 إيقاف/إعادة ضبط البيانات المحلية

- لإيقاف الخادم: `Ctrl+C`.
- لحذف بيانات التجربة فقط مع بقاء الجداول:

```powershell
python -m app.seed --reset
```

- لبداية نظيفة تمامًا: أوقف الخادم ثم احذف `apps/api/smd_hr_dev.db` ومجلد `apps/api/storage`، ثم أعد `alembic upgrade head` و`python -m app.seed --profile demo`.

### 2.9 لاحقًا: PostgreSQL بدل SQLite

غيّر `DATABASE_URL` في `apps/api/.env` إلى:

```dotenv
DATABASE_URL=postgresql+psycopg://smd:change-me@127.0.0.1:5432/smd_hr
```

ثم `alembic upgrade head` و`python -m app.seed --profile demo`. هذا يقربك من إعداد الإنتاج بدون تغيير الكود.

---

## 3) استكشاف الأخطاء

| العَرَض | السبب المحتمل | الحل |
|---|---|---|
| `'uvicorn' is not recognized` | البيئة الافتراضية غير مفعّلة أو Scripts ليست على PATH | فعّل `.venv` أو استخدم `python -m uvicorn ...` |
| `'alembic' is not recognized` | نفس السبب | `python -m alembic upgrade head` |
| الواجهة تعرض 502 على `/api` | الـ API غير مشغّل أو على منفذ آخر | شغّل uvicorn على 8000 أو اضبط `API_PROXY_TARGET` |
| `CORS` أو فشل طلبات من 127.0.0.1 | الأصل غير مسموح | أضف `http://127.0.0.1:3000` إلى `CORS_ORIGINS` |
| `database is locked` | أكثر من عملية تكتب على SQLite | أوقف العمليات الأخرى، أو استخدم PostgreSQL |
| فشل `pip install psycopg[binary]` | لا تحتاجه مع SQLite | تجاهله محليًا أو ثبّت ملحقات Visual C++ |
| تحويل Word/Excel يفشل | LibreOffice غير مثبت أو المسار خطأ | ثبّت LibreOffice واضبط `LIBREOFFICE_BIN` |
| ملف SQLite لا يظهر | `DATABASE_URL` نسبي لـ `apps/api` | ابحث عن `apps/api/smd_hr_dev.db` |
| `UnicodeEncodeError` عند الـ seed | ترميز PowerShell | `$env:PYTHONIOENCODING='utf-8'` |

---

## 4) ملاحظات أمان

- `SECRET_KEY` أعلاه **للتطوير فقط**؛ في الإنتاج استخدم `openssl rand -hex 32`.
- لا تضع بيانات موظفين حقيقية في المستودع أو في وضع التجربة.
- SQLite مناسب لجهاز واحد وتجربة محلية؛ الإنتاج يستخدم PostgreSQL ونسخًا احتياطيًا مجدولًا.
- مستندات الشركة تُخزَّن تحت `STORAGE_DIR` وتُقدَّم فقط عبر endpoint محمي بالجلسة.
