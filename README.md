# SMD-HR — نظام إدارة الموارد البشرية والحضور

> **شركة السويس لمشتقات الميثانول (SMD) — الإدارة العامة للموارد البشرية**
> Suez Methanol Derivatives Co. — HR & Attendance Management System

---

## نظرة عامة

نظام داخلي لإدارة:

- بيانات الموظفين والأقسام (17 إدارة/قطاع).
- الحضور والانصراف والورديات (عادي / نهاري / ليلي).
- حساب الوقت الإضافي بفاصل الساعة 6:00 مساءً (1.35 نهارًا / 1.70 ليلًا).
- الإجازات والأرصدة (سنوي / عارضة / مرضي بدورة 3 سنوات).
- الأذونات والمأموريات والبدلات.
- رفع نماذج الشركة الرسمية وعرضها كما هي وتعبئتها ببيانات الموظف.
- التقارير التحليلية والتصدير إلى Excel وPDF.
- تكامل أجهزة البصمة ZKTeco عبر الشبكة المحلية.

**الواجهة:** عربية بالكامل (RTL).

---

## الوضع الحالي

> ✅ المراحل 0–7 مكتملة، ومعها **ONLYOFFICE Phase 3 (Waves A/B/C) + Phase 4** و**المرحلتان B وC** مكتملة ومُلتزمة في Git. النظام جاهز للتشغيل الإنتاجي عبر Docker؛ يتبقى التحقق التشغيلي والربط النهائي المذكور في `tasks.md`.

