# SMD-HR API (FastAPI)

الباك إند الرسمي لنظام SMD-HR. يعمل مع PostgreSQL 16 في الإنتاج، ويمكن تشغيله محليًا على SQLite للاختبارات.

```
router  →  schema (Pydantic)  →  service (business rules)  →  model  →  DB
```

## التشغيل عبر Docker (المسار المعتمد)

من جذر المستودع:

```bash
cp .env.example .env            # ثم عدّل SECRET_KEY و POSTGRES_PASSWORD
docker compose up -d --build
```

حاوية `api` تنفّذ تلقائيًا عند كل إقلاع:

1. انتظار PostgreSQL حتى يقبل الاتصالات.
2. `alembic upgrade head`.
3. `uvicorn app.main:app` على المنفذ 8000.

لتعبئة البيانات التجريبية تلقائيًا ضع `SEED_DEMO_ON_START=true` في `.env`، أو نفّذ يدويًا:

```bash
docker compose exec api python -m app.seed --profile demo
```

## التشغيل المحلي بدون Docker

```bash
cd apps/api
python -m venv .venv && .venv\Scripts\activate     # Windows
pip install -r requirements.txt

# SQLite محليًا (لا يحتاج PostgreSQL)
set DATABASE_URL=sqlite+pysqlite:///./smd_hr_dev.db
alembic upgrade head
python -m app.seed --profile demo
uvicorn app.main:app --reload --port 8000
```

> ملاحظة Windows: إذا كنت تستخدم Python embeddable ولا يعمل `python -m app.seed`، شغّله عبر:
> `python -c "import sys; sys.path.insert(0,'.'); sys.argv=['seed','--profile','demo']; from app.seed import main; main()"`

## المتغيرات المهمة

| المتغير | الوصف |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://user:pass@db:5432/smd_hr` |
| `SECRET_KEY` | مفتاح توقيع JWT (32+ بايت عشوائي) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | صلاحية الجلسة (افتراضي 480) |
| `CORS_ORIGINS` | مصادر مسموحة مفصولة بفاصلة |
| `TZ` | `Africa/Cairo` |
| `DEMO_MODE` | تعليم/تعطيل بيانات العرض |
| `SEED_DEMO_ON_START` | تعبئة بيانات تجريبية عند الإقلاع |
| `STORAGE_DIR` | مسار مستندات الشركة داخل الحاوية (`/data/uploads`) |

## الحسابات التجريبية

| المستخدم | كلمة المرور | الدور |
|---|---|---|
| `admin` | `Admin@12345` | ADMIN |
| `hr` | `Hr@12345` | HR |
| `viewer` | `Viewer@12345` | VIEWER |

> غيّر كلمات المرور قبل التسليم النهائي.

## الاختبارات

```bash
cd apps/api
pytest                 # 35 اختبارًا على SQLite in-memory
```

## محرك المستندات

- المستند الأصلي يُخزَّن كما هو تحت `STORAGE_DIR/forms/` (خارج مجلد الويب) ولا يُقدَّم إلا عبر `GET /api/forms/files/{id}/download` بعد التحقق من الجلسة.
- Word/Excel يُحوَّل إلى PDF عبر LibreOffice Headless (`LIBREOFFICE_BIN`) وتُحفظ نسخة PDF بجانبه.
- التحقق من النوع عبر **magic bytes** لا الامتداد، والحد الأقصى `MAX_UPLOAD_MB` (افتراضي 20).
- حقول القالب تُخزَّن كإحداثيات نسبية `%` + رقم الصفحة + `binding` (مثل `employee.name` أو `leave.startDate`)، ولا يُعاد رسم المستند إطلاقًا.
- الحذف منطقي (`is_active=false`)، ويُمنع حذف ملف مرتبط بقالب نشط (`FORM_FILE_IN_USE`).

## الترحيلات

```bash
alembic upgrade head                                  # تطبيق الترحيلات
alembic revision --autogenerate -m "change summary"    # ترحيل جديد
alembic downgrade -1                                  # تراجع خطوة
```

## نقاط النهاية (مختصر)

| المسار | الوصف |
|---|---|
| `GET /api/health` | فحص الحياة |
| `GET /api/ready` | فحص جاهزية قاعدة البيانات |
| `POST /api/auth/login` | تسجيل الدخول (JSON) |
| `GET /api/auth/me` | بيانات المستخدم الحالي |
| `GET/POST /api/employees` | قائمة/إضافة موظف |
| `GET/PATCH/DELETE /api/employees/{employee_id}` | قراءة/تعديل/تعطيل موظف |
| `GET/POST /api/attendance` | سجلات الحضور (upsert يومي) |
| `GET/POST /api/leaves` | الإجازات |
| `GET /api/leave-balances` | أرصدة الإجازات للمستخدم الحالي |
| `POST /api/leaves/{id}/decision` | اعتماد/رفض إجازة |
| `GET/POST /api/permits` | الأذونات |
| `GET/POST /api/missions` | المأموريات |
| `GET/POST /api/devices` | أجهزة ZKTeco |
| `POST /api/forms/files` | رفع مستند شركة (PDF/Word/Excel/صورة، حد 20MB) |
| `GET /api/forms/files` | مكتبة المستندات المرفوعة |
| `GET /api/forms/files/{id}/download` | معاينة/تنزيل المستند (يتطلب تسجيل الدخول) |
| `DELETE /api/forms/files/{id}` | حذف منطقي (يُرفض إذا كان مرتبطًا بقالب نشط) |
| `GET/POST /api/forms/templates` | قوالب النماذج + حقولها (إحداثيات نسبية) |
| `GET/PATCH/DELETE /api/forms/templates/{id}` | قراءة/تعديل/تعطيل قالب |
| `GET/POST /api/forms/submissions` | النماذج المعبأة والمحفوظة |

توثيق تفاعلي: `http://localhost/api/docs` (عبر nginx) أو `http://localhost:8000/api/docs`.

## الأخطاء

كل الأخطاء تُرجع بالشكل الموحد:

```json
{ "detail": "رسالة عربية للمستخدم", "code": "LEAVE_BALANCE_EXCEEDED" }
```

وأخطاء التحقق تُرجع `422` مع `errors: [{ field, message }]`.

## الصلاحيات

- `VIEWER`: قراءة فقط.
- `HR` و`ADMIN` و`SUPERVISOR`: كتابة (`EDITOR_ROLES`).
- الصلاحية تُفحص على الخادم دائمًا، ولا يُعتمد على إخفاء الأزرار في الواجهة.
- كل عملية كتابة تُسجَّل في `audit_logs`.
