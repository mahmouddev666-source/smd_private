# المرحلة 3 — نموذج البيانات للمراجعة (T3-03 + T3-18 + T3-19)

> **الحالة:** ✅ **معتمد من المستخدم (2026-11-21)** — نُفّذ بالكامل في
> T3-03 / T3-04 / T3-18 / T3-19.
> **يعتمد على:** `docs/ONLYOFFICE-PHASE1-DESIGN.md` §5 (المعتمد) + طلبك بإضافة
> الترخيص (T3-18) وإعدادات الورديات (T3-19).
> **ما أُنجز قبل هذه الوثيقة:** T3-00 وT3-01 وT3-02 (كل الاختبارات خضراء:
> `pytest 95` · `Vitest 76`).

---

## 0) ملخّص القرارات المطلوب اعتمادها

| # | القرار | التوصية |
|---|---|---|
| 1 | `form_files.current_version_id` **بلا FK** | ✅ نعم (تفادي دورة `create_all` على SQLite) |
| 2 | إضافة `snapshot_attempts` إلى `form_submissions` | ✅ نعم (سقف 3 محاولات في الـ worker) |
| 3 | الترخيص **ملف `license.json`** لا جدول قاعدة بيانات | ✅ نعم (الملف الموقّع هو المصدر الوحيد) |
| 4 | إعدادات الورديات في جدول **`work_settings` أحادي الصف** | ✅ نعم (قيود DB + تحقق Pydantic) |
| 5 | توقيع اختياري للترخيص (HMAC-SHA256) | ✅ نعم إن وُجد `LICENSE_SIGNING_KEY` |
| 6 | فرض الترخيص (`LICENSE_ENFORCE`) يبقى `false` افتراضيًا | ✅ نعم (لا قفل مفاجئ للإنتاج) |

---

# القسم الأول — T3-03: إصدارات المستندات وجلسات ONLYOFFICE

## 1.1 جدول جديد: `form_file_versions`

| العمود | النوع | القيود / الملاحظات |
|---|---|---|
| `id` | `String(36)` | PK (`IdMixin`) |
| `file_id` | `String(36)` | FK → `form_files.id` `ON DELETE CASCADE`، `index` |
| `version_no` | `Integer` | NOT NULL، يبدأ من 1، `CHECK >= 1` |
| `parent_version_id` | `String(36)` | FK → نفس الجدول، nullable (سلالة الحفظ) |
| `storage_path` | `String(512)` | NOT NULL، **UNIQUE**، نسبي إلى `STORAGE_DIR` |
| `pdf_path` | `String(512)` | nullable — PDF المعاينة/الطباعة لهذا الإصدار |
| `pdf_status` | `String(16)` | NOT NULL default `none` ∈ `ready/pending/failed/none` |
| `checksum` | `String(64)` | SHA-256، NOT NULL، `index` |
| `size_bytes` | `Integer` | NOT NULL، `CHECK >= 0` |
| `mime` | `String(120)` | NOT NULL |
| `extension` | `String(16)` | بدون نقطة: `docx/xlsx/doc/xls/pdf/png/jpg` |
| `kind` | `String(16)` | ∈ `word/excel/pdf/image` |
| `source` | `String(24)` | ∈ `upload/conversion/onlyoffice/restore` |
| `is_original` | `Boolean` | NOT NULL default `false` — **لا يُعدَّل أبدًا** |
| `created_by` | `String(36)` | nullable (`system` أو معرّف مستخدم) |
| `is_demo` | `Boolean` | NOT NULL default `false` |
| `created_at` | `DateTime(timezone=True)` | `server_default=now()` |

**الفهارس والقيود (في قاعدة البيانات، لا في الكود فقط):**

```python
UniqueConstraint("file_id", "version_no", name="uq_form_file_versions_file_version")

Index(
    "ux_form_file_versions_one_original",
    "file_id",
    unique=True,
    sqlite_where=text("is_original = 1"),
    postgresql_where=text("is_original"),
)
```

> `UNIQUE(file_id, checksum)` **غير موجود عمدًا**: قد تعيد «الاستعادة» محتوى
> إصدار سابق لاحقًا، فلا يجوز اعتباره تكرارًا.

## 1.2 تعديل `form_files`