- **الباك إند جاهز** في `apps/api`: FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL 16، مصادقة JWT (argon2)، أدوار، Audit Log، واختبارات `pytest` (**216/216** بعد موجات ONLYOFFICE الثلاث والمرحلة B).
- **Docker جاهز**: `docker-compose.yml` يشغّل `db` + `api` + `web` (nginx) + `worker` (مزامنة ZKTeco + نسخ احتياطي مجدول) + `onlyoffice` (ONLYOFFICE Document Server، داخلي فقط)، بصور متعددتي المراحل وhealthchecks وvolumes دائمة.
- **الواجهة مربوطة بالـ API** (المرحلة 3): تسجيل الدخول، الموظفون، الحضور، الإجازات والأرصدة، الأذونات والمأموريات — كلها عبر `/api`. اختبارات الواجهة: **94/94 Vitest** + **21/21 Playwright**.
- **المرحلة B مكتملة**: إعدادات `work_settings` هي المصدر الفعلي لحساب الإضافي في `apps/api/app/services/overtime.py`، وتستهلكها الحاسبة عبر `/api/settings/work` و`useWorkSettings.ts`، ويستخدمها `attendance_processor.py` للمزامنات والحسابات القادمة. تعديل الفاصل أو المعاملات ينعكس فورًا دون تغيير القيم المعتمدة.
- **قواعد العمل والتقارير** (المرحلة 6): دورة اعتماد الإجازات `قيد المراجعة → معتمد/مرفوض` بصلاحية `ADMIN/HR` فقط، خصم الرصيد مرة واحدة عند الاعتماد، منع التداخل، حدود الأذونات (ساعتان للشخصي + 4 ساعات يوميًا) وبدلات المأموريات، ومركز تقارير (حضور/إجازات/إضافي/قطاعي) بتصدير Excel وطباعة A4 عربية RTL.
- **محرك المستندات** (المرحلة 4.1 + 4.2): رفع نماذج الشركة الأصلية (PDF/Word/Excel/صور) وتحويلها إلى PDF على الخادم، مع مكتبة وعارض صفحات (`pdf.js`) وقوالب مرتبطة بالمستند، **مصمم حقول مرئي** (سحب/تحجيم + ربط ببيانات الموظف/الإجازة/المأمورية)، و**وضع تعبئة وطباعة A4**. أُضيف لاحقًا **مولّد لقطة PDF عربية** على الخادم (`apps/api/app/services/render.py`) مع إصدارات المستند وإعادة محاولة في `worker`.
- **ONLYOFFICE Phase 3/4 مكتمل لكن معطّل افتراضيًا**: نقاط `/api/office/*`، إصدارات المستندات، لقطة Submission، غلاف المحرر `OfficeEditor.tsx`، شاشة «إعدادات الورديات»، بطاقة حالة الترخيص، وتقييد تبويب «المعمارية» لـ `ADMIN`. المفتاحان `ONLYOFFICE_ENABLED=false` و`VITE_ONLYOFFICE_ENABLED=false`، والمعاينة القديمة (Overlay / PDF.js / `FormDesigner` / `SmartForms` / `formFileParser`) ما زالت هي المسار الافتراضي والـ fallback.
- **الترخيص**: ملف `license.json` موقّع اختياريًا هو المصدر الفعلي، مع CLI و`GET /api/license/status`. التفاصيل وخطوات التفعيل في قسم «الترخيص والحقوق» أسفل هذا الملف.
- **وضع التجربة بدون خادم** (`VITE_ALLOW_OFFLINE_DEMO`): عند عدم تشغيل الـ API تعمل مكتبة المستندات في **وضع تجربة مؤقت** يخزّن الملفات والقوالب والنماذج في IndexedDB داخل المتصفح، مع بانر دائم يوضح أن البيانات محلية وليست رسمية. يدعم PDF/الصور فقط (لا LibreOffice في المتصفح). يُعطَّل هذا الوضع في صورة الإنتاج (`false`) فلا يوجد أي fallback محلي.
- **مزامنة ZKTeco** (المرحلة 5 – مكتملة): موصل خادم `apps/api/app/services/zkteco.py` عبر `pyzk` يفتح TCP/IP من الخادم فقط، مع اختبار اتصال، مزامنة يدوية، منع تكرار البصمات، وسجل مزامنة معروض في الشاشة. `comm_key` يُحفظ على الخادم ولا يُرجع أبدًا.
  - **جدولة تلقائية** كل `ZK_SYNC_INTERVAL_MINUTES` (10 افتراضيًا) عبر `apps/api/app/services/scheduler.py` داخل `asyncio.to_thread` دون حجب الخادم؛ تتجاهل الأجهزة التجريبية وتتوقف في بيئة الاختبار.
  - **تحويل الحركات إلى حضور** عبر `apps/api/app/services/attendance_processor.py`: أول بصمة دخول وآخر بصمة خروج، دعم الوردية الليلية 20:00→08:00، ومنع تكرار سجل `(employee_id, date)` مع عدم استبدال السجلات اليدوية.
  - **تقرير بصمات غير معروفة** (تبويب في شاشة ZKTeco): ربط الـ PIN بموظف أو تجاهله عبر `/api/devices/unknown-punches`.
  - يتطلب تثبيت `pyzk==0.9` على مضيف الـ API (مضاف في `apps/api/requirements.txt`). الاستيراد كسول، لذا يعمل الـ API ووضع العرض بدونه، ويظهر خطأ عربي `CONNECTOR_UNAVAILABLE` عند محاولة الاتصال.

راجع `docs/PLAN.md` للخطة الكاملة، و`tasks.md` للمراحل المتبقية، و`docs/ONLYOFFICE-PHASE4-REPORT.md` لتقرير آخر مرحلة منفذة.

---

## التقنيات

| الطبقة | التقنية |
|---|---|
| الواجهة | React 19, TypeScript, Vite, Tailwind CSS 4 |
| الأيقونات | lucide-react |
| الملفات | SheetJS (xlsx), mammoth, pdf.js |
| الباك إند | FastAPI, SQLAlchemy 2, Alembic, Pydantic, psycopg 3 |
| قاعدة البيانات | PostgreSQL 16 |
| المصادقة | JWT + argon2 (`pwdlib`) |
| تكامل البصمة | Python + pyzk |
| التشغيل | Docker Compose على Windows (WSL2) |
| الاختبارات | Vitest, Pytest, Playwright |

---

## المتطلبات

