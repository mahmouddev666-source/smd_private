# المرحلة 3 — مهام تنفيذية (الخلفية / Backend)

> **المشروع:** SMD-HR
> **الوثيقة:** تفكيك المرحلة 3 إلى مهام قابلة للتنفيذ والاختبار
> **التاريخ:** 2026-11-21
> **تعتمد على:** `docs/ONLYOFFICE-PHASE1-DESIGN.md` (التصميم) + بوابة المرحلة 2
> (`docs/ONLYOFFICE-PHASE2-INFRA.md` القسم 11–12)
> **النطاق:** `apps/api` فقط + استثناء واحد صغير في الواجهة (T3-00 لـ R5)
> **تحديث 2026-11-21:** أُضيفت **T3-18** (الترخيص) و**T3-19** (إعدادات الورديات)
> بطلب صريح. أُنجزت **T3-00 … T3-04** و**T3-18 / T3-19**
> (pytest 117 · Vitest 76 · استيراد `app.main/worker` ناجح).
> نموذج البيانات للمراجعة: `docs/ONLYOFFICE-PHASE3-DATA-MODEL.md`.

---

## 0) قواعد التنفيذ (تُطبَّق على كل مهمة)

1. **مهمة واحدة = تغيير مترابط واحد**، مع اختباراتها، وتشغيل `pytest -q` قبل إغلاقها.
2. **لا حذف ولا إعادة تسمية** لأي جدول/عمود/نقطة نهاية قائمة. كل شيء إضافي.
3. **لا لمس** `SmartForms.tsx` / `formFileParser.ts` / مسار PDF.js (وسم `@deprecated` في المرحلة 5).
4. كل كتابة: تحقق Pydantic + صلاحية + **Audit Log**.
5. كل تغيير مخطط: هجرة Alembic (لا تعديل يدوي)، وتُختبر `upgrade → downgrade → upgrade`.
6. لا أسرار في الكود؛ كل الإعدادات عبر `Settings`.
7. في نهاية كل **موجة** تُشغَّل البوابة: `pytest -q` كامل + `python -c "import app.main"` + `git diff` مراجَع.
8. الرسائل/الأخطاء بالعربية مع `code` إنجليزي، وفق `AGENTS.md`.
9. لا `commit` على `main` إلا بطلب صريح منك؛ سأعرض الـ diff عند إغلاق كل موجة.

**أحجام التقدير:** S ≈ 2–3 ساعات · M ≈ 4–6 · L ≈ 8–12 (تقديرية، تُراجع بعد T3-03).

---

## 1) خريطة التبعيات

```text
T3-00 (R5 — مستقل، يُنفَّذ أولًا)                         ✅
T3-01 (إعدادات) ─┐                                        ✅
T3-02 (R6)       │                                        ✅
T3-18 (ترخيص) ───┤ ✅ (بلا هجرة؛ ملف + CLI + endpoint)
T3-19 (ورديات) ──┤ ✅ (هجرة بعد T3-04)
T3-03 (Models) ──┼──► T3-04 (Migration)             ✅ ✅
      └──────────┴──► T3-05 (Versions service) ──► T3-06 (Documents: OOXML/PDF)
                              │
T3-01 ──► T3-07 (T2 tokens) ──┼──► T3-10 (config) ──► T3-11 (download) ──► T3-12 (callback)
T3-01 ──► T3-08 (T3 JWT)  ────┘                                              │
T3-06 ──────────────────────────────────────────────────────────────► T3-13 (versions API)
T3-03/T3-06 ──► T3-14 (Snapshot render) ──► T3-15 (Forms integration) ──► T3-16 (worker retry)
                                                                    └──► T3-17 (بوابة الجودة)
```

---

## الموجة A — الأساس (بلا اعتماد على DS حقيقي)

### T3-00 — إصلاح R5: خطأ 422 في pagination · **S** · مستقل · ✅ أُنجزت

**الهدف:** توافق حجم الصفحة بين الواجهة وسقف الخادم (`le=200`).

**الملفات:**
- `src/services/apiClient.ts` (السطر ~711 `fetchAllPages`)
- `tests/unit/apiClient.pagination.spec.ts` (**جديد**)

**التفاصيل:**
1. توقيع جديد: `fetchAllPages<T>(path, extraParams = {}, pageSize = 500)`.
2. استخدام `pageSize` في `limit` وفي `offset += pageSize`.
3. تمرير **200** من: `fetchFormFiles` (سطر ~1190)، `fetchFormSubmissions` (سطر ~1297).
4. لا تغيير في `fetchEmployees/Attendance/Leaves` (سقفها مختلف).

