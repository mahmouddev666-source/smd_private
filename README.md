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

> ⚠️ المشروع في مرحلة إعادة بناء للوصول للإنتاج.

الإصدار الحالي نموذج أولي (Prototype): الواجهة مكتملة، لكن البيانات تُحفظ في `localStorage`، والمصادقة وتكامل البصمة والترخيص غير حقيقية. يجري نقل النظام إلى:

- **FastAPI** + **PostgreSQL** كطبقة خلفية.
- **Docker Compose** للتشغيل على جهاز واحد داخل الشركة.
- **React + TypeScript + Vite** للواجهة (مع إعادة استخدام الموجود).

راجع `docs/PLAN.md` أو خطة التنفيذ لمزيد من التفاصيل.

---

## التقنيات

| الطبقة | التقنية |
|---|---|
| الواجهة | React 19, TypeScript, Vite, Tailwind CSS 4 |
| الأيقونات | lucide-react |
| الملفات | SheetJS (xlsx), mammoth, pdf.js |
| الباك إند (مستهدف) | FastAPI, SQLAlchemy, Alembic, Pydantic |
| قاعدة البيانات (مستهدف) | PostgreSQL 16 |
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
```

> البيانات الحالية تُحفظ في `localStorage` وتُفقد عند مسح بيانات المتصفح.

---

## التشغيل الكامل (بعد اكتمال المرحلة 2)

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed --profile demo
```

- الواجهة: <http://localhost>
- API Docs: <http://localhost/api/docs>
- الصحة: <http://localhost/api/health>

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
│   ├── web/                  # واجهة React
│   └── api/                  # FastAPI
├── services/
│   └── connector/            # خدمة ZKTeco (pyzk)
├── infra/
│   └── docker-compose.yml
├── docs/                     # أدلة النشر والاستخدام
├── public/                   # الأصول العامة (الشعار)
├── src/                      # الواجهة الحالية (سيتم نقلها إلى apps/web)
├── AGENTS.md                 # قواعد العمل للمطورين والوكلاء
└── README.md
```

---

## الإعدادات (`.env`)

| المتغير | الوصف | مثال |
|---|---|---|
| `APP_ENV` | بيئة التشغيل | `production` |
| `APP_URL` | عنوان الواجهة | `http://smd-hr.local` |
| `DATABASE_URL` | اتصال PostgreSQL | `postgresql+psycopg://smd:pass@db:5432/smd_hr` |
| `SECRET_KEY` | مفتاح الجلسات (32+ حرفًا) | — |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | صلاحية الجلسة | `480` |
| `TZ` | المنطقة الزمنية | `Africa/Cairo` |
| `STORAGE_DIR` | مسار تخزين الملفات | `/data/uploads` |
| `MAX_UPLOAD_MB` | حد حجم الملف | `20` |
| `ZK_SYNC_INTERVAL_MINUTES` | فترة مزامنة البصمة | `10` |
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
npm test                     # اختبارات الوحدة (Vitest)
npx playwright test          # اختبارات E2E
npx playwright show-report   # تقرير HTML
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