- Node.js LTS (22 أو أحدث)
- npm 10+
- Python 3.12 (للباك إند عند التشغيل المحلي بدون Docker)
- Docker Desktop أو Docker Engine داخل WSL2 (للتشغيل الكامل)
- Git
- متصفح حديث (Chrome/Edge)

---

## التشغيل السريع (واجهة فقط — الوضع الحالي)

```bash
npm install
npm run dev
```

ثم افتح: <http://localhost:3000>

### أوامر متاحة

```bash
npm run dev      # تشغيل التطوير على المنفذ 3000
npm run build    # بناء الإنتاج إلى dist/
npm run preview  # معاينة بناء الإنتاج
npm run lint     # فحص TypeScript (tsc --noEmit)
npm test         # اختبارات الوحدة (Vitest)
npx playwright test  # اختبارات E2E
```

> بدون خادم API تعمل الواجهة في **وضع العرض المحلي التجريبي** (بانر واضح) والبيانات من `initialData` في الذاكرة/المتصفح. في الإنتاج `VITE_ALLOW_OFFLINE_DEMO=false` فلا يوجد أي fallback محلي.
>
> لتجربة **محرك المستندات** (رفع → تصميم → تعبئة → طباعة) بدون Docker أو FastAPI، راجع [docs/RUN-WITHOUT-DOCKER.md](docs/RUN-WITHOUT-DOCKER.md) قسم «وضع التجربة في المتصفح».

---

## التشغيل الكامل (Docker — الوضع الإنتاجي)

```bash
cp .env.example .env          # عدّل SECRET_KEY و POSTGRES_PASSWORD على الأقل
docker compose up -d --build
docker compose ps             # db/api/web/worker/onlyoffice بحالة healthy/up
```

- الواجهة: <http://localhost>
- API Docs: <http://localhost/api/docs>
- الصحة: <http://localhost/api/health>

> عند كل إقلاع تنتظر حاوية `api` قاعدة البيانات ثم تنفّذ `alembic upgrade head` تلقائيًا، ثم تبدأ الخدمة.
> خدمة `worker` تبدأ بعد نجاح فحص صحة `api`، وتتولى **مزامنة أجهزة ZKTeco** و**النسخ الاحتياطي اليومي**.
> حاوية `api` مضبوطة بـ `ZK_SYNC_ENABLED=false` حتى لا يسحب جهاز البصمة عاملان في الوقت نفسه.

### محرّر المستندات — ONLYOFFICE (Phase 3/4 مكتمل، الميزة معطّلة افتراضيًا)

حاوية `onlyoffice` مبنية على صورة رسمية مثبّتة (`10.0.0.1`) مع خط **Cairo** العربي،
ولا تنشر أي منفذ على المضيف: الوصول الوحيد عبر `http://<host>/onlyoffice/` (نفس الأصل،
مع تمرير WebSocket). اكتملت المرحلة الثالثة (الباك إند: الإصدارات، الجلسات، التوقيع،
اللقطة) والمرحلة الرابعة (الواجهة: زر التحرير، إعدادات الورديات، بطاقة الترخيص)، لكن
**الميزة ما زالت معطّلة افتراضيًا**. لا تظهر أزرار التحرير إلا عند تفعيل
`ONLYOFFICE_ENABLED=true` **و** `VITE_ONLYOFFICE_ENABLED=true` مع تشغيل `onlyoffice`
و`api` و`web`، ونجاح `GET /api/office/status`. عند تعطيل أي مفتاح أو فشل تحميل
المحرر يعود النظام تلقائيًا إلى المعاينة القديمة دون حذفها.

```bash
docker compose up -d --build onlyoffice web
docker compose ps onlyoffice
docker compose exec onlyoffice curl -fsS http://127.0.0.1/healthcheck     # true
curl -fsS http://localhost/onlyoffice/healthcheck                         # true عبر nginx
docker compose exec onlyoffice fc-list | grep -i cairo                    # Cairo Regular/Bold
```

