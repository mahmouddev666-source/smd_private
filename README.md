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

> ✅ المراحل 0–7 مكتملة. النظام جاهز للتشغيل الإنتاجي عبر Docker؛ يتبقى فقط التحقق التشغيلي على جهاز الشركة (UAT + استعادة نسخة فعلية + بصمة حقيقية) ضمن تسليم المرحلة 8.

- **الباك إند جاهز** في `apps/api`: FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL 16، مصادقة JWT (argon2)، أدوار، Audit Log، واختبارات `pytest` (86/86).
- **Docker جاهز**: `docker-compose.yml` يشغّل `db` + `api` + `web` (nginx) + `worker` (مزامنة ZKTeco + نسخ احتياطي مجدول) + `onlyoffice` (ONLYOFFICE Document Server، داخلي فقط)، بصور متعددتي المراحل وhealthchecks وvolumes دائمة.
- **الواجهة مربوطة بالـ API** (المرحلة 3): تسجيل الدخول، الموظفون، الحضور، الإجازات والأرصدة، الأذونات والمأموريات — كلها عبر `/api`. اختبارات: 73/73 Vitest + 21/21 Playwright.
- **قواعد العمل والتقارير** (المرحلة 6): دورة اعتماد الإجازات `قيد المراجعة → معتمد/مرفوض` بصلاحية `ADMIN/HR` فقط، خصم الرصيد مرة واحدة عند الاعتماد، منع التداخل، حدود الأذونات (ساعتان للشخصي + 4 ساعات يوميًا) وبدلات المأموريات، ومركز تقارير (حضور/إجازات/إضافي/قطاعي) بتصدير Excel وطباعة A4 عربية RTL.
- **محرك المستندات** (المرحلة 4.1 + 4.2): رفع نماذج الشركة الأصلية (PDF/Word/Excel/صور) وتحويلها إلى PDF على الخادم، مع مكتبة وعارض صفحات (`pdf.js`) وقوالب مرتبطة بالمستند، **مصمم حقول مرئي** (سحب/تحجيم + ربط ببيانات الموظف/الإجازة/المأمورية)، و**وضع تعبئة وطباعة A4**.
- **وضع التجربة بدون خادم** (`VITE_ALLOW_OFFLINE_DEMO`): عند عدم تشغيل الـ API تعمل مكتبة المستندات في **وضع تجربة مؤقت** يخزّن الملفات والقوالب والنماذج في IndexedDB داخل المتصفح، مع بانر دائم يوضح أن البيانات محلية وليست رسمية. يدعم PDF/الصور فقط (لا LibreOffice في المتصفح). يُعطَّل هذا الوضع في صورة الإنتاج (`false`) فلا يوجد أي fallback محلي.
- **مزامنة ZKTeco** (المرحلة 5 – مكتملة): موصل خادم `apps/api/app/services/zkteco.py` عبر `pyzk` يفتح TCP/IP من الخادم فقط، مع اختبار اتصال، مزامنة يدوية، منع تكرار البصمات، وسجل مزامنة معروض في الشاشة. `comm_key` يُحفظ على الخادم ولا يُرجع أبدًا.
  - **جدولة تلقائية** كل `ZK_SYNC_INTERVAL_MINUTES` (10 افتراضيًا) عبر `apps/api/app/services/scheduler.py` داخل `asyncio.to_thread` دون حجب الخادم؛ تتجاهل الأجهزة التجريبية وتتوقف في بيئة الاختبار.
  - **تحويل الحركات إلى حضور** عبر `apps/api/app/services/attendance_processor.py`: أول بصمة دخول وآخر بصمة خروج، دعم الوردية الليلية 20:00→08:00، ومنع تكرار سجل `(employee_id, date)` مع عدم استبدال السجلات اليدوية.
  - **تقرير بصمات غير معروفة** (تبويب في شاشة ZKTeco): ربط الـ PIN بموظف أو تجاهله عبر `/api/devices/unknown-punches`.
  - يتطلب تثبيت `pyzk==0.9` على مضيف الـ API (مضاف في `apps/api/requirements.txt`). الاستيراد كسول، لذا يعمل الـ API ووضع العرض بدونه، ويظهر خطأ عربي `CONNECTOR_UNAVAILABLE` عند محاولة الاتصال.