| العمود | النوع | ملاحظات |
|---|---|---|
| `current_version_id` | `String(36)` | nullable، `index`، **بدون FK** |

**لماذا بدون FK؟** `form_files → form_file_versions → form_files` دورة تمنع
`Base.metadata.create_all` على SQLite (بيئة الاختبارات) وتحتاج `ALTER` غير مدعوم.
السلامة تُضمن في `VersionService` (كل كتابة تمر عبره)، ويمكن إضافة FK على
PostgreSQL وحدها لاحقًا إن لزم.

**الأعمدة القديمة تبقى كما هي** (`storage_path`, `converted_pdf_path`,
`checksum`, `size_bytes`, `mime`, `page_count`) لعدم كسر أي عقد قائم.

## 1.3 تعديل `form_templates`

| العمود | النوع | ملاحظات |
|---|---|---|
| `document_version_id` | `String(36)` | FK → `form_file_versions.id`، nullable، `index` |

**السبب:** الحقول مرسومة كنسب فوق تخطيط إصدار محدد. التثبيت يمنع «انزياح»
القالب عند تعديل المستند عبر ONLYOFFICE. القوالب الجديدة تُثبَّت على
`current_version_id` وقت الحفظ.

## 1.4 تعديل `form_submissions`

| العمود | النوع | ملاحظات |
|---|---|---|
| `document_version_id` | `String(36)` | FK → `form_file_versions.id`، nullable، `index` |
| `rendered_pdf_path` | `String(512)` | nullable — لقطة غير قابلة للتعديل |
| `rendered_checksum` | `String(64)` | nullable |
| `snapshot_status` | `String(16)` | NOT NULL default `none` ∈ `none/pending/ready/failed` |
| `snapshot_error` | `String(500)` | nullable — رسالة عربية مختصرة |
| **`snapshot_attempts`** | `Integer` | NOT NULL default `0`، `CHECK >= 0` — **إضافة تنفيذية** لسقف 3 محاولات |

**ثبات:** لا يوجد أي endpoint لتعديل `values` أو `document_version_id` أو
`rendered_pdf_path` بعد الإنشاء.

## 1.5 جدول جديد: `office_sessions`

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | `String(36)` | PK |
| `file_id` | `String(36)` | FK → `form_files.id` `ON DELETE CASCADE`، `index` |
| `version_id` | `String(36)` | FK → `form_file_versions.id` (الإصدار الذي فُتح)، `index` |
| `document_key` | `String(128)` | NOT NULL، `index` (`smd-<file>-<version>`) |
| `user_id` | `String(36)` | NOT NULL — من فتح التحرير |
| `user_name` | `String(160)` | NOT NULL — للعرض |
| `created_at` | `DateTime(timezone=True)` | NOT NULL |
| `last_seen_at` | `DateTime(timezone=True)` | NOT NULL — يتحدّث مع config/callback |
| `expires_at` | `DateTime(timezone=True)` | NOT NULL — `created + TTL` |
| `closed_at` | `DateTime(timezone=True)` | nullable |
| `close_reason` | `String(24)` | nullable ∈ `saved/saved_with_error/no_changes/expired/forced` |

**قيد التحرير الحصري:**

```python
Index(
    "ux_office_sessions_open_file",
    "file_id",
    unique=True,
    sqlite_where=text("closed_at IS NULL"),
    postgresql_where=text("closed_at IS NULL"),
)
```

> عند تفعيل `OFFICE_ALLOW_COEDITING=true` لاحقًا يُستبدل القيد بمنطق خدمة
> (لا نغيّر المخطط وقتها، فقط نُسقط الفهرس في هجرة صغيرة).

## 1.6 العلاقات (SQLAlchemy) — بلا دورات

```text
FormFile 1 ─── * FormFileVersion            (back_populates="file")
FormFileVersion 1 ─── * FormFileVersion     (parent/children، self-ref)
FormFileVersion 1 ─── * FormTemplate        (document_version_id)
FormFileVersion 1 ─── * FormSubmission      (document_version_id)
FormFile 1 ─── * OfficeSession              (back_populates="file")
```

- لا يوجد relationship لـ `FormFile.current_version` (لأن العمود بلا FK)؛
  الخدمة تستخدم `db.get(FormFileVersion, file.current_version_id)`.