> `ONLYOFFICE_JWT_SECRET` **إلزامي** في `.env` (32 حرفًا على الأقل)؛ بدونه يرفض
> Compose الإقلاع. بعد إعادة إنشاء حاوية `onlyoffice` أعد تشغيل `web` (`docker compose
> restart web`) لأن nginx يحل اسم الخدمة عند الإقلاع فقط.
> الدليل التفصيلي والتحقق الكامل: [docs/ONLYOFFICE-PHASE2-INFRA.md](docs/ONLYOFFICE-PHASE2-INFRA.md).
> تحقق آلي سريع (للقراءة فقط): `powershell -ExecutionPolicy Bypass -File infra\scripts\verify-phase2.ps1`.
> تقرير المرحلة 3: [docs/ONLYOFFICE-PHASE3-REPORT.md](docs/ONLYOFFICE-PHASE3-REPORT.md) ·
> تقرير المرحلة 4: [docs/ONLYOFFICE-PHASE4-REPORT.md](docs/ONLYOFFICE-PHASE4-REPORT.md) ·
> نموذج البيانات: [docs/ONLYOFFICE-PHASE3-DATA-MODEL.md](docs/ONLYOFFICE-PHASE3-DATA-MODEL.md) ·
> مهام ONLYOFFICE: [docs/ONLYOFFICE-PHASE3-TASKS.md](docs/ONLYOFFICE-PHASE3-TASKS.md).

**نقاط API الحديثة (تتطلب تسجيل دخول):**

| النقطة | الغرض |
|---|---|
| `GET /api/office/status` | فحص جاهزية المحرر والصلاحية |
| `GET /api/office/config/{file_id}` | إعداد موقّع لتحميل المحرر |
| `GET /api/office/files/{file_id}/versions` | قائمة إصدارات المستند |
| `POST /api/office/files/{file_id}/sessions/close` | إغلاق جلسة التحرير |
| `GET /api/forms/submissions/{id}` / `.../document` | حالة اللقطة / لقطة PDF بصيغة `no-store` |
| `GET /api/settings/work` · `PATCH /api/settings/work` | قراءة/تحديث إعدادات الورديات (`ADMIN`/`HR`) |
| `GET /api/license/status` | حالة الترخيص بدون أسرار |

> صلاحيات التحرير الفعلية على الخادم: `ADMIN` و`HR` فقط (`DOCUMENT_EDITOR_ROLES`)؛
> الواجهة تعرض زر التحرير لهذين الدورين، بينما يبقى الخادم هو المرجع النهائي.

### أوامر التشغيل اليومية

```bash
docker compose logs -f api worker       # متابعة السجلات
docker compose restart api worker       # إعادة تشغيل آمنة
docker compose down                     # إيقاف مع الاحتفاظ بالبيانات
docker compose exec api python -m app.seed --profile demo   # بيانات تجريبية
docker compose exec api python -m app.seed --reset-demo     # حذف التجريبي فقط
```

### ملاحظات النشر على جهاز الشركة

1. ثبّت **WSL2 + Docker Engine** (أو Docker Desktop مع مراعاة ترخيصه).
2. خصّص **IP ثابتًا** للجهاز، وافتح منفذ `WEB_PORT` (افتراضيًا 80) في جدار الحماية للشبكة الداخلية فقط.
3. غيّر كلمات مرور الحسابات التجريبية و`SECRET_KEY` و`POSTGRES_PASSWORD` قبل التشغيل.
4. استخدم UPS للجهاز، وفعّل `restart: unless-stopped` (مضبوط مسبقًا).
5. نفّذ **اختبار استعادة نسخة احتياطية فعلي** قبل التسليم.

> **بدون Docker؟** يمكن تشغيل الـ API محليًا بـ Python 3.12 وSQLite. الخطوات الكاملة في [docs/RUN-WITHOUT-DOCKER.md](docs/RUN-WITHOUT-DOCKER.md).

### بيانات الدخول التجريبية

| المستخدم | كلمة المرور | الدور |
|---|---|---|
| `admin` | `Admin@12345` | مدير النظام |
| `hr` | `Hr@12345` | موارد بشرية |
| `viewer` | `Viewer@12345` | قراءة فقط |

> **مهم:** غيّر كلمات المرور قبل التسليم النهائي.