**معيار القبول:**
- [x] طلبات `/forms/*` تحمل `limit=200` دائمًا.
- [x] الحلقة تتوقف عند `page.total` أو صفحة فارغة.
- [x] `npm test` أخضر (73 + 3 اختبارات جديدة = 76).

**الاختبار:** mock لـ `request` والتحقق من الـ URL في أول صفحتين + التوقف المبكر.

---

### T3-01 — إعدادات Office + Fail-Fast · **S** · بلا اعتماد · ✅ أُنجزت

**الهدف:** كل مفاتيح المرحلة في `Settings` مع تحقق إقلاع واضح.

**الملفات:** `apps/api/app/core/config.py` · `apps/api/tests/test_config_office.py` (جديد)

**التفاصيل:**
- الحقول (نفس أسماء `.env.example`): `onlyoffice_enabled`, `onlyoffice_internal_url`,
  `onlyoffice_internal_host`, `onlyoffice_jwt_secret`, `onlyoffice_callback_base`,
  `office_token_secret`, `office_download_token_ttl_seconds`,
  `office_callback_token_ttl_seconds`, `office_session_ttl_minutes`,
  `office_max_file_mb`, `office_max_callback_mb`, `office_version_retention`,
  `office_legacy_convert_on_upload`, `office_require_ds_download_token`,
  `office_allow_coediting`, `submission_snapshot_enabled`.
- `office_token_key` = `office_token_secret or secret_key`.
- تحقق: إن `onlyoffice_enabled` و(السر فارغ أو `< 32`) → خطأ إقلاع عربي واضح
  (Fail-Fast). إن كان العلم `false` → لا خطأ إطلاقًا.
- لا تُسجَّل قيمة أي سر في اللوج.

**معيار القبول:** اختباران (مفعّل بلا سر → خطأ / معطّل بلا سر → سليم) + قيم افتراضية مطابقة للتصميم.

---

### T3-02 — R6: `DOCUMENT_EDITOR_ROLES` للخلفية · **S** · بلا اعتماد · ✅ أُنجزت

**الهدف:** استبعاد `SUPERVISOR` من كتابة النماذج/المكتب مع إبقاء `EDITOR_ROLES` لباقي النظام.

**الملفات:** `apps/api/app/core/security.py` · `apps/api/app/routers/forms.py` · `apps/api/tests/test_forms_roles.py` (جديد)

**التفاصيل:**
- `DOCUMENT_EDITOR_ROLES = ("ADMIN", "HR")`.
- استبدال `require_role(*EDITOR_ROLES)` في **كتابة** النماذج فقط:
  رفع ملف، حذف ملف، إنشاء/تعديل/حذف قالب، إنشاء submission.
- القراءة تبقى كما هي (أي مستخدم مسجّل).

**معيار القبول:**
- [ ] `SUPERVISOR` → `403 FORBIDDEN` على كل كتابة نماذج (هذا هو `code` الفعلي في `require_role`).
- [ ] `ADMIN`/`HR` → نفس السلوك السابق.
- [ ] الحضور/الإجازات/المأموريات لم تتغيّر (اختبار انحدار).

---

### T3-18 — الترخيص (`license.json` + CLI + API) · **M** · بعد T3-01 · ✅ أُنجزت

**الهدف:** ترخيص خلفي فعلي بلا واجهة، يقرأ ملفًا موقّعًا عند الإقلاع ومن
خلال `GET /api/license/status`، مع أداة توليد للمطوّر. **لا جدول قاعدة بيانات.**

**الملفات:** `app/services/license.py` · `app/cli/license.py` ·
`app/routers/license.py` (توسيع) · `app/core/config.py` · `app/main.py` ·
`tests/test_license_service.py` (جديد) + توسيع `tests/test_license.py`

**التفاصيل:**
1. مخطط الملف: `client_name`, `hardware_id`, `issued_at`, `expires_at`
   (إلزامية) + `schema_version`, `license_id`, `features`, `signature` (اختيارية).
2. بصمة العتاد `sha256("smd-hr|" + machine_id + "|" + machine)` مع
   `LICENSE_HARDWARE_ID` للتجاوز في الاختبار.
3. توقيع HMAC-SHA256 اختياري يُفرض عند وجود `LICENSE_SIGNING_KEY`.
4. فحص عند الإقلاع: تسجيل الحالة بلا أسرار؛ `LICENSE_ENFORCE=true` يمنع
   الإقلاع عند `expired/invalid/hardware_mismatch` (الافتراضي `false`).