- كل `FK` nullable لتوافق السجلات القديمة أثناء الهجرة.

## 1.7 ثوابت البيانات (Invariants)

1. لكل ملف إصدار `is_original=true` واحد فقط (فهرس فريد جزئي).
2. `version_no` متسلسل من 1 بلا فجوات (تخصيص تحت قفل صف الملف).
3. `current_version_id` يشير دائمًا إلى أعلى `version_no` (استثناء: استعادة لاحقة).
4. ملف الإصدار الأصلي لا يُفتح للكتابة في أي مسار برمجي.
5. `checksum` يُحسب على البايتات المخزّنة ويُعاد التحقق عند التنزيل.
6. `document_version_id` في الـ submission لا يتغيّر بعد الإنشاء.
7. لقطة PDF لا تُكتب فوقها أبدًا (المسار يحتوي `submission_id`).

## 1.8 ما لا يتغيّر في هذه المهمة

- لا حذف/إعادة تسمية لأي جدول أو عمود قائم.
- `FormFileOut` و`TemplateOut` و`SubmissionOut` تبقى متوافقة؛ الحقول الجديدة
  **اختيارية** وتُضاف في T3-15 لا الآن.
- مسار PDF.js و`SmartForms` و`formFileParser` **لا يُلمس**.

---

# القسم الثاني — T3-18: الترخيص (ملف موقّع، بلا جدول DB)

## 2.1 لماذا بلا جدول؟

1. الترخيص **بيانات إعداد** لا بيانات عمل؛ مصدرها ملف يُنقل مع الخادم.
2. جدول DB يعني نسختين قد تختلفان (ملف أحدث من صف أو العكس) → مصدر حقيقة واحد أفضل.
3. لا حاجة لعلاقات أو استعلامات؛ القراءة عند الإقلاع + كاش بالذاكرة.
4. يبقى الخادم قابلًا للتشغيل حتى لو تعذّر الوصول لقاعدة البيانات (فحص الترخيص
   لا يعتمد على DB).

> إن رغبت بسجل تدقيق زمني للتراخيص (تاريخ كل تجديد/فحص) يمكن إضافة جدول
> `license_events` لاحقًا. **غير مطلوب الآن.**

## 2.2 مخطط `license.json`

```json
{
  "schema_version": 1,
  "license_id": "6f1c2a4e-9d3b-4c7a-9f21-2b7e5a1c8d90",
  "client_name": "شركة السويس لمشتقات الميثانول",
  "hardware_id": "9f2c...64 حرف hex...a7",
  "issued_at": "2026-11-21",
  "expires_at": "2027-11-21",
  "features": ["core"],
  "signature": "base64url(HMAC-SHA256)"
}
```

| الحقل | إلزامي | التحقق |
|---|---|---|
| `client_name` | ✅ | نص 1..160 |
| `hardware_id` | ✅ | 64 حرف hex صغير |
| `issued_at` | ✅ | تاريخ ISO `YYYY-MM-DD` |
| `expires_at` | ✅ | تاريخ ISO، `> issued_at` |
| `schema_version` | ❌ | default 1 (نرفض ما ليس 1) |
| `license_id` | ❌ | UUID للعرض/التدقيق |
| `features` | ❌ | قائمة نصوص (افتراضي `["core"]`) |
| `signature` | ❌ | مطلوب **فقط** إذا وُجد `LICENSE_SIGNING_KEY` |

**التوقيع (اختياري):** `HMAC-SHA256` على JSON مُرتَّب المفاتيح (بدون `signature`)،
ثم `base64url`. إذا لم يُضبط `LICENSE_SIGNING_KEY` يُقبل الملف بلا توقيع مع
تحذير في اللوج. إذا ضُبط، فأي تعديل يدوي على الملف → `signature_invalid`.

## 2.3 بصمة العتاد (Hardware ID)

```text
hardware_id = sha256("smd-hr|" + machine_id + "|" + platform.machine()).hexdigest()
```

- `machine_id` من `/etc/machine-id` على Linux (مستقر)، وإلا `uuid.getnode()`
  + `platform.node()`.
- يمكن تجاوزه في الاختبارات/الحاويات عبر `LICENSE_HARDWARE_ID` (للاختبار فقط).
- سكربت CLI يطبع البصمة الحالية لتُرسل للمطوّر:
  `python -m app.cli.license hardware-id`.