---

## البيانات التجريبية

- تُنشأ عبر `seed_demo` بأكواد موظفين تبدأ من `9001`.
- يمكن حذفها بالكامل دون المساس بالبيانات الحقيقية:

```bash
docker compose exec api python -m app.seed --reset-demo
```

- البيانات الحقيقية تُستورد لاحقًا من ملف Excel عبر: `الإعدادات → استيراد الموظفين`.

---

## بنية المشروع

```
.
├── apps/
│   └── api/                  # FastAPI: app/, alembic/, tests/, Dockerfile (multi-stage)
│       └── app/
│           ├── worker.py     # مزامنة ZKTeco + نسخ احتياطي مجدول
│           ├── services/backup.py
│           └── routers/license.py
├── infra/
│   ├── nginx/default.conf    # SPA + proxy /api + virtual path /onlyoffice
│   ├── onlyoffice/           # صورة DS مخصّصة + خطوط Cairo (Regular/Bold)
│   └── web/Dockerfile        # بناء الواجهة + nginx (multi-stage)
├── docker-compose.yml        # db + api + web + worker + onlyoffice
├── docs/                     # الخطة وأدلة النشر
├── public/                   # الأصول العامة (الشعار)
├── src/                      # الواجهة الحالية (المصدر الفعلي للواجهة)
├── tasks.md                  # سجل المراحل المتبقية (يُحدَّث بعد كل مرحلة)
├── tests/                    # Vitest + Playwright
├── AGENTS.md                 # قواعد العمل للمطورين والوكلاء
└── README.md
```

> ملاحظة: الواجهة ما زالت في `src/` بالجذر وهي المصدر المستخدم فعليًا في بناء `web`. مجلد `apps/web/` غير مستخدم حاليًا؛ نقل الواجهة إليه مؤجل لتجنّب إعادة كتابة المسارات، ولا يدخل ضمن المراحل المتبقية في `tasks.md`.

---

## الإعدادات (`.env`)