5. الحالات: `unconfigured`, `invalid`, `hardware_mismatch`, `not_yet_valid`,
   `expired`, `expiring`, `active` مع رسائل عربية.
6. CLI: `hardware-id`, `generate` (مع `--client/--hardware-id/--issued/--expires/--out/--self`),
   `verify`. لا يطبع أي مفتاح.
7. API يحافظ على الحقول القديمة (`license_key_present`, `expires_on`,
   `days_remaining`, `enforced`) ويضيف `client_name`, `issued_on`, `source`,
   `hardware_matches`.

**معيار القبول:**
- [x] ملف صالح = `active`، منتهي = `expired`، بصمة خاطئة = `hardware_mismatch`.
- [x] ملف JSON مكسور/توقيع خاطئ لا يُنتج 500 أبدًا.
- [x] الغياب = `unconfigured`، والتوافق مع القيم القديمة عبر `LICENSE_KEY` يعمل.
- [x] CLI يولّد ملفًا يمرّ `verify`.
- [x] لا مفتاح توقيع ولا بصمة كاملة في أي استجابة API أو لوج.

**مرجع التصميم:** `docs/ONLYOFFICE-PHASE3-DATA-MODEL.md` القسم 2.

---

### T3-03 — نموذج البيانات (Versions + Sessions) · **M** · بعد T3-01 · ✅ أُنجزت

**الملفات:** `apps/api/app/models/form.py` · `apps/api/tests/test_models_office.py` (جديد)

**التفاصيل:**
- `FormFileVersion` بكل أعمدة التصميم §5.2، مع:
  - `UniqueConstraint(file_id, version_no)`
  - فهرس فريد جزئي: نسخة أصلية واحدة
    `Index(..., unique=True, sqlite_where=text("is_original = 1"), postgresql_where=text("is_original"))`
- `OfficeSession` (§5.6) + فهرس فريد جزئي `file_id WHERE closed_at IS NULL`.
- `form_files.current_version_id` **String(36) بلا FK** (تفادي دورة `create_all` على SQLite).
- `form_templates.document_version_id` (FK nullable) · `form_submissions`
  (`document_version_id`, `rendered_pdf_path`, `rendered_checksum`,
  `snapshot_status`, `snapshot_error`) + **`snapshot_attempts` (Integer, default 0)**
  — إضافة تنفيذية ضرورية لسقف إعادة المحاولة (3).
- علاقات SQLAlchemy مع `back_populates` بلا دورات.

**معيار القبول:**
- [x] `Base.metadata.create_all(engine)` ينجح على SQLite في الاختبار.
- [x] الفهارس الفريدة الجزئية موجودة في `metadata` (فحص `indexes`).
- [x] القيود في **قاعدة البيانات** لا في الكود فقط.

---

### T3-04 — هجرة Alembic + Backfill · **L** · بعد T3-03 · ✅ أُنجزت

**الملفات:** `apps/api/alembic/versions/<rev>_office_versioning.py` · `apps/api/tests/test_migration_office.py` (جديد)

**التفاصيل:**
1. إنشاء `form_file_versions` و`office_sessions`.
2. `batch_alter_table` لإضافة الأعمدة (توافق SQLite).
3. Backfill داخل `op.get_bind()`:
   - لكل `form_files`: إصدار `v1` (`is_original=true`, `source='upload'`, نفس
     `storage_path`/`checksum`/`size`/`mime`، `extension` من الامتداد، `kind` من MIME).
   - `pdf_status`: مكتبي + `converted_pdf_path` → `ready`؛ مكتبي بلا PDF → `failed`؛
     PDF → `ready` (و`pdf_path = storage_path`)؛ صورة → `none`.
   - `current_version_id` + تثبيت القوالب + ربط الـ submissions القائمة.
   - Idempotent: لا تُنشئ `v1` إن وُجد إصدار للملف.
4. `downgrade()` يحذف الأعمدة/الجداول (ملفات التخزين تبقى).

**معيار القبول:**
- [x] `upgrade → downgrade → upgrade` على قاعدة SQLite مؤقتة بلا أخطاء.
- [x] عدد الإصدارات = عدد الملفات؛ ولا `current_version_id` فارغ.
- [x] بيانات شكلية (fixtures) لا تتغيّر بعد الرحلة.
- [x] Backfill idempotent (فحص بإعادة استدعائه على نفس القاعدة).

---

### T3-19 — إعدادات الورديات والإضافي (`work_settings`) · **M** · بعد T3-04 · ✅ أُنجزت