## 2.4 الحالات (States)

| الحالة | الشرط | `status` في API |
|---|---|---|
| لا ملف ولا إعدادات قديمة | — | `unconfigured` |
| JSON غير صالح / مخطط خاطئ | — | `invalid` |
| توقيع خاطئ (عند تفعيل المفتاح) | — | `invalid` |
| بصمة العتاد لا تطابق | `hardware_id != current` | `hardware_mismatch` |
| لم يبدأ بعد | `today < issued_at` | `not_yet_valid` |
| منتهي | `today > expires_at` | `expired` |
| ينتهي خلال ≤ 30 يومًا | — | `expiring` |
| سارٍ | — | `active` |

## 2.5 الإقلاع والفرض

- عند الإقلاع (`startup`/`lifespan`): قراءة الملف + تسجيل سطر واحد **بلا أسرار**
  (الحالة، اسم العميل، تاريخ الانتهاء، الأيام المتبقية).
- `LICENSE_ENFORCE=false` (الافتراضي): **لا يمنع** أي طلب، حتى لو منتهي.
- `LICENSE_ENFORCE=true`: يرفض الإقلاع عند `expired`/`invalid`/`hardware_mismatch`
  برسالة عربية واضحة (Fail-Fast).
- `GET /api/license/status` لا يعيد 500 أبدًا؛ يُرجع الحالة مع `message` عربي.

## 2.6 عقد الـ API (متوافق مع الحالي)

نبقي الحقول القديمة ونضيف الجديدة (لا نكسر `test_license.py`):

```json
{
  "status": "active",
  "mode": "production",
  "source": "file",
  "license_key_present": true,
  "client_name": "شركة السويس لمشتقات الميثانول",
  "issued_on": "2026-11-21",
  "expires_on": "2027-11-21",
  "days_remaining": 365,
  "hardware_matches": true,
  "enforced": false,
  "message": "الترخيص سارٍ ومفعّل.",
  "checked_at": "2026-11-21T18:00:00Z"
}
```

- `source`: `file` | `env` | `none`.
- **توافق خلفي:** إن لم يوجد `license.json` واستُخدمت `LICENSE_KEY`/
  `LICENSE_EXPIRES_ON` القديمة، نُشتق الحالة منها (`source="env"`) كما اليوم.
- لا نُرجع البصمة الحالية كاملة (بيانات تعريفية للخادم)؛ فقط `hardware_matches`.

## 2.7 إعدادات جديدة في `config.py`

```python
license_file: str = "./license.json"
license_signing_key: str = ""
license_hardware_id: str = ""   # override للاختبار/الحاوية فقط
```

## 2.8 سكربت CLI (للمطوّر)

المسار: `apps/api/app/cli/license.py`

```bash
# 1) على خادم العميل: اطبع البصمة وأرسلها للمطوّر
python -m app.cli.license hardware-id

# 2) على جهاز المطوّر: أنشئ license.json
python -m app.cli.license generate \
  --client "شركة السويس لمشتقات الميثانول" \
  --hardware-id "9f2c...a7" \
  --issued 2026-11-21 \
  --expires 2027-11-21 \
  --out license.json
  # اختياري للتوقيع: --signing-key <32+ chars> أو LICENSE_SIGNING_KEY

# 3) تحقق محلي قبل التسليم
python -m app.cli.license verify --file license.json
```

- لا يطبع أي مفتاح توقيع.
- `generate --self` يستخدم بصمة الجهاز الحالي (للتجربة فقط).

## 2.9 ملفات T3-18

- `app/services/license.py` (قراءة/تحقق/حالة/كاش)
- `app/cli/license.py` (CLI)
- `app/routers/license.py` (توسيع الحالي، لا استبداله)
- `app/core/config.py` (الحقول أعلاه)
- `app/main.py` (فحص الإقلاع)
- `tests/test_license.py` (توسيع) + `tests/test_license_service.py` (جديد)

---

# القسم الثالث — T3-19: إعدادات الورديات والإضافي في قاعدة البيانات

## 3.1 لماذا جدول أحادي الصف (`work_settings`) لا Key/Value؟