| المتغير | الوصف | مثال |
|---|---|---|
| `APP_ENV` | بيئة التشغيل | `production` |
| `APP_URL` | عنوان الواجهة | `http://smd-hr.local` |
| `DATABASE_URL` | اتصال PostgreSQL | `postgresql+psycopg://smd:pass@db:5432/smd_hr` |
| `POSTGRES_PASSWORD` | كلمة مرور قاعدة البيانات (Compose) | — |
| `SECRET_KEY` | مفتاح الجلسات (32+ حرفًا) | — |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | صلاحية الجلسة | `480` |
| `TZ` | المنطقة الزمنية | `Africa/Cairo` |
| `WEB_PORT` | منفذ الواجهة على الجهاز | `80` |
| `SEED_DEMO_ON_START` | تعبئة بيانات تجريبية عند الإقلاع | `false` |
| `VITE_ALLOW_OFFLINE_DEMO` | السماح بوضع العرض المحلي عند تعذّر API (يجب أن يبقى `false` في الإنتاج) | `false` |
| `STORAGE_DIR` | مسار تخزين الملفات | `/data/uploads` |
| `MAX_UPLOAD_MB` | حد حجم الملف | `20` |
| `ZK_SYNC_INTERVAL_MINUTES` | فترة المزامنة التلقائية بالدقائق (الحد الأدنى دقيقة) | `10` |
| `ZK_SYNC_ENABLED` | تشغيل/إيقاف الجدولة التلقائية (تُعطّل تلقائيًا في `APP_ENV=test`) | `true` |
| `ZK_TIMEOUT_SECONDS` | مهلة الاتصال بجهاز البصمة بالثواني | `15` |
| `WORKER_TICK_SECONDS` | دورة فحص العامل الخلفي (ثوانٍ) | `60` |
| `BACKUP_DIR` | مسار النسخ الاحتياطي داخل Volume | `/backups` |
| `BACKUP_ENABLED` | تشغيل النسخ المجدول في `worker` | `true` |
| `BACKUP_INTERVAL_HOURS` | الفاصل بين النسخ (ساعات) | `24` |
| `BACKUP_RETENTION_DAYS` | الاحتفاظ بالنسخ قبل التقليم (أيام) | `30` |
| `PG_DUMP_BIN` | مسار/اسم أداة `pg_dump` | `pg_dump` |
| `PERMIT_PERSONAL_MAX_HOURS` | حد الإذن الشخصي اليومي | `2` |
| `PERMIT_WORK_MAX_HOURS` | حد إذن العمل | `4` |
| `PERMIT_DAILY_MAX_HOURS` | إجمالي الأذونات لكل موظف في اليوم | `4` |
| `MISSION_MAX_DAYS` | أقصى مدة مأمورية | `60` |
| `MISSION_DEFAULT_ALLOWANCE_PER_DAY` | البدل اليومي الافتراضي | `450` |
| `MISSION_MAX_ALLOWANCE_PER_DAY` | أقصى بدل يومي مسموح | `2000` |
| `ONLYOFFICE_ENABLED` | تفعيل نقاط المحرر على الخادم (افتراضيًا معطّل) | `false` |
| `ONLYOFFICE_JWT_SECRET` | سر مشترك مع Document Server (32+ حرفًا؛ إلزامي لـ Compose حتى مع إيقاف الميزة) | — |
| `VITE_ONLYOFFICE_ENABLED` | إظهار أزرار المحرر في الواجهة (يُبنى داخل صورة `web`) | `false` |
| `SUBMISSION_SNAPSHOT_ENABLED` | توليد لقطة PDF لطلبات النماذج | `true` |
| `LICENSE_FILE` | مسار الملف محليًا؛ Compose يثبّته داخل الحاوية على `/app/license.json` | `./license.json` |
| `LICENSE_SIGNING_KEY` | مفتاح HMAC لتوقيع/تحقق `license.json`؛ وَلّده بـ `openssl rand -hex 32` (لا يُعرض ولا يُسجَّل) | `""` |
| `LICENSE_HARDWARE_ID` | بصمة العتاد (64 hex) من `python -m app.cli.license hardware-id` | `""` |
| `LICENSE_KEY` | توافق قديم: يُستخدم فقط إذا لم يوجد `license.json` | — |
| `LICENSE_EXPIRES_ON` | توافق قديم: تاريخ ISO عند استخدام `LICENSE_KEY` | `2027-12-31` |
| `LICENSE_ENFORCE` | منع إقلاع API عند `expired`/`invalid`/`hardware_mismatch` | `false` |

> لا تُرفع ملفات `.env` إلى Git أبدًا. كذلك `license.json` و`LICENSE_SIGNING_KEY`
> مستبعدان صراحةً عبر `.gitignore`.

---

## النسخ الاحتياطي والاستعادة

### نسخ تلقائي (worker)

- خدمة `worker` تنفّذ `pg_dump` عند الإقلاع ثم كل `BACKUP_INTERVAL_HOURS` (24 ساعة افتراضيًا).
- النسخ تُكتب في Volume `backups` داخل الحاوية على المسار `/backups`.
- تُحذف النسخ الأقدم من `BACKUP_RETENTION_DAYS` تلقائيًا.
- إذا لم يتوفر `pg_dump` أو كانت القاعدة SQLite، يسجّل العامل تحذيرًا واضحًا ويستمر في العمل (لا يتوقف النظام).

```bash
# عرض النسخ داخل الحاوية
docker compose exec worker ls -lh /backups

# نسخة يدوية فورية
docker compose exec worker python -c "from app.services.backup import run_backup; print(run_backup())"

# نسخ مجلد النسخ إلى قرص خارجي (PowerShell على المضيف)
docker cp smd-hr-worker:/backups ./backups-$(Get-Date -Format yyyyMMdd)
```

### استعادة

```bash
# 1) أوقف الكتابة مؤقتًا
docker compose stop api worker

# 2) استعادة أحدث نسخة (اسم الملف من /backups)
docker compose exec -T db psql -U smd -d smd_hr < backup_YYYYMMDD_HHMMSS.sql

# 3) أعد التشغيل
docker compose start api worker
```