**الهدف:** نقل الأوقات والمعاملات المُثبّتة في الكود إلى جدول DB، يستطيع HR Admin تعديله لاحقًا، مع API للقراءة/التحديث.

**الملفات:** `app/models/settings.py` · `app/schemas/settings.py` ·
`app/services/settings.py` · `app/routers/settings.py` ·
`app/services/attendance_processor.py` ·
`alembic/versions/<rev>_work_settings.py` · `tests/test_work_settings.py`
+ تحديث `tests/test_attendance_processor.py`

**التفاصيل:**
1. جدول `work_settings` أحادي الصف (`id=1`) بأعمدة:
   `normal_start/end` (08:00→16:00)، `day_start/end` (08:00→20:00)،
   `night_start/end` (20:00→08:00)، `overtime_day_start` (06:00)،
   `overtime_cutoff` (18:00)، `overtime_day_multiplier` (1.35)،
   `overtime_night_multiplier` (1.70)، `late_grace_minutes`, `version`,
   `updated_by`, `created_at`, `updated_at`.
2. قيود DB: صف واحد، `CHECK` على المعاملات (0<س≤5) والسماحية (0..120)
   وعدم تساوي طرفي كل وردية.
3. الهجرة تُبذر الصف بالقيم الحالية حرفيًا؛ `get_work_settings()` يستخدم
   الثوابت كمرجع إن لم يوجد الصف (اختبارات/قاعدة قديمة).
4. `GET/PATCH /api/settings/work` لـ `ADMIN`/`HR` فقط؛ `PATCH` يقبل
   `expected_version` → `409 SETTINGS_VERSION_CONFLICT`.
5. كل تحديث: تحقق Pydantic + Audit Log (`settings.work.update`) بـ before/after.
6. `attendance_processor` يقرأ الإعدادات مرة لكل دفعة. الواجهة تبقى على
   القيم الافتراضية حتى المرحلة 4 (تُوثَّق صراحةً).

**معيار القبول:**
- [x] القيم الافتراضية مطابقة تمامًا للكود الحالي (including `late_grace_minutes=15`).
- [x] `SUPERVISOR`/`VIEWER` → 403 على GET وPATCH.
- [x] معامل = 0 أو 6 → 422؛ وقت بنفس الطرفين → 422؛ صف ثانٍ → قيد DB.
- [x] اختبار انحدار: الحضور المحسوب بالإعدادات المخصّصة يختلف بالمتوقع.
- [x] `upgrade → downgrade → upgrade` ناجح على SQLite.

**مرجع التصميم:** `docs/ONLYOFFICE-PHASE3-DATA-MODEL.md` القسم 3.

---

### T3-05 — خدمة الإصدارات (ذرّية + Dedupe) · **M** · بعد T3-03

**الملفات:** `apps/api/app/services/versions.py` (جديد) · `apps/api/tests/test_versions.py`

**التفاصيل:**
- `next_version_no(file)` داخل معاملة مع `with_for_update()` (No-op على SQLite).
- `create_version(file, *, data: bytes, kind, extension, mime, source, parent_id, actor, is_original=False)`:
  - مسار `forms/<file_id>/v<N>_<checksum8><ext>`.
  - كتابة ذرّية: `.tmp` ثم `os.replace`.
  - فشل أي خطوة = لا سجل ولا ملف يتيم.
- `is_duplicate_of_current(file, checksum) -> bool` (**الإصدار الحالي فقط**).
- تحديث `form_files.current_version_id` (وأعمدة التوافق `converted_pdf_path`,
  `size_bytes`, `checksum`, `mime`).

**معيار القبول:**
- [ ] تسلسل `1,2,3…` بلا فجوات تحت استدعاءات متتالية/متزامنة محاكاة.
- [ ] checksum مطابق للإصدار الحالي → لا إصدار ولا ملف جديد.
- [ ] لا كتابة فوق ملف موجود أبدًا (اختبار `Path.exists`).

---

### T3-06 — المستندات: OOXML + تحويل `.doc/.xls` + PDF لكل إصدار · **M** · بعد T3-05

**الملفات:** `apps/api/app/services/documents.py` · `apps/api/tests/test_documents_office.py`

**التفاصيل:**
- `validate_ooxml(data, kind)`: ZIP (`PK\x03\x04`) + وجود `[Content_Types].xml`،
  ورفض OLE (`\xd0\xcf\x11\xe0`) وHTML/JSON.
- `convert_legacy(source) -> bytes` (LibreOffice) مع مهلة `LIBREOFFICE_TIMEOUT`،
  ورسالة 422 عربية عند الفشل.
