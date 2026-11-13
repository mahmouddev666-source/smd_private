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

> 🟡 المشروع في مرحلة إعادة بناء للوصول للإنتاج.

- **الباك إند جاهز** في `apps/api`: FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL 16، مصادقة JWT (argon2)، أدوار، Audit Log، واختبارات `pytest` (35/35).
- **Docker جاهز**: `docker-compose.yml` يشغّل `db` + `api` + `web` (nginx). تعذّر التحقق منه على جهاز التطوير الحالي لعدم توفر Docker Desktop/WSL2.
- **الواجهة مربوطة بالـ API** (المرحلة 3): تسجيل الدخول، الموظفون، الحضور، الإجازات والأرصدة، الأذونات والمأموريات — كلها عبر `/api`. اختبارات: 59/59 Vitest + 15/15 Playwright.
- **محرك المستندات** (المرحلة 4.1 + 4.2): رفع نماذج الشركة الأصلية (PDF/Word/Excel/صور) وتحويلها إلى PDF على الخادم، مع مكتبة وعارض صفحات (`pdf.js`) وقوالب مرتبطة بالمستند، **مصمم حقول مرئي** (سحب/تحجيم + ربط ببيانات الموظف/الإجازة/المأمورية)، و**وضع تعبئة وطباعة A4**: اختيار الموظف + سجل الإجازة/الإذن/المأمورية → تعبئة تلقائية → تعديل يدوي → حفظ Submission → طباعة المستند الأصلي كخلفية.
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

## التشغيل الكامل (Docker)

```bash
cp .env.example .env          # عدّل SECRET_KEY و POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec api python -m app.seed --profile demo
```

- الواجهة: <http://localhost>
- API Docs: <http://localhost/api/docs>
- الصحة: <http://localhost/api/health>

> عند كل إقلاع تنتظر حاوية `api` قاعدة البيانات ثم تنفّذ `alembic upgrade head` تلقائيًا.
> يمكن تعبئة البيانات التجريبية تلقائيًا بضبط `SEED_DEMO_ON_START=true` في `.env`.

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
│   └── api/                  # FastAPI: app/, alembic/, tests/, Dockerfile
├── infra/
│   ├── nginx/default.conf    # SPA + proxy /api
│   └── web/Dockerfile        # بناء الواجهة + nginx
├── docker-compose.yml        # db + api + web
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
| `BACKUP_DIR` | مسار النسخ الاحتياطي | `/backups` |

> لا تُرفع ملفات `.env` إلى Git أبدًا.

---

## النسخ الاحتياطي والاستعادة

```bash
# نسخة احتياطية
docker compose exec -T db pg_dump -U smd smd_hr > backup_$(date +%F).sql

# استعادة
docker compose exec -T db psql -U smd smd_hr < backup.sql
```

- نسخة يومية مجدولة + نسخة أسبوعية على قرص خارجي/مشاركة شبكة.
- **اختبر الاستعادة فعليًا** قبل التسليم.
- يُنصح بـ UPS للجهاز.

---

## الاختبارات

```bash
npm run lint                 # فحص الأنواع
npm test                     # اختبارات الوحدة (Vitest) — 27/27
npx playwright test          # اختبارات E2E — 9/9
npx playwright show-report   # تقرير HTML

# الباك إند
cd apps/api
pytest                       # 24/24 على SQLite in-memory
```

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

© 2026 Suez Methanol Derivatives Co. (SMD). جميع الحقوق محفوظة.
الاستخدام داخلي ومخصص للشركة.