- **اختبر الاستعادة فعليًا** على جهاز الشركة قبل التسليم.
- يُنصح بـ UPS للجهاز وبنسخة أسبوعية على قرص خارجي/مشاركة شبكة.
- النسخ تحتوي بيانات شخصية: انقلها واحفظها بشكل آمن ومشفّر.

---

## الاختبارات

```bash
npm run lint                 # فحص الأنواع (tsc --noEmit)
npm test                     # اختبارات الوحدة (Vitest) — 94/94 في 12 ملفًا
npx playwright test          # اختبارات E2E — 21/21
npx playwright show-report   # تقرير HTML

# الباك إند
cd apps/api
python -m pytest -o addopts= -q --tb=short   # 216/216 (SQLite in-memory)
```

> اختبارات التقارير (`tests/unit/reports.spec.ts`) تغطي تجميعات الحضور والإجازات والإضافي وحصر الفترة/الإدارة/الحالة. اختبارات `leave-approval.spec.ts` تغطي دورة الاعتماد والرفض مع السبب.
> تحقق Docker (`docker compose up -d --build`) يتم على جهاز به Docker Desktop/WSL2 ضمن UAT.

---

## استكشاف الأعطال

| المشكلة | الحل |
|---|---|
| الواجهة لا تعمل على 3000 | تأكد أن المنفذ غير مستخدم: `netstat -ano | findstr :3000` |
| فشل `npm install` | استخدم Node LTS واحذف `node_modules` و`package-lock.json` ثم أعد المحاولة |
| Docker لا يبدأ على Windows | فعّل WSL2 من PowerShell كمسؤول: `wsl --install` |
| لا يمكن الوصول من أجهزة الشبكة | افتح منفذ 80 في جدار الحماية وحدد IP ثابتًا |
| المستندات لا تظهر | تحقق من التحويل إلى PDF ومن مساحة القرص |

---

## المساهمة

1. اقرأ `AGENTS.md` قبل أي تعديل، و`tasks.md` لمعرفة المرحلة الحالية.
2. الفرع `main` هو الفرع الحي حاليًا، والعمل يُدمج فيه مباشرة بطلب صريح من مالك المشروع (كما جرى في Phase 3/4). فروع `develop`/`feature/<name>` اختيارية عند العمل الجماعي أو عند طلب المالك.
3. نفّذ `npm run lint` و`npm test` و`pytest` قبل الـ commit.
4. لا تُضف بيانات حقيقية أو أسرارًا أو `license.json` إلى المستودع.

---

## الترخيص والحقوق

> **الترخيص لم يعد Placeholder.** المصدر الفعلي هو ملف `license.json` موقّع اختياريًا
> (HMAC-SHA256) يقرأه الخادم عند الإقلاع. لا يوجد جدول ترخيص في قاعدة البيانات، ولا
> يُعرض أي سر أو مسار تخزين أو بصمة كاملة في API أو السجلات، ولا يوجد قفل في الواجهة.

### الحالات والوضع

- `GET /api/license/status` (يتطلب تسجيل دخول) يُرجع:
  `unconfigured`, `invalid`, `hardware_mismatch`, `not_yet_valid`, `expiring`, `expired`, `active`،
  مع `source = file | env | none` و`enforced`.
- `mode = demo | production` يأتي من `DEMO_MODE`، وليس من صحة الترخيص.
- `LICENSE_ENFORCE=false` افتراضيًا: لا يمنع أي طلب حتى لو كان الترخيص منتهيًا.
- عند `LICENSE_ENFORCE=true` يفشل إقلاع `api` فقط في الحالات:
  `expired`, `invalid`, `hardware_mismatch`. حالات `expiring` و`not_yet_valid` تظهر تحذيرًا دون حجب.
- حقل `features` داخل الملف مقبول ومحفوظ، لكنه **لا يُفعّل gating لميزات بعينها حاليًا**؛ الترخيص يفتح النظام ككل.
- إن لم يوجد `license.json`، يبقى التوافق القديم مع `LICENSE_KEY` / `LICENSE_EXPIRES_ON` يعمل (`source="env"`).