- القيم **معروفة ومحدودة**؛ الأعمدة المُصنّفة تسمح بقيود `CHECK` حقيقية.
- واجهة HR تحتاج تحققًا واضحًا لكل حقل، لا JSON حر.
- مقارنة `before/after` في Audit Log تصبح مباشرة.
- generic `settings(key,value)` يفتح باب أخطاء كتابة بلا قيود.

## 3.2 الجدول: `work_settings` (صف واحد)

| العمود | النوع | القيمة الافتراضية | ملاحظات |
|---|---|---|---|
| `id` | `Integer` | 1 | PK، `CHECK id = 1` |
| `timezone` | `String(64)` | `Africa/Cairo` | توقيت الحساب |
| `normal_start` | `Time` | `08:00` | وردية عادية |
| `normal_end` | `Time` | `16:00` | |
| `day_start` | `Time` | `08:00` | وردية نهارية |
| `day_end` | `Time` | `20:00` | |
| `night_start` | `Time` | `20:00` | وردية ليلية (تقطع منتصف الليل) |
| `night_end` | `Time` | `08:00` | |
| `overtime_day_start` | `Time` | `06:00` | بداية نافذة معامل النهار |
| `overtime_cutoff` | `Time` | `18:00` | فاصل الإضافي |
| `overtime_day_multiplier` | `Numeric(4,2)` | `1.35` | `CHECK > 0 AND <= 5` |
| `overtime_night_multiplier` | `Numeric(4,2)` | `1.70` | `CHECK > 0 AND <= 5` |
| `late_grace_minutes` | `Integer` | **15** | `CHECK 0..120` (سماحية التأخير) |
| `version` | `Integer` | 1 | قفل تفاؤلي لـ PATCH |
| `updated_by` | `String(36)` | nullable | FK → `users.id` `ON DELETE SET NULL` |
| `created_at` | `DateTime(timezone=True)` | now | |
| `updated_at` | `DateTime(timezone=True)` | now | onupdate |

**قيود إضافية:**

```python
CheckConstraint("id = 1", name="ck_work_settings_singleton")
CheckConstraint("normal_start <> normal_end", name="ck_work_settings_normal_window")
CheckConstraint("day_start <> day_end", name="ck_work_settings_day_window")
CheckConstraint("night_start <> night_end", name="ck_work_settings_night_window")
CheckConstraint(
    "overtime_day_multiplier > 0 AND overtime_day_multiplier <= 5",
    name="ck_work_settings_day_multiplier",
)
CheckConstraint(
    "overtime_night_multiplier > 0 AND overtime_night_multiplier <= 5",
    name="ck_work_settings_night_multiplier",
)
CheckConstraint(
    "late_grace_minutes >= 0 AND late_grace_minutes <= 120",
    name="ck_work_settings_grace",
)
```

> الوردية الليلية تقطع منتصف الليل، لذا **لا** نفرض `end > start`؛
> التحقق الزمني (أن الفرق 8/12 ساعة منطقي) يتم في Pydantic/الخدمة.
>
> **تصحيح موثّق (2026-11-21):** القيمة الافتراضية الفعلية لـ
> `late_grace_minutes` هي **15** لا 0، لأنها القيمة المطبّقة حاليًا في
> `app/services/attendance_processor.py` و`src/utils/overtimeCalculator.ts`.
> اعتماد 0 كان سيغيّر سلوك الحضور الحالي دون موافقة HR، لذا استُخدم 15 حرفيًا
> في الهجرة والخدمة (معيار القبول: «القيم الافتراضية مطابقة للكود الحالي»).

## 3.3 البذر والسلوك الافتراضي

- الهجرة تُدرج الصف `id=1` بالقيم الحالية حرفيًا.
- `get_work_settings(db)`:
  - إن وُجد الصف → يُستخدم.
  - إن لم يوجد (اختبارات/قاعدة قديمة) → **قيم افتراضية من الثوابت** بلا كتابة.
- الثوابت `DEFAULT_SHIFT_WINDOWS` / `DEFAULT_OVERTIME` تبقى في الكود
  كمرجع/احتياطي، ويصبح الجدول هو المصدر الفعلي بعد البذر.
