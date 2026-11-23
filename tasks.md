# tasks.md — مراحل التطوير المتبقية

> **آخر تحديث:** 2026-11-23  
> **المرجع:** [`docs/PLAN.md`](docs/PLAN.md) · [`AGENTS.md`](AGENTS.md) · [`README.md`](README.md)  
> **قاعدة التحديث:** تُعلَّم المهمة بـ ✅ فقط بعد تنفيذها واجتياز اختباراتها. لا تُنفَّذ مرحلة كاملة دفعة واحدة إلا بطلب صريح من مالك المشروع.  
> **الافتراضات التي لا تُكسر:** `ONLYOFFICE_ENABLED=false` و`VITE_ONLYOFFICE_ENABLED=false`، وإبقاء `Overlay` و`FormDesigner` و`SmartForms` و`formFileParser` كما هي حتى مرحلة التقاعد المؤجلة.

---

## 0) ما اكتمل بالفعل (سياق فقط — لا يُعاد تنفيذه)

| العنصر | الحالة | المرجع |
|---|---|---|
| المراحل 0–7 من الخطة | ✅ | `docs/PLAN.md` |
| ONLYOFFICE Phase 3 — الموجتان A+B | ✅ `7a25689` | `docs/ONLYOFFICE-PHASE3-REPORT.md` |
| ONLYOFFICE Phase 3 — الموجة C (لقطة PDF) | ✅ `b370979` | `docs/ONLYOFFICE-PHASE3-REPORT.md` |
| ONLYOFFICE Phase 4 (واجهة المحرر + الإعدادات + الترخيص) | ✅ `8bd594d` | `docs/ONLYOFFICE-PHASE4-REPORT.md` |
| الترخيص موقّع + CLI + `/api/license/status` | ✅ تقنيًا | `apps/api/app/services/license.py`، `apps/api/app/cli/license.py` |
| التحقق الآلي الأخير | ✅ | `pytest 216` · `npm test 94` · `npm run lint` · `npm run build` |

---

## المرحلة A — مزامنة المستندات مع الوضع الحالي ✅

**الهدف:** إزالة التعارض بين التوثيق والكود المنفذ قبل أي عمل برمجي جديد.

- [x] تحديث `README.md`: حالة المراحل، ONLYOFFICE Phase 3/4، مفاتيح التشغيل، متغيرات الترخيص، خطوات التفعيل، أعداد الاختبارات.
- [x] تحديث `docs/PLAN.md`: تاريخ التحديث، صفوف الالتزامات، قسم ONLYOFFICE الفرعي، قواعد العمل/الاختبارات، Phase 8.
- [x] تحديث `AGENTS.md`: خريطة النظام الفعلية (`src` مصدر الواجهة)، قواعد Git المعتمدة، ملاحظة `work_settings`، حماية الملفات القديمة.
- [x] تحديث `docs/ONLYOFFICE-PHASE3-REPORT.md` و`docs/ONLYOFFICE-PHASE4-REPORT.md` بالالتزامات النهائية.
- [x] إنشاء هذا الملف `tasks.md`.

**معايير القبول:** لا يبقى وصف «Placeholder» للترخيص، ولا وصف Phase 3 كأنه غير مُلتزم، ولا أرقام اختبارات قديمة (86/73/76).  
**الحالة:** ✅ مكتملة — لا حاجة لتعديل مستندات إضافية لبدء المرحلة B.

---

## المرحلة B — ربط إعدادات العمل بمحرك حساب الإضافي ✅

**الهدف:** أن تصبح القيم المحفوظة في `work_settings` هي المصدر الفعلي للحساب، بدل الثوابت المكررة، دون تغيير القيم المعتمدة.

### المهام

- [x] إنشاء/توحيد دالة حساب على الخادم (`apps/api/app/services/overtime.py`) تقرأ من `get_work_settings(db)`:
  - `overtime_day_start`, `overtime_cutoff`
  - `overtime_day_multiplier`, `overtime_night_multiplier`
  - `late_grace_minutes` وورديات `normal/day/night`