### تفعيل الترخيص على جهاز به Docker (المرحلة C)

> `docker-compose.yml` يثبّت ملف `./license.json` الموجود على المضيف كـ **volume للقراءة فقط**
> في خدمتَي `api` و`worker` على المسار `/app/license.json`، ويضبط `LICENSE_FILE=/app/license.json`
> صراحةً. لذلك يبقى الترخيص ساريًا بعد `docker compose down && docker compose up -d --build`
> دون نسخ الملف يدويًا. أنشئ الملف على المضيف قبل أول تشغيل، ولا ترفعه إلى Git.

أوامر CLI (من مجلد `apps/api`، أو داخل الحاوية ببادئة `docker compose exec api ...`):

| الأمر | الغرض |
|---|---|
| `python -m app.cli.license hardware-id` | طباعة بصمة العتاد (64 hex) للخادم الحالي. |
| `python -m app.cli.license generate --client "اسم العميل" --self --expires YYYY-MM-DD --out license.json` | إنشاء ملف ترخيص موقّع؛ `--self` يستخدم `LICENSE_HARDWARE_ID` من `.env`. |
| `python -m app.cli.license verify --file license.json` | التحقق من التوقيع وتاريخ الانتهاء والبصمة وعرض الحالة. |

1. في `.env` اضبط على الأقل `POSTGRES_PASSWORD` و`SECRET_KEY` و`ONLYOFFICE_JWT_SECRET`،
   واترك `LICENSE_ENFORCE=false` و`LICENSE_HARDWARE_ID=""` للتشغيل الأول، ثم:

   ```bash
   docker compose up -d --build
   ```

2. اقرأ بصمة الخادم وثبّتها في `.env`:

   ```bash
   docker compose exec api python -m app.cli.license hardware-id
   ```

   ```env
   LICENSE_HARDWARE_ID=<الhex-الناتج-من-الخطوة-2>
   ```

3. أنشئ الملف على المضيف من مجلد `apps/api`:

   ```bash
   # للإنتاج فقط: openssl rand -hex 32   ثم ضع الناتج في LICENSE_SIGNING_KEY
   python -m app.cli.license generate \
     --client "شركة السويس لمشتقات الميثانول" \
     --self \
     --issued 2026-11-23 \
     --expires 2027-11-23 \
     --out ../../license.json
   ```

   `--self` يقرأ `LICENSE_HARDWARE_ID` من `.env`، ويمكن تمرير `--hardware-id <hex>` بدلًا منه.
   للإنتاج مرّر `--signing-key "<مفتاحك>"` أو اتركه في `LICENSE_SIGNING_KEY`.
   **لا ترفع المفتاح ولا الملف إلى Git** (كلاهما في `.gitignore`).

4. تحقّق من الملف المُركَّب داخل الحاوية ومن حالة API:

   ```bash
   docker compose exec api python -m app.cli.license verify --file /app/license.json
   docker compose exec api python -m app.cli.license hardware-id
   ```

   ثم سجّل الدخول كـ `ADMIN`/`HR` وافحص `GET /api/license/status`؛ يجب أن تظهر `active`.

5. بعد التأكد يمكن تفعيل الفرض:

   ```env
   LICENSE_ENFORCE=true
   ```

   ثم `docker compose up -d --force-recreate api worker`.
   مع `LICENSE_ENFORCE=false` يقلع النظام طبيعيًا ويسجّل تحذيرًا عربيًا عند `expired`
   أو `invalid` أو `hardware_mismatch`. ومع `true` يفشل إقلاع `api` برسالة عربية واضحة
   في هذه الحالات الثلاث فقط؛ `expiring` و`not_yet_valid` لا تمنعان الإقلاع.
   لا تتضمن الرسائل أو السجلات أي مفتاح توقيع أو محتوى الملف.

© 2026 Suez Methanol Derivatives Co. (SMD). جميع الحقوق محفوظة.
الاستخدام داخلي ومخصص للشركة.