- `render_pdf_for_version(file, version)` → `forms/<fid>/pdf/vN.pdf` + تحديث
  `pdf_status`/`pdf_path` (الفشل ≠ فقدان الإصدار).
- احترام `OFFICE_MAX_FILE_MB` (20) و`MAX_UPLOAD_MB` الحالي.
- عند الرفع الجديد لـ `.doc/.xls`: `v1` أصلي + `v2` محوّل OOXML + `current=v2`
  (وفق `OFFICE_LEGACY_CONVERT_ON_UPLOAD`).

**معيار القبول:** docx/xlsx سليم يمرّ، OLE يُرفض في مسار OOXML، فشل التحويل يبقي
`current=v1` ويعيد 422، فشل PDF يترك `pdf_status=failed` دون حذف الإصدار.

---

**بوابة الموجة A:** `pytest -q` كامل أخضر + `alembic upgrade head` على SQLite + مراجعة diff.

---

## الموجة B — واجهة `/api/office/*`

### T3-07 — توكنات T2 (URL) · **S** · بعد T3-01

**الملفات:** `apps/api/app/services/office_tokens.py` (جديد) · `tests/test_office_tokens.py`

**التفاصيل:** توقيع/تحقق `aud` (`office:download` | `office:callback`)، `typ=office_url`،
`fid`, `vid`/`sid`, `jti`, `exp`، `leeway=30`، خوارزمية HS256 فقط، ومقارنة `fid`
مع مسار الطلب.

**معيار القبول:** منتهي/جمهور خاطئ/ملف خاطئ/توقيع خاطئ → رفض؛ صلاحية التنزيل 600ث
والكولباك 43200ث افتراضيًا.

---

### T3-08 — توكنات T3 (ONLYOFFICE JWT) · **M** · بعد T3-01

**الملفات:** `apps/api/app/services/office_jwt.py` (جديد) · `tests/test_office_jwt.py`

**التفاصيل:**
- `sign_config(config)`: توقيع كائن الـ config **بدون** `token` (الحمولة = البنية نفسها).
- `verify_callback(token)`: دعم الحالتين:
  - مسطّح + `operation == "callback"`،
  - `{ "payload": {...}, "operation": "callback" }`.
  - رفض `operation` مختلف، والتحقق من `key`.
- `verify_download(token, request_url)`: `operation == "download"` ومطابقة
  `payload.url` (path + query) إن كان الفحص مفعّلًا.

**معيار القبول:** كل متجهات التصميم §6.3 مغطاة (صالح/توقيع خاطئ/عملية خاطئة/مفتاح مختلف/
شكلان للحمولة) + لا اعتماد على `exp` في توكن DS.

---

### T3-09 — `GET /api/office/status` · **S** · بعد T3-01

**الملفات:** `app/routers/office.py` (جديد) · `app/schemas/office.py` · `app/routers/__init__.py` · `tests/test_office_status.py`

**التفاصيل:** فحص `http://onlyoffice/healthcheck` بمهلة 2ث وكاش 30ث؛
`{enabled, available, documentserverVersion, checkedAt}`؛ لا يكشف عناوين داخلية.

**معيار القبول:** العلم معطّل → `enabled=false` و`available=false` بلا استدعاء شبكة؛
فشل الفحص لا يرفع 500.

---

### T3-10 — `GET /api/office/config/{file_id}` + الجلسات · **L** · بعد T3-05/07/08

**الملفات:** `app/routers/office.py` · `app/services/office.py` (جديد) · `app/services/sessions.py` (جديد) · `tests/test_office_config.py`

**التفاصيل:**
- تحقق: العلم + `DOCUMENT_EDITOR_ROLES` + وجود الملف + `kind ∈ {word, excel}`.
- `.doc/.xls` غير محوّل → `422 OFFICE_LEGACY_NOT_CONVERTED`.
- جلسة نشطة لمستخدم آخر وغير منتهية → `409 OFFICE_SESSION_ACTIVE` + اسم المالك؛
  منتهية → تُغلق `expired` وتُفتح جديدة.
- `document.key = smd-<file_id>-<version_id>` (يتغيّر مع كل إصدار).
- `documentType`: `word` أو **`cell`** (ليس `excel`).
- `permissions`: `edit=true, download=false, print=true, copy=true, comment=false, review=false, fillForms=true`.
- `editorConfig`: `mode=edit`, `lang=ar`, `callbackUrl`, `user`, `customization`.
- إصدار T2 (تنزيل 10د + كولباك 12س) وT3 (توقيع config).