- [x] جعل `src/utils/overtimeCalculator.ts` يستهلك نفس القيم عبر `/api/settings/work` عبر `src/hooks/useWorkSettings.ts`، مع إزالة `06:00` / `18:00` / `1.35` / `1.70` من منطق الحساب والإبقاء على دوال العرض/public API المستخدمة في الاختبارات.
- [x] ربط `apps/api/app/services/attendance_processor.py` بفاصل الإضافي والمعاملين، مع **قرار موثق**: التغيير يطبّق على المزامنات والحسابات القادمة فقط، ولا تُعاد كتابة سجلات الحضور القديمة تلقائيًا.
- [x] إضافة اختبارات:
  - حالات HR الذهبية: 16:00→20:00 = 2س بـ1.35 + 2س بـ1.70، و00:00→02:00 = 2س بـ1.70.
  - تغيير القيم في `work_settings` ينعكس في النتيجة.
  - لا `NaN`، لا خصم مزدوج، لا كسر لحالة `SETTINGS_VERSION_CONFLICT`.
- [x] لا تُغيَّر القيم الفعلية المعتمدة دون موافقة HR كتابية (القيم الافتراضية بقيت `18:00` و`1.35` و`1.70`).
- [x] فتح `GET /api/settings/work` لكل الأدوار المصادق عليها (لأن الحاسبة تعمل لكل المستخدمين) مع إبقاء `PATCH` لـ `ADMIN`/`HR` فقط.

### الملفات المتوقعة

`apps/api/app/services/overtime.py` (جديد) · `apps/api/app/services/attendance_processor.py` · `apps/api/app/routers/settings.py` · `src/utils/overtimeCalculator.ts` · `src/hooks/useWorkSettings.ts` (جديد) · `src/components/WorkSettingsManager.tsx` · `src/components/OvertimeCalculatorWidget.tsx` · `src/components/AttendanceManager.tsx` · `src/App.tsx` · اختبارات `test_overtime_service.py` و`workSettingsEngine.spec.ts`.

**معايير القبول:** تعديل «فاصل الإضافي» من الشاشة يغيّر نتيجة الحاسبة والحضور الجديد معًا؛ الاختبارات القديمة المبنية على القيم المعتمدة تمر دون تعديل.  
**الحالة:** ✅ مكتملة — `pytest 216 passed` · `npm test 94 passed` · `npm run lint` · `npm run build`.

---

## المرحلة C — تثبيت الترخيص داخل Docker ✅

**الهدف:** أن يبقى `license.json` صالحًا بعد إعادة إنشاء الحاويات، وأن تثبت بصمة الجهاز.

- [x] إضافة volume/read-only mount لـ `license.json` في خدمتَي `api` و`worker` داخل `docker-compose.yml`.
- [x] ضبط `LICENSE_FILE=/app/license.json` داخل الحاوية بشكل صريح وموثق، وتحديث `.env.example` بتعليمات `LICENSE_HARDWARE_ID`.
- [x] مراجعة خطوات `docker compose exec api python -m app.cli.license hardware-id` ثم `generate` ثم `verify` ثم `/api/license/status` وتوثيقها في `README.md`.
- [x] اختبار الحالات: `unconfigured`، `active`، `expiring`، `hardware_mismatch`، `invalid`، `expired`.
- [x] اختبار أن `LICENSE_ENFORCE=true` يمنع الإقلاع فقط في الحالات الثلاث المانعة، وأن الرسالة عربية وبدون أسرار، مع تحذير عربي عند `false`.
- [x] التأكد أن `license.json` و`LICENSE_SIGNING_KEY` غير موجودين في Git ولا في سجلات API.

**معايير القبول:** بعد `docker compose down && docker compose up -d --build` تبقى الحالة `active` دون نسخ الملف يدويًا.  
**الحالة:** ✅ مكتملة — `pytest 227 passed`؛ التحقق التشغيلي على جهاز الشركة ضمن المرحلة D.  
**ملاحظة:** هذه المرحلة لا تُفعّل الفرض في الإنتاج؛ `LICENSE_ENFORCE` يبقى `false` حتى يقرر المالك.

---

## المرحلة D — تحقق Docker نظيف على جهاز الاختبار ⬜

**الهدف:** إثبات أن النشر يعمل من الصفر خارج جهاز التطوير.