- تغيير الإعدادات يؤثر على **مزامنات الحضور الجديدة** فقط؛ لا نعيد حساب
  سجلات قديمة تلقائيًا (إعادة الحساب مهمة منفصلة إن طُلبت).

## 3.4 الـ API

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| `GET` | `/api/settings/work` | `ADMIN`, `HR` | قراءة الإعدادات الحالية + `version` |
| `PATCH` | `/api/settings/work` | `ADMIN`, `HR` | تعديل جزئي + `expected_version` |

- `PATCH` بلا `expected_version` = آخر كتابة تفوز (مسموح)، ومعه = `409
  SETTINGS_VERSION_CONFLICT` عند اختلاف `version`.
- كل تعديل: تحقق Pydantic + Audit Log (`settings.work.update`) مع `before/after`.
- الاستجابة بصيغة `HH:MM` للوقت و`float` للمعاملات (عرض فقط؛ التخزين `Decimal`).

## 3.5 استهلاك الخلفية

- `app/services/attendance_processor.py`: يقرأ `work_settings` مرة واحدة لكل
  دفعة، ويستخدم النوافذ/المعاملات. لا تغيير في توقيع الدوال العامة.
- `src/utils/overtimeCalculator.ts` **لا يتغيّر في هذه المرحلة**؛ القيم الحالية
  مطابقة للافتراضية فلا سلوك مختلف. ربط الواجهة بـ `GET /api/settings/work`
  بند في المرحلة 4 (مذكور صراحةً في تقرير T3-19).
  > هذا يعني: بعد أن يغيّر HR القيم، تبقى حسابات الواجهة القديمة حتى المرحلة 4.
  > لذلك يُمنع تغيير القيم في الإنتاج قبل ربط الواجهة (يُوثَّق في التقرير).

## 3.6 ملفات T3-19

- `app/models/settings.py` (جديد)
- `app/schemas/settings.py` (جديد)
- `app/services/settings.py` (جديد: get/update + audit)
- `app/routers/settings.py` (جديد)
- `app/services/attendance_processor.py` (قراءة القيم)
- `alembic/versions/<rev>_work_settings.py`
- `tests/test_work_settings.py` (جديد)
- تحديث `tests/test_attendance_processor.py` (قيم مخصصة)

---

# القسم الرابع — ترتيب الهجرات والاعتماد

```text
T3-03 (Models + create_all test)        ← بلا هجرة
   │
   ├── T3-04 (هجرة الإصدارات + backfill)
   │        │
   │        └── T3-19 (هجرة work_settings)   ← بعد T3-04 لتفادي تعدد الرؤوس
   │
   └── T3-18 (لا هجرة: ملف + CLI + endpoint + config)
```

- كل هجرة `upgrade → downgrade → upgrade` على SQLite مؤقتة.
- T3-18 لا يلمس المخطط؛ اختباراته وحدات + API فقط.

---

# القسم الخامس — قائمة المراجعة (اعتماد المستخدم)

أقرّ المستخدم القرارات الستة في القسم 0 **كما هي** في 2026-11-21:

- [x] **T3-03:** الأعمدة والفهارس أعلاه كما هي (خصوصًا `snapshot_attempts`
      و`current_version_id` بلا FK).
- [x] **الترخيص:** ملف `license.json` بلا جدول DB، مع `client_name`/
      `hardware_id`/`issued_at`/`expires_at` + توقيع اختياري.
- [x] **الترخيص:** الإبقاء على `LICENSE_ENFORCE=false` افتراضيًا (لا قفل).
- [x] **الورديات:** جدول `work_settings` أحادي الصف بالقيم الحالية
      (08–16، 08–20، 20–08، فاصل 18:00، 1.35، 1.70، سماحية 15).
- [x] **الورديات:** `GET/PATCH /api/settings/work` لـ ADMIN/HR فقط، مع
      `expected_version` اختياري.
- [x] **الورديات:** قبول أن الواجهة تبقى على القيم الحالية حتى المرحلة 4.

نُفّذ بالترتيب: **T3-03 → T3-04 → T3-18 → T3-19**. التالي: موجة
`/api/office/*` (T3-05…T3-13) ثم لقطة الـ submission (T3-14…T3-16) ثم بوابة
الجودة (T3-17)، كما في `docs/ONLYOFFICE-PHASE3-TASKS.md`.