**معيار القبول:** كل حالات §7.2 (نجاح/403/404/409/415/422/503) + `config.token` صالح
للتحقق بـ `verify_callback`-style decode + `key` ثابت داخل الجلسة.

---

### T3-11 — `GET /api/office/download/{file_id}` · **M** · بعد T3-07/08

**الملفات:** `app/routers/office.py` · `tests/test_office_download.py`

**التفاصيل:** تحقق T2 + (اختياريًا) T3/download؛ التحقق أن `vid` يخص `fid`؛
`FileResponse` بـ `Content-Disposition: attachment` و`Cache-Control: no-store`
و`Content-Type` من `version.mime`؛ لا مسار تخزين داخلي في أي خطأ.

**معيار القبول:** 401 لكل حالة توكن خاطئة، 404 لملف/إصدار غير موجود، 200 مع الرؤوس
الصحيحة، ورفض `vid` لا ينتمي للملف.

---

### T3-12 — `POST /api/office/callback/{file_id}` · **L** · بعد T3-05/06/08

**الملفات:** `app/routers/office.py` · `app/services/office_callback.py` (جديد) · `tests/test_office_callback.py`

**التفاصيل:**
- تحقق **T2 إلزامي + T3 إلزامي**.
- آلة الحالات: `1` لمسة جلسة · `2` حفظ+إصدار+PDF+إغلاق `saved` · `3` Audit+إغلاق
  `saved_with_error` · `4` إغلاق `no_changes` · `6` حفظ بلا إغلاق · `7` Audit فقط.
- SSRF: `scheme=http`، `hostname == onlyoffice_internal_host`، بلا userinfo، مسار
  ضمن `/cache/files/` أو `/download/`، `follow_redirects=False`، سقف
  `OFFICE_MAX_CALLBACK_MB` ببث متدرّج.
- بعد التنزيل: magic bytes + SHA-256؛ مطابق للإصدار الحالي → لا إصدار + Audit
  `office.save.duplicate`.
- تعارض: جلسة قديمة + إصدار أحدث → `v(n+1)` بـ `parent_version_id` للإصدار الذي
  فُتح + Audit `office.save.conflict_based_on_old_version`.
- الاستجابة: `{"error":0}` عند القبول، `{"error":1}` عند رفض التوكن/فشل الحفظ
  (بلا 5xx لتجنّب حلقة إعادة).

**معيار القبول:** الحالات `1/2/3/4/6/7` + `401/400/413/422` + dedupe + تعارض الجلسة،
ودائمًا يُسجَّل Audit للكتابة.

---

### T3-13 — نقاط الإصدارات + التحويل + إغلاق الجلسة · **M** · بعد T3-12

**الملفات:** `app/routers/office.py` · `app/schemas/office.py` · `tests/test_office_versions_api.py`

**التفاصيل:**
- `GET /api/office/files/{id}/versions` (قراءة لأي مستخدم، بيانات وصفية بلا مسارات).
- `GET .../versions/{vid}/download` (`DOCUMENT_EDITOR_ROLES`, `disposition=attachment|inline`).
- `GET .../versions/{vid}/preview` (inline PDF أو `404 SNAPSHOT_NOT_READY`/`PREVIEW_NOT_READY`).
- `POST /api/office/files/{id}/convert` (إعادة محاولة `.doc`) → 202.
- `POST /api/office/files/{id}/sessions/close` → 204 + Audit.

**معيار القبول:** مصفوفة الأدوار §6.5 كاملة (SUPERVISOR ممنوع من التنزيل الخام/التحويل/الإغلاق).

---

**بوابة الموجة B:** اختبارات تكامل مع DS مُحاكى (mock httpx) + مراجعة أن كل `/api/office/*`
يعيد `Cache-Control: no-store`.

---

## الموجة C — لقطة الـ Submission

### T3-14 — خدمة توليد PDF · **L** · بعد T3-06

**الملفات:** `app/services/render.py` (جديد) · `app/assets/fonts/Cairo-Regular.ttf` و`Cairo-Bold.ttf` (نسخ من `infra/onlyoffice/fonts/`) · `requirements.txt` (+`pypdf`, `reportlab`, `arabic-reshaper`, `python-bidi`) · `tests/test_render.py`