- [ ] `cp .env.example .env` مع `POSTGRES_PASSWORD` و`SECRET_KEY` و`ONLYOFFICE_JWT_SECRET` (مطلوب حتى مع إيقاف ONLYOFFICE).
- [ ] `docker compose up -d --build` ثم `docker compose ps` و`/api/health`.
- [ ] تسجيل الدخول بـ `admin`، وظهور الواجهة عربية RTL، وتأكيد أن زر ONLYOFFICE **لا يظهر** و`GET /api/office/status` لا يفعّل المحرر.
- [ ] تشغيل `python -m app.seed --profile demo` والتحقق أن الأكواد `9001+`.
- [ ] فحص `GET /api/license/status` بعد المرحلة C، وحالة `work_settings` بعد المرحلة B.
- [ ] نسخة احتياطية فعلية ثم استعادة مجرّبة.
- [ ] قراءة بصمة من جهاز ZKTeco حقيقي، أو توثيق بديل معتمد إذا تعذّر الجهاز.

**معايير القبول:** كل الخدمات `up/healthy`، لا أخطاء في السجلات، استعادة النسخة ناجحة، لا بيانات demo تُعرض كحقيقية.  
**الحالة:** ⬜ لم تبدأ.

---

## المرحلة E — البيانات الحقيقية وتوقيع UAT ⬜

**الهدف:** تسليم النظام ببيانات الشركة الفعلية وبموافقة HR.

- [ ] استيراد بيانات الموظفين من Excel الحقيقي (مع خطة استبدال demo).
- [ ] استيراد كشوف الحضور الأسبوعية ومطابقتها مع سجلات البصمة بعد التنفيذ الفعلي.
- [ ] تجهيز قوالب SMD الأصلية: طلب إجازة، أمر مأمورية، إذن خروج، ومقارنة اللقطة بطباعة المتصفح.
- [ ] تنفيذ حالات UAT الموقعة من HR على جهاز الشركة.
- [ ] توقيع محضر التسليم + تحديث `docs/PLAN.md` إلى Phase 8 ✅.

**معايير القبول:** UAT موقع + نسخة مستعادة + بصمة حقيقية + ترخيص مثبت.  
**الحالة:** ⬜ لم تبدأ.

---

## مؤجل / اختياري (لا يُنفَّذ الآن)

| العنصر | السبب |
|---|---|
| تقاعد `Overlay` / `FormDesigner` / `SmartForms` / `formFileParser` | مطلوب كـ fallback طالما ONLYOFFICE معطّل؛ يُنفَّذ في مرحلة منفصلة بعد موافقة HR. |
| تفعيل `ONLYOFFICE_ENABLED` و`VITE_ONLYOFFICE_ENABLED` | يحتاج Document Server فعليًا واختبار تحرير حقيقي؛ الافتراضي يبقى `false`. |
| الإقفال الشهري | أجّلته HR سابقًا. |
| إشعارات بريد/واتساب، بوابة الخدمة الذاتية، توقيع إلكتروني | اختيارية في الخطة. |
| نقل `src` إلى `apps/web`، تفعيل React Query | تحسينات بنيوية مؤجلة لتجنّب إعادة كتابة المسارات. |
| مراجعة `npm audit` (تنبيه `high` واحد) وحجم حزمة Vite | دورة صيانة، لا تؤثر على البناء الحالي. |
| OCR | أُجّل منذ المرحلة 1. |

---

## سجل التحديث

| التاريخ | المرحلة | الحالة | ملاحظة |
|---|---|---|---|
| 2026-11-23 | A | ✅ | مزامنة `README.md` و`PLAN.md` و`AGENTS.md` وتقارير ONLYOFFICE + إنشاء `tasks.md`. |
| 2026-11-23 | B | ✅ | خدمة `overtime.py` + ربط `attendance_processor` والحاسبة بـ`work_settings`؛ فتح قراءة الإعدادات لكل الأدوار؛ `pytest 216` و`npm test 94`. |
| 2026-11-23 | C | ✅ | mount للقراءة فقط لـ`license.json` في `api`/`worker`، تثبيت `LICENSE_FILE`، توثيق CLI، اختبارات فرض الإقلاع والتحذير العربي؛ `pytest 227`. |