راجع `docs/PLAN.md` أو خطة التنفيذ لمزيد من التفاصيل.

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
- Python 3.12 (للباك إند لاحقًا)
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

### محرّر المستندات — ONLYOFFICE (بنية تحتية جاهزة، الميزة معطّلة)

حاوية `onlyoffice` مبنية على صورة رسمية مثبّتة (`10.0.0.1`) مع خط **Cairo** العربي،
ولا تنشر أي منفذ على المضيف: الوصول الوحيد عبر `http://<host>/onlyoffice/` (نفس الأصل،
مع تمرير WebSocket). وجودها الآن لا يغيّر سلوك النظام؛ أزرار التحرير تظهر فقط عند
تفعيل `ONLYOFFICE_ENABLED=true` + `VITE_ONLYOFFICE_ENABLED=true` بعد اكتمال المرحلة 3.

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
> خطة المرحلة 3: [docs/ONLYOFFICE-PHASE3-TASKS.md](docs/ONLYOFFICE-PHASE3-TASKS.md) ·
> نموذج البيانات للمراجعة: [docs/ONLYOFFICE-PHASE3-DATA-MODEL.md](docs/ONLYOFFICE-PHASE3-DATA-MODEL.md).

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
├── src/                      # الواجهة الحالية (سيتم نقلها إلى apps/web)
├── tests/                    # Vitest + Playwright
├── AGENTS.md                 # قواعد العمل للمطورين والوكلاء
└── README.md
```

> ملاحظة: الواجهة ما زالت في `src/` بالجذر. نقلها إلى `apps/web/` مؤجل حتى يكتمل ربط الـ API (المرحلة 3) لتجنّب إعادة كتابة المسارات مرتين.

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
| `LICENSE_KEY` | مفتاح الترخيص (اختياري — عرض حالة فقط) | — |
| `LICENSE_EXPIRES_ON` | تاريخ انتهاء الترخيص ISO | `2027-12-31` |
| `LICENSE_ENFORCE` | فرض الترخيص (يبقى `false` حتى تفعيل ترخيص موقّع) | `false` |

> لا تُرفع ملفات `.env` إلى Git أبدًا.

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
npm run lint                 # فحص الأنواع
npm test                     # اختبارات الوحدة (Vitest) — 73/73
npx playwright test          # اختبارات E2E — 21/21
npx playwright show-report   # تقرير HTML

# الباك إند
cd apps/api
pytest                       # 86/86 على SQLite in-memory
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

1. اقرأ `AGENTS.md` قبل أي تعديل.
2. اعمل على فرع `feature/<name>`.
3. نفّذ `npm run lint` والاختبارات قبل الـ commit.
4. لا تُضف بيانات حقيقية أو أسرارًا إلى المستودع.

---

## الترخيص والحقوق

- `GET /api/license/status` يعرض حالة الترخيص (مُعرّف/سارٍ/قارب الانتهاء/منتهٍ) بدون حجب أي طلب.
- يعتمد على `LICENSE_KEY` و`LICENSE_EXPIRES_ON` و`LICENSE_ENFORCE` (يبقى `false` افتراضيًا).
- هذا **عنصر نائب (Placeholder)** واضح؛ الترخيص الموقّع من الخادم والفرض الفعلي بند ما بعد التسليم (Phase 8). لا يوجد أي قفل وهمي في الواجهة.

© 2026 Suez Methanol Derivatives Co. (SMD). جميع الحقوق محفوظة.
الاستخدام داخلي ومخصص للشركة.