**التفاصيل:**
- خلفية = `version.pdf_path` (يجب `ready`)؛ للصور: تغليف A4 عبر reportlab أولًا.
- إحداثيات `%` من أعلى-يسار → تحويل إلى إحداثيات PDF من أسفل-يسار.
- حجم الخط: `pt = px * page_width_pt / 794`.
- تشكيل عربي: `arabic_reshaper` + `python-bidi`، محاذاة right/center/left، قصّ داخل الصندوق.
- خط Cairo مسجّل عبر `pdfmetrics.registerFont`.
- `pypdf`: `page.merge_page(overlay)` — الأصل لا يُعدّل.
- حفظ `forms/<fid>/submissions/<sid>.pdf` + SHA-256 + `rendered_checksum`.
- الفشل يُعيد خطأً **غير قاتل** للاستدعاء (تفاصيل في T3-15).

**معيار القبول:** لقطة تحتوي كل الحقول، العربية متصلة وباتجاه صحيح، لا تعديل لأصل PDF،
واختبار فشل (خط مفقود) يرفع استثناءً معرّفًا يلتقطه المستدعي.

---

### T3-15 — دمج النماذج (Submission snapshot) · **M** · بعد T3-13/14

**الملفات:** `app/services/forms.py` · `app/routers/forms.py` · `app/schemas/form.py` · `tests/test_forms_snapshot.py`

**التفاصيل:**
- عند إنشاء submission: تحديد `document_version_id` من
  `template.document_version_id` أو الإصدار الحالي؛ `snapshot_status=pending` ثم محاولة
  التوليد؛ الفشل → `failed` + `snapshot_error` عربي، **والـ submission يُنشأ**.
- `GET /api/forms/submissions/{id}` (تفاصيل + حالة اللقطة).
- `GET /api/forms/submissions/{id}/document` (inline، `404 SNAPSHOT_NOT_READY`).
- `GET /api/forms/files/{id}/download` يخدم PDF الإصدار الحالي (نفس العقد + `version_id` اختياري).

**معيار القبول:** الـ API الحالي متوافق (حقول جديدة اختيارية فقط)، فشل اللقطة لا يعيد
5xx، والاختبارات القديمة تبقى خضراء.

---

### T3-16 — إعادة محاولة اللقطات في `worker` · **S** · بعد T3-14

**الملفات:** `app/worker.py` · `tests/test_worker_snapshot.py`

**التفاصيل:** مسح دوري لـ `snapshot_status IN ('pending','failed') AND snapshot_attempts < 3`،
تنفيذ التوليد، `snapshot_attempts += 1`، Audit عند النجاح/الاستسلام، بلا تعطيل مهام ZK/backup.

**معيار القبول:** محاولة ثالثة فاشلة → لا إعادة أخرى؛ النجاح يحدّث `rendered_pdf_path`.

---

### T3-17 — بوابة الجودة والتوثيق · **M** · بعد الكل

**الملفات:** `apps/api/tests/*` · `docs/ONLYOFFICE-PHASE1-DESIGN.md` (تحديث أي انحراف) · `docs/ONLYOFFICE-PHASE3-REPORT.md` (جديد)

**التفاصيل:**
- تشغيل كامل: `pytest -q` (86 + الجديد) + `alembic upgrade/downgrade` +
  `python -c "import app.worker"` + `npm test` (لأن T3-00 يمس الواجهة).
- مصفوفة أدوار لكل نقطة جديدة.
- اختبار `limit=201` → 422 (جانب الخادم).
- تقرير المرحلة: ما نُفّذ، الانحرافات، الدين التقني، وأوامر التحقق.

**معيار القبول:** كل الاختبارات خضراء، ولا تحذيرات جديدة، وتقرير مكتوب.

---

## 2) ملخّص المهام

| المهمة | العنوان | الحجم | تعتمد على | الحالة |
|---|---|---|---|---|
| T3-00 | R5 — pagination 200 للنماذج | S | — | ✅ |
| T3-01 | إعدادات Office + Fail-Fast | S | — | ✅ |
| T3-02 | R6 — `DOCUMENT_EDITOR_ROLES` | S | — | ✅ |
| T3-18 | ترخيص `license.json` + CLI + API | M | T3-01 | ✅ |
| T3-03 | Models: versions + sessions | M | T3-01 | ✅ |
| T3-04 | Migration + backfill | L | T3-03 | ✅ |
| T3-19 | إعدادات الورديات `work_settings` | M | T3-04 | ✅ |
| T3-05 | خدمة الإصدارات (ذرّية/dedupe) | M | T3-03 | |
| T3-06 | OOXML + تحويل + PDF لكل إصدار | M | T3-05 |
| T3-07 | توكنات T2 | S | T3-01 |
| T3-08 | توكنات T3 (DS JWT) | M | T3-01 |
| T3-09 | `/api/office/status` | S | T3-01 |
| T3-10 | `/api/office/config` + جلسات | L | T3-05/07/08 |
| T3-11 | `/api/office/download` | M | T3-07/08 |
| T3-12 | `/api/office/callback` | L | T3-05/06/08 |
| T3-13 | نقاط الإصدارات + convert + close | M | T3-12 |
| T3-14 | مولّد لقطة PDF | L | T3-06 |
| T3-15 | دمج النماذج + snapshot | M | T3-13/14 |
| T3-16 | إعادة محاولة في worker | S | T3-14 |
| T3-17 | بوابة الجودة + تقرير | M | الكل |

**الإجمالي التقديري:** 6S + 10M + 4L = 20 مهمة ≈ **85–125 ساعة عمل**
(≈ 2.5–3.5 أسبوع لشخص واحد)، تُقسَّم إلى 5 تسليمات: الأساس، `/api/office/*`،
اللقطة، الترخيص/الورديات، ثم الجودة. **7 مهام أُنجزت بالفعل** (الموجة A كاملة).

---

## 3) بوابات القبول (Definition of Done للمرحلة)

- [x] `pytest -q` أخضر بالكامل (**117 حاليًا**) بلا تحذيرات جديدة.
- [x] `npm test` أخضر (**76 حاليًا**).
- [x] هجرة `upgrade → downgrade → upgrade` ناجحة على SQLite + بيانات تجريبية.
- [x] `SUPERVISOR` ممنوع من كل كتابة نماذج (API) — Office يأتي في الموجة B.
- [ ] لا تغيير في أي عقد قائم (فقط حقول/نقاط إضافية).
- [ ] لا `SmartForms`/`formFileParser`/PDF.js تم لمسها.
- [ ] كل استجابة `/api/office/*` فيها `Cache-Control: no-store` ولا مسارات تخزين.
- [ ] `ONLYOFFICE_ENABLED=false` → النظام يعمل حرفيًا كاليوم (اختبار انحدار).
- [x] لا قفل ترخيص مفاجئ: `LICENSE_ENFORCE=false` افتراضيًا.
- [ ] تقرير المرحلة 3 النهائي (بعد الموجة B) مكتوب مع أوامر التحقق ومخرجاته.

---

## 4) مخاطر خاصة بالمرحلة 3

| # | الخطر | التخفيف |
|---|---|---|
| 1 | فشل Backfill على بيانات موجودة | هجرة Idempotent + اختبار على نسخة من قاعدة UAT قبل الإنتاج |
| 2 | اختلاف توقيع DS 10 عن التصميم | T3-08 يغطي الشكلين + سجل يطبع مفاتيح claims (بلا قيم حساسة) عند الرفض |
| 3 | تعارض الحفظ بعد انتهاء الجلسة | `parent_version_id` + Audit + عدم حذف أي إصدار |
| 4 | فشل LibreOffice أثناء الحفظ | `pdf_status=failed` + إعادة محاولة من worker + الحفظ لا يُفقد |
| 5 | دقة اللقطة مقابل الطباعة | Cairo + اختبار UAT + إبقاء الطباعة من المتصفح متاحة |
| 6 | حجم إضافات `requirements.txt` | تثبيت إصدارات + قياس حجم الصورة بعد T3-14 |
| 7 | بطء اختبارات الهجرة | استخدام SQLite ملف مؤقت، لا PostgreSQL، داخل الاختبار |
| 8 | اختلاف بصمة العتاد بعد تغيير الشبكة/الاسم | `/etc/machine-id` أولًا + `LICENSE_HARDWARE_ID` للتجاوز + رسالة واضحة |
| 9 | تغيير إعدادات الورديات قبل ربط الواجهة | القيم الافتراضية مطابقة + توثيق أن الواجهة تُربط في المرحلة 4 + Audit لكل تغيير |

---

## 5) الخطوة التالية

1. ✅ اعتُمد نموذج البيانات ونُفّذت **T3-03 → T3-04 → T3-18 → T3-19** بالترتيب.
2. ✅ الموجة A كاملة: `pytest 117` · `Vitest 76` · استيراد `app.main/worker` ناجح.
3. ⏳ **نقطة المراجعة الحالية:** عرض الكود والنتائج قبل بدء الموجة B.
4. بعد الموافقة: الموجة B (`/api/office/*`: T3-05…T3-13)، ثم لقطة الـ submission
   (T3-14…T3-16)، ثم بوابة الجودة والتقرير النهائي (T3-17).
5. لا `commit` على `main` قبل طلبك.
