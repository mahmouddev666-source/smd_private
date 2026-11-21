# المرحلة 1 — التصميم المعماري لمحرّك المستندات (ONLYOFFICE)

> **المشروع:** SMD-HR — شركة السويس لمشتقات الميثانول
> **الوثيقة:** تصميم معماري تفصيلي — المرحلة 1 من 7
> **التاريخ:** 2026-11-17
> **الحالة:** بانتظار الموافقة — **لا يتضمّن هذا المستند أي كود تطبيقي أو ملفات Docker**
> **يعتمد على:** تقرير المرحلة 0 (تدقيق المعمارية) + قرارات المالك التسعة

---

## 0) ملخّص تنفيذي

الحل الحالي هو محرّك **Overlay** فوق PDF/الصور، مع تخزين الملفات على الخادم
وتحويل Word/Excel إلى PDF عبر LibreOffice. لا يوجد تحرير فعلي لمحتوى OOXML،
ولا نسخ (Versions)، ولا مسار آمن لجلب المستند من خدمة خارجية.

التصميم المقترح يضيف طبقة **تحرير OOXML** عبر ONLYOFFICE Document Server
مع الحفاظ الكامل على المسار الحالي (Overlay + PDF.js + الديمو) كمسار احتياطي
وقابل للإطفاء بعلامة ميزة واحدة.

**المبادئ الحاكمة:**

1. المستند الأصلي **لا يُستبدل ولا يُكتب فوقه** — كل حفظ = إصدار جديد.
2. كل عملية كتابة تمر عبر تحقق Pydantic + صلاحية + Audit Log.
3. التنزيل إلى ONLYOFFICE يتم بتوكن قصير العمر، والـ Callback يتحقق من توقيع
   ONLYOFFICE نفسه (توقيعان مستقلان).
4. لا يعتمد أي قرار على اسم الملف أو الامتداد وحده — magic bytes + checksum.
5. عند إطفاء `ONLYOFFICE_ENABLED` / `VITE_ONLYOFFICE_ENABLED` يعود النظام
   لسلوكه الحالي حرفياً (Rollback بلا هجرة عكسية إجبارية).
6. العربية وRTL أولاً: خطوط عربية في حاوية ONLYOFFICE وفي مولّد PDF،
   واختبار UAT إلزامي للاتجاه والخط.

---

## 1) القرارات المعتمدة (مُلزمة للتنفيذ)

| # | القرار | القيمة المعتمدة | الأثر التصميمي |
|---|---|---|---|
| 1 | وصول المتصفح للمحرّر | بروكسي same-origin عبر `/onlyoffice/` | لا منفذ `8080` منشوراً؛ Nginx يمرّر WS + `X-Forwarded-Host` |
| 2 | `.doc` / `.xls` | تحويل إلى OOXML عند الرفع مع الاحتفاظ بالأصل `v1` | إصداران عند الرفع القديم: `v1` أصلي + `v2` محوّل |
| 3 | استبقاء النسخ | الاحتفاظ بكل النسخ (سجل تدقيق) | `OFFICE_VERSION_RETENTION=0` (بلا حذف) |
| 4 | صلاحية التحرير | `ADMIN` و`HR` فقط | `DOCUMENT_EDITOR_ROLES` جديدة، واستبعاد `SUPERVISOR` |
| 5 | الحفظ | إصدار جديد + تجاهل الحفظ المطابق بـ SHA-256 | مقارنة مع **الإصدار الحالي** فقط، وليس كل التاريخ |
| 6 | لقطة الـ Submission | ربط بـ `document_version_id` + PDF مولّد | خدمة Render جديدة + عمودان + حالة |
| 7 | الكود القديم | عدم اللمس + `@deprecated` | لا حذف لـ `SmartForms` / `formFileParser` |
| 8 | النشر | HTTP داخلي فقط | لا TLS؛ Same-origin عبر المنفذ 80 |
| 9 | العتاد | 8GB RAM / 4 CPU | حدود DS: 2–4GB، مع مراقبة الحد المتزامن |

**إصلاحات إلزامية ضمن هذه الخطة:** R5 (خطأ 422 في pagination) وR6 (تعارض الأدوار)
وR10 (الخطوط العربية في ONLYOFFICE).

---

## 2) النطاق

### داخل النطاق

- تحرير DOCX/XLSX عبر ONLYOFFICE (بما يشمل `.doc`/`.xls` بعد التحويل).
- نسخ متعددة لكل ملف، مع سجل منشأ (`source`) وتسلسل (`parent_version_id`).
- نقاط API جديدة تحت `/api/office/*` + تعديلات متوافقة على `/api/forms/*`.
- لقطة PDF ثابتة لكل Submission.
- بروكسي Nginx لـ `/onlyoffice/` + حاوية DS مخصّصة بالخطوط العربية.
- علامات ميزة خلفية/أمامية + مسار احتياطي تلقائي.
- إصلاح R5/R6 فوراً، وإضافة اختبارات الانحدار.

### خارج النطاق (هذه الدورة)

- تحرير PDF داخل ONLYOFFICE (يبقى PDF.js + Overlay كما هو).
- توقيع إلكتروني / ختم رقمي / OCR.
- مزامنة تاريخ التغييرات بين DS والتطبيق (`refreshHistory`) — يُسجّل فقط
  `changesurl` في Audit إن رغبنا لاحقاً.
- استعادة إصدار قديم كإصدار جديد (Restore) — النموذج يدعمها لاحقاً،
  لكنها ليست ضمن المرحلة 5.
- Co-editing متعدد المستخدمين افتراضياً (العلم موجود، الافتراضي `false`).
- HTTPS / شهادات.

---

## 3) المعمارية العامة

### 3.1 مخطط السياق

```
┌──────────────────────────── جهاز الشركة (8GB / 4 CPU) ────────────────────────────┐
│                                                                                   │
│  المتصفح                                                                          │
│    │  http://<host>/            (React + assets)                                  │
│    │  http://<host>/api/*       (REST)                                            │
│    │  http://<host>/onlyoffice/*(iframe + WebSocket)                              │
│    ▼                                                                              │
│  ┌──────────────┐   /api/        ┌──────────────┐    SQL      ┌──────────────┐   │
│  │  web (Nginx) │ ─────────────► │  api:8000    │ ──────────► │   db:5432    │   │
│  │   :80 فقط    │                │  FastAPI     │             │ PostgreSQL 16│   │
│  │              │  /onlyoffice/  │              │             └──────────────┘   │
│  │              │ ─────────────► │              │                                 │
│  └──────────────┘                └──────┬───────┘                                 │
│         │                              │  ▲                                       │
│         │ WS/HTTP                      │  │ JWT (callback)                        │
│         ▼                              │  │                                       │
│  ┌──────────────┐                      │  │        ┌───────────────────────────┐  │
│  │ onlyoffice:80│ ─────────────────────┘  └────────│ api:8000 (download/callback)│ │
│  │ DS 10.x      │  GET document.url (JWT header)    └───────────────────────────┘  │
│  │ + خطوط عربية │  POST callbackUrl (JWT in body)                                  │
│  └──────────────┘                                                                 │
│         │                                                                         │
│  volumes: oo_data / oo_logs / oo_lib / oo_db / oo_rabbitmq                       │
│  volumes: uploads (المصدر النهائي للحقيقة) / backups / db_data                     │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**حقائق الشبكة:**

- المتصفح لا يتصل بـ `onlyoffice` مباشرة؛ كل شيء عبر Nginx على المنفذ 80.
- DS يتصل بـ `api:8000` داخلياً فقط (اسم الخدمة على شبكة `smd`).
- API لا يعتمد على DS لتحويل PDF (LibreOffice محلي)، ويستخدم DS للفحص الصحي فقط.
- `uploads` + PostgreSQL هما مصدر الحقيقة؛ مجلدات DS قابلة لإعادة البناء.

### 3.2 تدفق فتح مستند

```
1. المستخدم (ADMIN/HR) يضغط «تحرير المستند» في FormsManager
2. React → GET /api/office/config/{file_id}   (Bearer)
3. API: تحقق دور + علم + نوع + إصدار حالي + جلسة تحرير
4. API: يولّد توكن DS (config) + توكن تنزيل (10 دقائق) + توكن callback (12 ساعة)
5. API يرجع {documentServerUrl, config{..., token}, session, version}
6. React يحمّل /onlyoffice/web-apps/apps/api/documents/api.js ثم يركّب <DocumentEditor/>
7. DS يفتح iframe من نفس الأصل → Nginx → DS
8. DS يطلب document.url من api:8000 (Authorization: DS download JWT + توكن URL)
9. المستخدم يحرّر؛ عند الإغلاق/الحفظ يرسل DS POST callbackUrl
10. API يتحقق من توقيعين، ينزّل الملف، يتحقق منه، ينشئ إصداراً جديداً،
    يعيد توليد PDF المعاينة، ويحدّث الواجهة
```

### 3.3 تدفق الحفظ (مبسّط)

```
DS ──POST callback(status=2/6, url)──► API
                                       ├─ تحقق URL-token + DS-JWT + key/status
                                       ├─ allowlist(url.host == onlyoffice)
                                       ├─ تنزيل محدود الحجم + magic bytes + SHA-256
                                       ├─ إذا checksum == current_version.checksum → تجاهل
                                       ├─ كتابة ذرّية v(n+1) + parent_version_id
                                       ├─ تحديث form_files.current_version_id
                                       ├─ تحويل PDF (pdf/vN.pdf) — فشل ≠ فقدان الحفظ
                                       ├─ إغلاق/تجديد الجلسة + Audit
                                       └─ {"error": 0}
```

---

## 4) البنية التحتية والشبكة

### 4.1 خدمات Compose

| الخدمة | الصورة | المنفذ | يعتمد على | ملاحظات |
|---|---|---|---|---|
| `db` | `postgres:16-alpine` | داخلي | — | كما هو |
| `api` | بناء `apps/api` | داخلي `8000` | `db` | يضاف `ONLYOFFICE_*` |
| `worker` | بناء `apps/api` | — | `api` | مهام: تحويل PDF المعلّق + لقطات PDF |
| `web` | بناء `infra/web` | **`80` منشور** | `api`, `onlyoffice` | Nginx + SPA + `/api` + `/onlyoffice` |
| `onlyoffice` | بناء `infra/onlyoffice` (FROM DS مثبّت) | **داخلي فقط** | — | JWT + خطوط عربية + Volumes |

**قرار:** لا يُنشر منفذ DS على المضيف. للتصحيح المؤقت فقط يُسمح بـ
`127.0.0.1:8080:80` عبر profile اختياري (`profiles: ["debug"]`).

### 4.2 متغيّرات حاوية ONLYOFFICE

| المتغيّر | القيمة | السبب |
|---|---|---|
| `JWT_ENABLED` | `true` | إلزامي |
| `JWT_SECRET` | `${ONLYOFFICE_JWT_SECRET}` | سر مشترك مع API (≥32 حرفاً) |
| `JWT_HEADER` | `Authorization` | للطلبات الصادرة |
| `JWT_IN_BODY` | `true` | التوكن داخل جسم الـ callback + الطلبات الصادرة |
| `TZ` | `${TZ:-Africa/Cairo}` | توحيد الوقت |

### 4.3 Volumes

```text
oo_data       → /var/www/onlyoffice/Data
oo_logs       → /var/log/onlyoffice
oo_lib        → /var/lib/onlyoffice
oo_db         → /var/lib/postgresql
oo_rabbitmq   → /var/lib/rabbitmq
```

> هذه Volumes ليست مصدر الحقيقة. النسخ الاحتياطي المعتمد يبقى:
> `pg_dump` + مجلد `uploads` (الذي يحتوي كل الإصدارات ولقطات PDF).

### 4.4 صورة DS مخصّصة بالخطوط العربية (R10)

**المشكلة:** الصورة الرسمية لا تضمن خطوطاً عربية كاملة؛ النتيجة تشويه/قطع
الحروف أو اقتراح خطوط بديلة عند فتح مستند عربي.

**التصميم:**

```
infra/onlyoffice/Dockerfile
  FROM onlyoffice/documentserver:<tag-مثبّت>
  RUN apt-get update && apt-get install -y --no-install-recommends \
        <حزم الخطوط العربية المتاحة في قاعدة الصورة> \
      && fc-cache -fv \
      && rm -rf /var/lib/apt/lists/*
  # إعادة بناء قائمة الخطوط التي يستخدمها المحرّر
  RUN /usr/bin/documentserver-generate-allfonts.sh || true
```

**ملاحظات تنفيذية (تُتحقّق في المرحلة 2):**

- أسماء الحزم تختلف بين إصدارات قاعدة الصورة؛ تُختار أثناء البناء الفعلي
  (المرشّحات: Noto Naskh Arabic / Amiri / KACST / Scheherazade).
- إذا فشل السكربت وقت البناء (لأنه يحتاج خدمات DS)، يُشغّل مرة واحدة بعد
  أول إقلاع: `docker compose exec onlyoffice documentserver-generate-allfonts.sh`،
  ويُوثّق ذلك في دليل التشغيل.
- معيار القبول: مستند DOCX عربي بخط Cairo/Amiri يظهر في المحرّر بلا حروف مقطّعة،
  ويُطبع بنفس الشكل.

### 4.5 Nginx — البروكسي نفس الأصل

```nginx
# WS upgrade map (مستوى http)
map $http_upgrade $office_connection {
    default upgrade;
    ""      close;
}

# داخل server { listen 80; ... }
location /onlyoffice/ {
    proxy_pass http://onlyoffice/;
    proxy_http_version 1.1;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $office_connection;
    proxy_set_header X-Forwarded-Host $host/onlyoffice;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # لا نضبط Host يدوياً: DS يعتمد على X-Forwarded-Host للمسار الافتراضي.
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
```

**لماذا `X-Forwarded-Host` مع المسار؟** هذا هو الأسلوب الرسمي لدعم «virtual path»
(مستودع `ONLYOFFICE/document-server-proxy`). بدونه يولّد DS روابط مطلقة من الجذر
(`/9.x.x-.../`) فتفشل الأصول.

**ملاحظات:**

- `server` الحالي يضيف `X-Frame-Options: SAMEORIGIN` — وهذا متوافق الآن لأن
  الـ iframe من نفس الأصل.
- لا نضيف `add_header` داخل `location /onlyoffice/` حتى لا نُلغي وراثة رؤوس
  الـ server.
- WebSocket يمرّ عبر نفس الموقع (DS يستخدم `/onlyoffice/doc/...`).
- لتقليل تسريب التوكنات: سجل وصول مخصّص لهذا الموقع بدون `$args`
  (يُطبّق أيضاً على `/api/office/download`).

### 4.6 الاتصال الداخلي (DS → API)

| الاستخدام | العنوان |
|---|---|
| تنزيل المستند | `http://api:8000/api/office/download/{file_id}?token=…` |
| Callback | `http://api:8000/api/office/callback/{file_id}?token=…` |
| فحص صحة DS من API | `http://onlyoffice/healthcheck` |

> لا تُستخدم عناوين `localhost` أو IPs ثابتة؛ الأسماء عبر شبكة `smd`.

---

## 5) نموذج البيانات

### 5.1 العلاقات

```
form_files 1 ──── * form_file_versions
     │ 1                     │ 1
     │                       ├──── * form_submissions.document_version_id
     │                       └──── 1 form_templates.document_version_id (pinned)
     ├──── * form_templates.file_id
     └──── * office_sessions.file_id

form_file_versions.parent_version_id ──► form_file_versions.id (self FK)
```

### 5.2 جدول جديد: `form_file_versions`

| العمود | النوع | القيود/الملاحظات |
|---|---|---|
| `id` | String(36) | PK (IdMixin) |
| `file_id` | String(36) | FK → `form_files.id` `ON DELETE CASCADE`، index |
| `version_no` | Integer | NOT NULL، `UNIQUE(file_id, version_no)` |
| `parent_version_id` | String(36) | FK → نفس الجدول، nullable (سلالة الإصدار) |
| `storage_path` | String(512) | NOT NULL، نسبي إلى `STORAGE_DIR`، unique |
| `pdf_path` | String(512) | nullable — PDF المعاينة/الطباعة لهذا الإصدار |
| `pdf_status` | String(16) | `ready` \| `pending` \| `failed` \| `none` |
| `checksum` | String(64) | SHA-256، index |
| `size_bytes` | Integer | NOT NULL |
| `mime` | String(120) | NOT NULL |
| `extension` | String(16) | `docx/xlsx/doc/xls/pdf/png/jpg…` (بدون نقطة) |
| `kind` | String(16) | `word` \| `excel` \| `pdf` \| `image` |
| `source` | String(24) | `upload` \| `conversion` \| `onlyoffice` \| `restore` |
| `is_original` | Boolean | NOT NULL default false — أصل غير قابل للتعديل |
| `is_demo` | Boolean | NOT NULL default false |
| `created_by` | String(36) | nullable (مستخدم أو `system`) |
| `created_at` | DateTime | TimestampMixin |

**قيود سلامة:**

- فهرس فريد جزئي: نسخة أصلية واحدة لكل ملف
  `UNIQUE(file_id) WHERE is_original = true`.
- لا يوجد `UNIQUE(file_id, checksum)` — لأن الاستعادة لاحقاً قد تعيد محتوى سابقاً.

### 5.3 تعديلات `form_files`

| العمود | النوع | ملاحظات |
|---|---|---|
| `current_version_id` | String(36) | nullable، index — **بدون FK** لتجنّب دورة إنشاء الجداول على SQLite؛ يُضمن بالخدمة |

**لماذا بدون FK؟** `form_files → form_file_versions → form_files` دورة تمنع
`create_all` على SQLite (بيئة الاختبارات) وتحتاج `ALTER` غير مدعوم. نتحقق في
الخدمة (كل كتابة تمر عبر `VersionService`) ونضيف FK لاحقاً إن لزم على PostgreSQL
وحدها.

**أعمدة قديمة تبقى كما هي:**

- `storage_path` / `converted_pdf_path` / `checksum` / `size_bytes` / `mime`
  = بيانات الرفع الأصلي (Immutable) وللتوافق مع endpoints الحالية.
- عند إنشاء إصدار جديد تُحدَّث فقط `current_version_id` و`converted_pdf_path`
  (للمعاينة القديمة) و`page_count`.

### 5.4 تعديلات `form_templates`

| العمود | النوع | ملاحظات |
|---|---|---|
| `document_version_id` | String(36) | FK → `form_file_versions.id`، nullable، index |

**السبب:** الحقول مرسومة كنسب فوق تخطيط إصدار محدد. تثبيت الإصدار يمنع
«انزياح» القوالب القديمة عند تعديل المستند عبر ONLYOFFICE. القوالب الجديدة
تُثبّت على `current_version_id` وقت الحفظ.

### 5.5 تعديلات `form_submissions`

| العمود | النوع | ملاحظات |
|---|---|---|
| `document_version_id` | String(36) | FK → `form_file_versions.id`، nullable (توافق قديم) |
| `rendered_pdf_path` | String(512) | nullable — لقطة غير قابلة للتعديل |
| `rendered_checksum` | String(64) | nullable |
| `snapshot_status` | String(16) | `none` \| `pending` \| `ready` \| `failed` |
| `snapshot_error` | String(500) | nullable — رسالة عربية مختصرة |

**ثبات:** بعد إنشاء الـ submission لا يوجد أي endpoint لتعديل `values` أو
`document_version_id` أو `rendered_pdf_path`.

### 5.6 جدول جديد: `office_sessions`

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | String(36) | PK |
| `file_id` | String(36) | FK → `form_files.id`، index |
| `version_id` | String(36) | FK → `form_file_versions.id` (الإصدار الذي فُتح) |
| `document_key` | String(128) | مفتاح DS |
| `user_id` | String(36) | من فتح التحرير |
| `user_name` | String(160) | للعرض |
| `created_at` | DateTime | |
| `last_seen_at` | DateTime | يتحدّث مع config/callback |
| `expires_at` | DateTime | `created + OFFICE_SESSION_TTL_MINUTES` |
| `closed_at` | DateTime | nullable |
| `close_reason` | String(24) | `saved` \| `saved_with_error` \| `no_changes` \| `expired` \| `forced` |

**قيد:** فهرس فريد جزئي `UNIQUE(file_id) WHERE closed_at IS NULL` — تحرير
حصري افتراضي (Co-editing معطّل). عند تفعيل العلم لاحقاً يُستبدل القيد بمنطق خدمة.

### 5.7 ثوابت البيانات (Invariants)

1. لكل ملف نسخة `is_original=true` واحدة فقط.
2. `version_no` متسلسل من 1 بلا فجوات (تخصيص تحت قفل صف الملف).
3. `current_version_id` يشير دائماً إلى أعلى `version_no` (استثناء: استعادة لاحقة).
4. ملف النسخة الأصلية لا يُفتح للكتابة في أي مسار برمجي.
5. `checksum` يُحسب على البايتات المخزّنة ويُعاد التحقق عند التنزيل.
6. `document_version_id` في الـ submission لا يتغيّر بعد الإنشاء.
7. لقطة PDF لا تُكتب فوقها أبداً (المسار يحتوي `submission_id`).

### 5.8 تخطيط التخزين

```text
STORAGE_DIR/
  forms/
    <legacy-uuid>.docx              ← ملفات موجودة قبل الترقية (تبقى كما هي)
    pdf/<legacy-uuid>.pdf           ← معاينة قديمة (تبقى)
    <file_id>/
      v1_original.docx              ← الأصلي (immutable)
      v2_<checksum8>.docx           ← محوّل من .doc أو أول حفظ
      v3_<checksum8>.docx
      pdf/
        v1.pdf
        v2.pdf
      submissions/
        <submission_id>.pdf
```

- الملفات القديمة لا تُنقل (تفادي مخاطرة الهجرة)؛ تُسجَّل `v1` بمساراتها الحالية.
- كل كتابة جديدة: `temp` داخل نفس المجلد → `os.replace` (ذرّية على نفس القرص).
- عند الترقية: `pdf_path` = `converted_pdf_path` للملفات المكتبية، و`storage_path`
  لملفات PDF، و`NULL` مع `pdf_status=none` للصور (تُغلَّف وقت اللقطة).

### 5.9 هجرة Alembic (مخطط)

**مراجعة جديدة بعد `a6095e343c3b`** — مثال اسم: `c3f1a7b9d2e4_office_versioning.py`.

```text
upgrade():
  1. create_form_file_versions()
  2. add form_files.current_version_id (indexed, no FK)
  3. add form_templates.document_version_id (FK, nullable)
  4. add form_submissions: document_version_id, rendered_pdf_path,
     rendered_checksum, snapshot_status, snapshot_error
  5. create_office_sessions()
  6. data backfill (Python loop عبر op.get_bind()):
       لكل form_files قديم:
         v1 = uuid4()
         INSERT version(version_no=1, is_original=true, source='upload',
              storage_path=f.storage_path, pdf_path=f.converted_pdf_path,
              pdf_status = ready (Office مع PDF) / ready (PDF) /
                           none (صورة) / failed (Office بلا PDF),
              checksum, size, mime,
              extension=Path(storage_path).suffix, kind, created_by, created_at)
         UPDATE form_files SET current_version_id=v1
         UPDATE form_templates SET document_version_id=v1 WHERE file_id=f.id
         UPDATE form_submissions SET document_version_id=v1
              WHERE template_id IN (قوالب هذا الملف)
  7. indexes/constraints

downgrade():
  drop columns (batch_alter_table) ثم drop tables
  (ملفات التخزين تبقى — تُنظّف يدوياً عند الحاجة)
```

**ملاحظات:**

- تُستخدم `op.batch_alter_table` لدعم SQLite في الاختبارات.
- الهجرة idempotent عملياً: لا تُنشئ `v1` إن وُجد سجل للملف.
- اختُبرت Up/Down محلياً قبل الدمج (بوابة قبول المرحلة 3).

---

## 6) الأمان والتوكنات

### 6.1 ثلاثة أنواع من التوكنات

| # | التوكن | المُصدر | المستهلك | السر | العمر |
|---|---|---|---|---|---|
| T1 | Access Token (موجود) | API | React | `SECRET_KEY` | 480 دقيقة |
| T2 | Office URL Token (تنزيل/كولباك) | API | DS | `OFFICE_TOKEN_SECRET` (أو `SECRET_KEY`) | تنزيل 10 د، كولباك 12 س |
| T3 | ONLYOFFICE JWT (config + callback) | API / DS | DS / API | `ONLYOFFICE_JWT_SECRET` | config: جلسة؛ callback: من DS |

**الفصل إلزامي:** T2 لا يُغني عن T3. مهاجم يقرأ config من المتصفح يرى T2
(لأن DS يحتاجه)، لكنه لا يستطيع توقيع T3. لذلك:

- `/api/office/download`: يتحقق من **T2** + (إن وُجد) **T3/download**.
- `/api/office/callback`: يتحقق من **T2** + **T3/callback** إلزامياً.

### 6.2 T2 — توكنات URL

**تنزيل:**

```json
{
  "aud": "office:download",
  "typ": "office_url",
  "sub": "<user_id>",
  "fid": "<file_id>",
  "vid": "<version_id>",
  "jti": "<uuid>",
  "iat": 1700000000,
  "exp": 1700000600
}
```

**كولباك:**

```json
{
  "aud": "office:callback",
  "typ": "office_url",
  "fid": "<file_id>",
  "sid": "<session_id>",
  "jti": "<uuid>",
  "iat": 1700000000,
  "exp": 1700043200
}
```

**التحقق:**

- `jwt.decode(..., audience=..., algorithms=["HS256"], leeway=30)`.
- `typ == "office_url"` و`fid` يطابق مسار الطلب.
- للتنزيل: `vid` ينتمي فعلاً إلى `fid` (استعلام واحد).
- التوكن **قابل لإعادة الاستخدام** خلال صلاحيته (DS يعيد المحاولة)؛ لا نحرقه.
- يُسجّل `jti` في Audit عند أول استخدام فقط (Best-effort) لكشف الشذوذ.

**مخاطر متبقية:** توكن التنزيل مرئي في config. تخفيف: TTL قصير + التحقق من
T3/download إن أرسله DS + عدم تسجيل `$args` + `Cache-Control: no-store`.

### 6.3 T3 — توقيع ONLYOFFICE

**توليد config (من API):**

- نبني كائن الإعداد كاملاً (document + editorConfig + documentType).
- نستبعد `token` ثم نوقّع:
  `token = jwt.encode(config_without_token, ONLYOFFICE_JWT_SECRET, algorithm="HS256")`.
- الحمولة = بنية config نفسها (وفق وثائق DS 10.x)، وليس مغلّفة بـ `payload`.

**التحقق من callback (من DS):**

- التوكن قد يكون في `Authorization: Bearer …` أو في `body.token`
  (`JWT_IN_BODY=true`)، وفي الحالتين قد يكون:
  - مسطّحاً + `operation` (وضع body في DS ≥ 10)، أو
  - `{"payload": {...}, "operation": "callback"}` (وضع header).
- نطبّع:
  ```text
  claims = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
  operation = claims.get("operation")        # يجب أن يكون None أو "callback"
  data      = claims.get("payload") or {k: v for k, v in claims.items() if k != "operation"}
  ```
- نرفض إذا:
  - التوقيع غير صالح / الخوارزمية ليست HS256.
  - `operation` موجود وليس `"callback"` (يمنع إعادة استخدام توكن تنزيل).
  - `data["key"]` لا يطابق `document.key` المتوقّع للجلسة.
  - `status` ليس ضمن `{1,2,3,4,6,7}`.
  - جسم الطلب يحتوي حقولاً تتعارض مع claims (إن أُرسل الاثنان).
- **لا نعتمد على `exp`** في توكن DS (قد لا يوجد)؛ الحماية من التكرار عبر
  `key` + `checksum` + `status`.

**التحقق من T3/download (اختياري لكنه مفعّل افتراضياً):**

- DS يرسل على طلب GET للمستند: `Authorization: Bearer <jwt>` بحمولة
  `{payload: {url}, operation: "download"}`.
- نتحقق من التوقيع و`operation == "download"` و`payload.url` يطابق
  (path + query) لعنوان الطلب.
- إذا كانت النسخة المثبّتة لا ترسل الرأس، يُطفأ الفحص بـ
  `OFFICE_REQUIRE_DS_DOWNLOAD_TOKEN=false` (قرار المرحلة 2 بعد الاختبار).

### 6.4 منع SSRF عند جلب `url` من الـ callback

1. `urlparse` والتحقق من:
   - scheme = `http` فقط (شبكة داخلية).
   - `hostname == settings.onlyoffice_internal_host` (افتراضي `onlyoffice`).
   - لا `username/password`، لا منفذ غريب (80 أو بلا منفذ).
   - المسار يبدأ بـ `/cache/files/` أو `/download/` (حسب نسخة DS).
2. `httpx` مع `follow_redirects=False`.
3. تنزيل متدفّق بسقف `OFFICE_MAX_CALLBACK_MB` (افتراضي 50MB) مع قطع الاتصال
   عند التجاوز.
4. `Content-Length` إن وُجد > السقف → رفض مبكر.
5. التحقق من magic bytes بعد التنزيل: يجب أن تطابق `kind` والامتداد المتوقع.
6. لا تُقبل أي استجابة HTML/JSON.

### 6.5 صلاحيات المستخدمين

| العملية | VIEWER | SUPERVISOR | HR | ADMIN |
|---|---|---|---|---|
| عرض/معاينة/طباعة PDF | ✅ | ✅ | ✅ | ✅ |
| تنزيل PDF المعاينة | ✅ | ✅ | ✅ | ✅ |
| رفع ملف | ❌ | ❌ (بعد R6) | ✅ | ✅ |
| تصميم/تعديل قالب | ❌ | ❌ (بعد R6) | ✅ | ✅ |
| حفظ Submission | ❌ | ❌ (بعد R6) | ✅ | ✅ |
| فتح ONLYOFFICE | ❌ | ❌ | ✅ | ✅ |
| تنزيل ملف Office الأصلي/إصدار | ❌ | ❌ | ✅ | ✅ |
| قائمة الإصدارات | ✅ (بيانات وصفية) | ✅ | ✅ | ✅ |
| إغلاق جلسة تحرير قسراً | ❌ | ❌ | ✅ | ✅ |

> ملاحظة R6: تغيير صلاحيات النماذج من `EDITOR_ROLES` (ADMIN/HR/SUPERVISOR) إلى
> `DOCUMENT_EDITOR_ROLES` (ADMIN/HR) هو **تغيير سلوك مقصود** بموافقة المالك،
> ويُغطّى باختبارات API وواجهة.

### 6.6 رؤوس ومعالجات

- `Cache-Control: no-store` على كل استجابات `/api/office/*` والتنزيلات.
- `X-Content-Type-Options: nosniff` (موجود).
- `Content-Disposition: attachment` لتنزيل DS، و`inline` للمعاينة.
- عدم إرجاع أي مسار تخزين داخلي في أي استجابة.
- تسجيل الأحداث الحساسة دون توكنات أو query strings.

---

## 7) عقود الـ API

كل المسارات تحت `/api`. الأخطاء بالشكل الموحّد:
`{"detail": "<رسالة عربية>", "code": "<CODE>"}`.

### 7.1 `GET /api/office/status`

- **المصادقة:** أي مستخدم مسجّل.
- **الغرض:** هل الخدمة مفعّلة ومتاحة (لفحص الواجهة والتشخيص)؟
- **الاستجابة 200:**

```json
{
  "enabled": true,
  "available": true,
  "documentserverVersion": "10.0.0",
  "checkedAt": "2026-11-17T10:00:00+02:00"
}
```

- `available` = نتيجة `GET http://onlyoffice/healthcheck` بمهلة 2 ثانية،
  مع كاش 30 ثانية.
- لا يكشف أسراراً أو عناوين داخلية.

### 7.2 `GET /api/office/config/{file_id}`

- **المصادقة:** Bearer + `DOCUMENT_EDITOR_ROLES`.
- **Query اختياري:** `version_id` (للقراءة فقط إن أردنا لاحقاً؛ افتراضياً الحالي).
- **الشروط المسبقة:** العلم مفعّل، الملف نشط، `kind ∈ {word, excel}`،
  الإصدار الحالي موجود، لا جلسة نشطة لمستخدم آخر (إلا إذا انتهت صلاحيتها).
- **الاستجابة 200:**

```json
{
  "documentServerUrl": "/onlyoffice",
  "session": {
    "id": "…",
    "expiresAt": "2026-11-17T11:00:00+02:00"
  },
  "version": {
    "id": "…",
    "number": 3,
    "extension": "docx",
    "isOriginal": false,
    "checksum": "…"
  },
  "config": {
    "documentType": "word",
    "document": {
      "fileType": "docx",
      "key": "smd-<file_id>-<version_id>",
      "title": "نموذج إجازة.docx",
      "url": "http://api:8000/api/office/download/<file_id>?token=…",
      "permissions": {
        "edit": true,
        "download": false,
        "print": true,
        "copy": true,
        "comment": false,
        "review": false,
        "fillForms": true
      }
    },
    "editorConfig": {
      "mode": "edit",
      "lang": "ar",
      "callbackUrl": "http://api:8000/api/office/callback/<file_id>?token=…",
      "user": {"id": "<user_id>", "name": "<الاسم>"},
      "customization": {
        "autosave": true,
        "forcesave": false,
        "compactHeader": true,
        "hideRightMenu": false,
        "help": false,
        "uiTheme": "theme-light"
      }
    },
    "token": "<T3>"
  }
}
```

- ملاحظة: `documentType` للجداول هو `"cell"` وليس `"excel"`.
- `download:false` يمنع «تنزيل باسم» من داخل المحرّر (المسار الرسمي هو نسخ
  الإصدارات من التطبيق).
- **أخطاء:**
  - `403 ROLE_FORBIDDEN`
  - `404 FORM_FILE_NOT_FOUND` / `OFFICE_VERSION_NOT_FOUND`
  - `409 OFFICE_SESSION_ACTIVE` + `{"owner": "<اسم>"}`
  - `415 OFFICE_FORMAT_UNSUPPORTED`
  - `422 OFFICE_LEGACY_NOT_CONVERTED`
  - `503 OFFICE_DISABLED` / `OFFICE_UNAVAILABLE`

### 7.3 `GET /api/office/download/{file_id}?token=…`

- **المصادقة:** T2 (`aud=office:download`) + T3/download إن وُجد.
- **الاستجابة 200:** بث الملف (`FileResponse` أو StreamingResponse).
  - `Content-Type` من `version.mime`.
  - `Content-Disposition: attachment; filename="…_v3.docx"`.
  - `Content-Length`, `Cache-Control: no-store`.
- **أخطاء:** `401 OFFICE_TOKEN_INVALID` (منتهي/توقيع/جمهور/معرّف)،
  `404`، `409` إن أُلغيت الجلسة (اختياري).
- **ممنوع:** الوصول عبر Bearer مستخدم هنا (DS لا يملكه).

### 7.4 `POST /api/office/callback/{file_id}?token=…`

- **المصادقة:** T2 + T3 إلزامياً.
- **الجسم:** قد يكون بيانات DS كاملة، أو `{"token": "…"}` فقط (وضع body).
- **الاستجابة 200:** `{"error": 0}` (دائماً عند القبول).
- **آلة الحالات:**

| status | المعنى | السلوك |
|---|---|---|
| 1 | فتح/إغلاق اتصال | تحديث `last_seen_at` + `{"error":0}` |
| 2 | جاهز للحفظ | تنزيل + تحقق + إصدار جديد + PDF + إغلاق الجلسة (`saved`) |
| 3 | خطأ حفظ | Audit + إغلاق الجلسة (`saved_with_error`) + `{"error":0}` |
| 4 | إغلاق بلا تغيير | إغلاق الجلسة (`no_changes`) + `{"error":0}` |
| 6 | حفظ قسري | مثل 2 مع `forcesavetype` في Audit، دون إغلاق الجلسة |
| 7 | خطأ حفظ قسري | Audit + `{"error":0}` (لا نعيد 5xx لتجنّب حلقة) |

- **حالات الرفض:**
  - `401 OFFICE_CALLBACK_JWT_INVALID` → `{"error": 1}`
  - `400 OFFICE_CALLBACK_PAYLOAD_INVALID`
  - `400 OFFICE_CALLBACK_URL_REJECTED` (SSRF)
  - `413 OFFICE_CONTENT_TOO_LARGE`
  - `422 OFFICE_CONTENT_TYPE_MISMATCH`
  - `500 OFFICE_SAVE_FAILED` → `{"error": 1}` (قد يعيد DS المحاولة؛
    الـ dedupe يمنع التكرار)

- **Idempotency:** إذا كان `checksum == current_version.checksum` →
  لا إصدار جديد + `{"error":0}` + Audit `office.save.duplicate`.
- **التوقيت:** الحفظ الفعلي يتم قبل الاستجابة؛ تنزيل DS محدود بمهلة 30 ثانية.

### 7.5 `GET /api/office/files/{file_id}/versions`

- **المصادقة:** أي مستخدم مسجّل (قراءة).
- **الاستجابة 200:**

```json
{
  "items": [
    {
      "id": "…",
      "number": 3,
      "source": "onlyoffice",
      "isOriginal": false,
      "extension": "docx",
      "sizeBytes": 48213,
      "checksum": "…",
      "createdAt": "2026-11-17T10:30:00+02:00",
      "createdBy": "<user_id>",
      "createdByName": "…",
      "pdfStatus": "ready",
      "parentVersionId": "…"
    }
  ],
  "total": 3
}
```

### 7.6 `GET /api/office/files/{file_id}/versions/{version_id}/download`

- **المصادقة:** Bearer + `DOCUMENT_EDITOR_ROLES` (ملف Office خام).
- **Query:** `disposition=attachment|inline` (افتراضي attachment).
- **الاستجابة:** الملف الأصلي/المُحرّر بهذا الإصدار.
- للإصدارات PDF/الصور يُستخدم مسار المعاينة العادي.

### 7.7 `GET /api/office/files/{file_id}/versions/{version_id}/preview`

- **المصادقة:** أي مستخدم مسجّل.
- **الاستجابة:** PDF المعاينة (`inline`)، أو `404` إذا `pdf_status != ready`.

### 7.8 `POST /api/office/files/{file_id}/convert`

- **المصادقة:** `DOCUMENT_EDITOR_ROLES`.
- **الغرض:** إعادة محاولة تحويل `.doc/.xls` إلى OOXML إذا فشل وقت الرفع.
- **الاستجابة 202:** `{ "versionId": "…", "number": 2 }`
- **أخطاء:** `409 OFFICE_ALREADY_OOXML`, `422 OFFICE_CONVERSION_FAILED`.

### 7.9 `POST /api/office/files/{file_id}/sessions/close`

- **المصادقة:** `DOCUMENT_EDITOR_ROLES`.
- **الغرض:** إغلاق جلسة عالقة (بعد انتهاء صلاحيتها أو تعطّل المتصفح).
- **الجسم:** `{"reason": "forced"}` (اختياري).
- **الاستجابة 204.** يُسجّل Audit.

### 7.10 تعديلات `/api/forms/*`

| النقطة | التغيير |
|---|---|
| `GET /forms/files/{id}/download` | يخدم PDF المعاينة **للإصدار الحالي** (نفس العقد). Query اختياري `version_id` |
| `POST /forms/submissions` | يولّد لقطة PDF + يملأ `document_version_id` و`snapshot_status` |
| `GET /forms/submissions/{id}` | **جديد** — تفاصيل لقطة/إصدار |
| `GET /forms/submissions/{id}/document` | **جديد** — تنزيل PDF اللقطة (`inline`) |
| الكتابة (رفع/قوالب/حذف/submissions) | تنتقل إلى `DOCUMENT_EDITOR_ROLES` (R6) |

**استجابة `POST /forms/submissions` (200/201):**

```json
{
  "id": "…",
  "template_id": "…",
  "employee_id": "…",
  "values": { "employee.name": "…" },
  "status": "…",
  "document_version_id": "…",
  "snapshot_status": "ready",
  "created_at": "…"
}
```

> التوافق: العملاء القدامى لا يرسلون `document_version_id`؛ الخادم يستنتجه من
> `form_templates.document_version_id` أو الإصدار الحالي.

---

## 8) دورة الحفظ والإصدارات

### 8.1 تخصيص رقم الإصدار (ذرّية)

```text
BEGIN
  SELECT * FROM form_files WHERE id = :fid FOR UPDATE      -- Postgres
  vmax = SELECT max(version_no) FROM form_file_versions WHERE file_id=:fid
  vnext = COALESCE(vmax,0) + 1
  INSERT version(version_no=vnext, ...)
  UPDATE form_files SET current_version_id=:new
COMMIT
```

- `UNIQUE(file_id, version_no)` هو خط الدفاع الأخير ضد التزامن.
- على SQLite (اختبارات) يُتجاهل `FOR UPDATE` بأمان.

### 8.2 التحقق من محتوى الـ callback

1. `size <= OFFICE_MAX_CALLBACK_MB`.
2. `magic bytes` تطابق `kind`:
   - `docx/xlsx` → ZIP (`PK\x03\x04`) + فحص بنية OOXML الأساسية
     (`[Content_Types].xml` موجود).
   - رفض OLE (`\xd0\xcf\x11\xe0…`) في مسار OOXML (يعني تحويلاً فاشلاً).
3. `extension` من `filetype` في الـ callback ∈ المتوقع (`docx` لـ word،
   `xlsx` لـ excel) — وإلا تحويل/رفض.
4. `checksum` = SHA-256 للبايتات.

### 8.3 الحفظ المطابق (Dedupe)

- المقارنة مع **الإصدار الحالي فقط**.
- إذا تطابق: لا ملف جديد، لا إصدار، `{"error":0}`، Audit.
- إذا تطابق مع إصدار قديم (استعادة لاحقاً): يُسمح بإصدار جديد.

### 8.4 PDF المعاينة

- بعد الحفظ: `convert_to_pdf` عبر LibreOffice (مهلة `LIBREOFFICE_TIMEOUT`).
- النجاح: `pdf_path=forms/<fid>/pdf/vN.pdf`, `pdf_status=ready`.
- الفشل: الإصدار يبقى، `pdf_status=failed`، `pdf_path=NULL`،
  Audit + إعادة محاولة عبر worker (حتى 3 محاولات).
- الواجهة: تعرض «المعاينة غير متاحة مؤقتاً» مع زر إعادة المحاولة (ADMIN/HR).

### 8.5 الجلسات والتعارض

- تحرير حصري افتراضي:
  - عند `config`: إن وُجدت جلسة نشطة لمستخدم آخر وغير منتهية → `409`.
  - إن انتهت صلاحيتها → تُغلق (`expired`) وتُفتح جديدة.
- `last_seen_at` يتحدّث مع status 1/2/6.
- **تعارض محتمل:** مستخدم فتح `v3`، انتهت جلسته، وآخر حفظ `v4`، ثم وصل
  callback الأول. الحل:
  - يُنشأ `v5` بـ `parent_version_id = v3` (وليس `v4`).
  - Audit `office.save.conflict_based_on_old_version`.
  - لا فقدان بيانات: كل النسخ محفوظة؛ الواجهة تُظهر السلالة.
- إغلاق الجلسة:
  - status 2 → `saved`
  - status 4 → `no_changes`
  - status 3 → `saved_with_error`
  - status 6 → لا تُغلق (تحرير مستمر)
  - إغلاق قسري → `forced`

### 8.6 الملفات القديمة `.doc/.xls`

**عند الرفع (جديد):**

1. `v1_original.doc` (source=`upload`, is_original=true, pdf_status=`pending`).
2. تحويل LibreOffice إلى `docx` → `v2_<checksum8>.docx`
   (source=`conversion`, parent=v1).
3. `current_version_id = v2`، وتوليد `pdf/v2.pdf`.
4. إذا فشل التحويل: يبقى `current=v1`، `config` يعيد
   `422 OFFICE_LEGACY_NOT_CONVERTED`، وزر «إعادة المحاولة» يستدعي 7.8.

**عند الترقية (ملفات موجودة):** لا تحويل جماعي. تُسجّل `v1` بمسارها الأصلي؛
عند أول محاولة تحرير لملف `.doc/.xls` تُستدعى خدمة التحويل تلقائياً وتُنشأ `v2`.

### 8.7 الاستبقاء والتنظيف

- `OFFICE_VERSION_RETENTION=0` → لا حذف (القرار المعتمد).
- إن فُعّل لاحقاً: لا يُحذف الأصل ولا أي إصدار مرتبط بـ submission.
- Soft-deleted file: تبقى النسخ على القرص (سياسة تنظيف منفصلة لاحقاً).

---

## 9) لقطة الـ Submission (PDF)

### 9.1 الهدف

تجميد «ما تم إرساله» بصرياً: الإصدار + القيم + ملف PDF غير قابل للتعديل،
لأغراض الأرشفة والتدقيق.

### 9.2 خط الأنابيب

```text
SubmissionCreate(values, template, employee)
  ├─ version = template.document_version_id أو current_version
  ├─ pdf = version.pdf_path (يجب pdf_status=ready)
  ├─ overlay = رسم الحقول على صفحات PDF
  │    ├─ font: Cairo-Regular/Bold (مضمّن في apps/api/app/assets/fonts)
  │    ├─ Arabic shaping: arabic-reshaper + python-bidi
  │    ├─ الإحداثيات: x%, y%, width%, height% من mediabox الصفحة
  │    ├─ حجم الخط: pt = font_size_px × (page_width_pt / 794)
  │    ├─ المحاذاة: right/center/left داخل الصندوق
  │    └─ قصّ النص (clip) داخل الصندوق
  ├─ merge مع الأصل (pypdf) — الأصل لا يُعدّل
  │    └─ للصور: تُغلَّف الصورة في صفحة A4 PDF (reportlab) قبل الرسم
  ├─ حفظ forms/<fid>/submissions/<sid>.pdf + SHA-256
  └─ snapshot_status=ready (أو failed مع بقاء الـ submission)
```

### 9.3 القرارات

- **لا نمنع إنشاء الـ submission إذا فشل الـ render**: `snapshot_status=failed`
  + `snapshot_error`، وتبقى الطباعة من المتصفح متاحة. (HR لا تُحرم من حفظ الطلب.)
- **Retry:** worker يعالج `pending/failed` (حد 3 محاولات).
- **الخط:** Cairo ليطابق الواجهة (بدل الاعتماد على خطوط الصورة).
- **حدود الدقة:** الطباعة من المتصفح تبقى المرجع البصري؛ لقطة PDF تُطابق
  الإحداثيات والنِسَب، مع فروق محتملة في مقاييس الخط. تُوثّق وتُختبر في UAT.
- **الاعتماديات الجديدة (المرحلة 3):** `pypdf`, `reportlab`,
  `arabic-reshaper`, `python-bidi` — مع مراجعة التراخيص وحجم الصورة.
- **PDF/صور:** اللقطة تعمل بنفس المنطق (الخلفية = الإصدار PDF).

### 9.4 نقطة النهاية

`GET /api/forms/submissions/{id}/document`:
- Bearer، أي مستخدم مسجّل (وفق صلاحيات عرض الـ submissions الحالية).
- `inline` + `Cache-Control: no-store`.
- `404 SNAPSHOT_NOT_READY` إن لم تكتمل.

---

## 10) الواجهة الأمامية

### 10.1 المكوّن الجديد

`src/components/OfficeEditor.tsx`

- Props: `file: FormFile`, `onClose()`, `onSaved(versionNumber)`, `onFallback()`.
- Lazy load: `@onlyoffice/document-editor-react` (2.3.0 — يدعم React 19).
- `documentServerUrl` من `VITE_ONLYOFFICE_URL` (افتراضي `/onlyoffice`).
- حالات: `loading` (حتى `onDocumentReady`)، `error` (مهلة 20 ثانية أو
  `onError`)، `ready`.
- عند الخطأ:
  - رسالة عربية + زر «استخدام المعاينة القديمة» → `onFallback()`.
  - لا يُغلق المحرّر تلقائياً إن كان هناك حفظ جارٍ.
- `onRequestClose` → تأكيد إذا كانت هناك تغييرات (DS يتولى ذلك؛ نعرض تأكيداً
  عند الإغلاق اليدوي).
- بعد `onSaved`: تحديث القائمة والإصدارات + إشعار «تم حفظ الإصدار vN».

### 10.2 دمج FormsManager

- زر «تحرير المستند» يظهر في صف الملف/شاشة المعاينة عندما:
  - `VITE_ONLYOFFICE_ENABLED=true`
  - `mode === 'api'`
  - `kind ∈ {word, excel}`
  - `canEditDocument(user.role)`
- الديمو: الزر **معطّل** مع tooltip:
  `"يتطلب تحرير المستندات تشغيل الخادم (Docker)"`
  (يُغلّف في `<span title>` لأن الأزرار المعطّلة لا تُظهر tooltip موثوقاً).
- عند `OFFICE_SESSION_ACTIVE`: نافذة توضّح من يحرّر + زر «إغلاق الجلسة»
  (ADMIN/HR فقط).
- لوحة «الإصدارات»:
  - قائمة vN + المصدر + التاريخ + المنشئ + الحجم.
  - تنزيل (Office خام) للمحرّرين، ومعاينة PDF للجميع.
  - شارة `pdf_status=failed` + إعادة المحاولة.
- بعد حفظ: تحديث `FormFile.currentVersionId`، معاينة PDF، وقائمة القوالب
  التي تشير للملف مع تنبيه «تخطيط المستند تغيّر — راجع الحقول».

### 10.3 FormFiller / FormDesigner

- `FormDesigner` يحفظ `documentVersionId = file.currentVersionId`.
- `FormFiller` يعرض PDF الإصدار المثبّت في القالب (وليس الأحدث)؛
  إن لم يكن PDF جاهزاً → fallback لأحدث إصدار جاهز + تحذير.
- رسالة عند تغيّر الإصدار: «القالب مثبّت على الإصدار vN — استخدم زر
  (تثبيت الإصدار الحالي) لمراجعة المواضع». (زر اختياري في المرحلة 5.)

### 10.4 الحالات والصلاحيات

- `canEditDocument(role)` جديدة في `src/utils/roles.ts` (ADMIN/HR)،
  تُستخدم في FormsManager/Designer/Filler/OfficeEditor.
- `canEdit` القديمة تبقى لبيانات العمل الأخرى (حضور/إجازات…).
- أربع حالات لكل شاشة: loading / empty / error / success (قاعدة AGENTS).

### 10.5 RTL والعربية

- المحرّر `lang: "ar"`، والاتجاه من DS.
- نصوص الأزرار والتلميحات عربية.
- اختبار لقطة شاشة يدوي في UAT للتأكد من اتجاه الجداول والخطوط.

---

## 11) الإصلاحات الإلزامية

### 11.1 R5 — خطأ 422 في pagination

**السبب:** `fetchAllPages` يرسل `limit=500`، ونقاط النماذج تقبل `le=200`
(`routers/forms.py:43,113,175`).

**الإصلاح (واجهة):**

```text
fetchAllPages(path, extraParams = {}, pageSize = 500)
  - استخدام pageSize في params وفي offset += pageSize
  - استدعاءات النماذج تمرّر 200:
      fetchFormFiles → 200
      fetchFormSubmissions → 200
      listTemplates → 200 (إن كان يستخدم fetchAllPages)
```

- **لماذا لا نرفع سقف الخادم؟** 200 كافية لواجهة HR وتحمي الاستجابة من الحجم
  الكبير؛ تغيير العميل أقل أثراً.
- **اختبار انحدار:** Vitest يتحقق أن طلبات `/forms/*` تحمل `limit=200`،
  وأن الدورة تتوقف عند `total`.
- **اختبار API:** `limit=201` → 422 (موجود ضمن حدود Pydantic).

### 11.2 R6 — تعارض الأدوار

**الخادم:**

- إضافة `DOCUMENT_EDITOR_ROLES = ("ADMIN", "HR")` في `core/security.py`.
- استخدامها في:
  - `POST/DELETE /forms/files`
  - `POST/PATCH/DELETE /forms/templates`
  - `POST /forms/submissions`
  - كل `/office/*` الكتابية.
- `EDITOR_ROLES` الحالية تبقى للحضور/الإجازات/المأموريات.

**الواجهة:**

- `DOCUMENT_EDITOR_ROLES` + `canEditDocument` في `utils/roles.ts`.
- استبدال `canEdit` في مكوّنات النماذج فقط.

**اختبارات:**

- API: SUPERVISOR → 403 على كل كتابة نماذج/Office.
- واجهة: أزرار الرفع/التصميم/الحفظ/التحرير مخفية لـ SUPERVISOR.
- تحديث توثيق مصفوفة الصلاحيات.

### 11.3 R10 — الخطوط العربية

- حاوية DS مخصّصة (القسم 4.4) + التحقق من `fc-list` بعد البناء.
- API: إضافة `Cairo-Regular.ttf` / `Cairo-Bold.ttf` لمولّد اللقطات
  (صورة API تحتوي Noto مسبقاً، لكن Cairo يضمن التطابق البصري).
- معيار قبول UAT: مستند عربي (RTL + أرقام + جداول) يُفتح ويُطبع بلا تشويه.

---

## 12) أعلام الميزات والإعدادات

### 12.1 الخلفية (`.env`)

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `ONLYOFFICE_ENABLED` | `false` | المفتاح الرئيسي |
| `ONLYOFFICE_INTERNAL_URL` | `http://onlyoffice` | فحص الصحة |
| `ONLYOFFICE_INTERNAL_HOST` | `onlyoffice` | allowlist للـ SSRF |
| `ONLYOFFICE_JWT_SECRET` | — | إلزامي عند التفعيل (≥32 حرفاً) |
| `ONLYOFFICE_CALLBACK_BASE` | `http://api:8000` | بناء callbackUrl |
| `OFFICE_TOKEN_SECRET` | (فارغ → `SECRET_KEY`) | توقيع T2 |
| `OFFICE_DOWNLOAD_TOKEN_TTL_SECONDS` | `600` | عمر توكن التنزيل |
| `OFFICE_CALLBACK_TOKEN_TTL_SECONDS` | `43200` | عمر توكن الكولباك |
| `OFFICE_SESSION_TTL_MINUTES` | `60` | قفل التحرير |
| `OFFICE_ALLOW_COEDITING` | `false` | محجوز |
| `OFFICE_MAX_FILE_MB` | `20` | مطابق لقاعدة AGENTS |
| `OFFICE_MAX_CALLBACK_MB` | `50` | سقف تنزيل الحفظ |
| `OFFICE_VERSION_RETENTION` | `0` | 0=كل النسخ |
| `OFFICE_LEGACY_CONVERT_ON_UPLOAD` | `true` | `.doc/.xls` |
| `OFFICE_REQUIRE_DS_DOWNLOAD_TOKEN` | `true` | تحقق T3/download |
| `SUBMISSION_SNAPSHOT_ENABLED` | `true` | لقطة PDF |
| `LIBREOFFICE_TIMEOUT_SECONDS` | (موجود) | تحويل PDF |

**تحقق الإقلاع:** إذا `ONLYOFFICE_ENABLED=true` والسر مفقود/أقصر من 32 →
فشل واضح عند بدء التطبيق (Fail Fast) مع رسالة عربية.

### 12.2 الواجهة (Build-time)

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `VITE_ONLYOFFICE_ENABLED` | `false` | إظهار/إخفاء الميزة |
| `VITE_ONLYOFFICE_URL` | `/onlyoffice` | `documentServerUrl` |
| `VITE_OFFICE_LOAD_TIMEOUT_MS` | `20000` | مهلة تحميل المحرّر |

- تُمرّر كـ `build.args` في `docker-compose.yml` و`infra/web/Dockerfile`.
- `ONLYOFFICE_ENABLED=false` + `VITE_ONLYOFFICE_ENABLED=false` = سلوك اليوم.

---

## 13) التوافق والهجرة والتراجع

### 13.1 التوافق

- كل التغييرات **إضافية**: جداول/أعمدة جديدة، لا حذف ولا إعادة تسمية.
- `GET /forms/files/{id}/download` يحافظ على معناه (PDF المعاينة).
- DTOs الواجهة تُوسَّع بحقول اختيارية فقط.
- الديمو لا يتأثر: لا اتصال بـ `/api/office/*`؛ مخزن IndexedDB كما هو.

### 13.2 خطة الهجرة

1. نشر API + Migration (لا واجهة جديدة بعد).
2. التحقق: `versions` مُعبّأة، `current_version_id` صحيح، القوالب مثبّتة.
3. نشر الواجهة بعلم `false` (لا تغيير مرئي).
4. نشر DS + Nginx.
5. تفعيل `VITE_ONLYOFFICE_ENABLED=true` + `ONLYOFFICE_ENABLED=true` في بيئة اختبار.
6. UAT ثم الإنتاج.

### 13.3 التراجع (Rollback)

| المستوى | الإجراء | الأثر |
|---|---|---|
| ميزة | إطفاء العلمين | عودة كاملة للـ Overlay |
| API | إبقاء الـ router (503 عند الإطفاء) | لا كسر |
| قاعدة البيانات | `alembic downgrade -1` | حذف الجداول/الأعمدة الجديدة؛ النسخ تبقى على القرص |
| Docker | إزالة خدمة `onlyoffice` | لا يؤثر على البيانات |

---

## 14) الاختبارات وبوابات القبول

### 14.1 الخلفية

**وحدة:**

- T2: توقيع/تحقق، انتهاء، جمهور خاطئ، `fid` غير مطابق.
- T3: توقيع صالح/غير صالح، `operation` خاطئ، تطبيع body/header.
- SSRF: host خارج القائمة، redirect، `file://`، منفذ غريب.
- magic bytes: docx zip صالح، OLE مرفوض، HTML مرفوض، حجم زائد.
- dedupe: نفس checksum → لا إصدار؛ محتوى مختلف → إصدار.
- version numbering تحت تزامن (اختبار خدمة).
- أدوار: SUPERVISOR ممنوع من الكتابة (R6).
- pagination: `limit=200` (R5) — اختبار عميل + خادم.

**تكامل (TestClient + mock DS):**

- `config`: نجاح، 409 جلسة نشطة، 415 pdf، 503 معطّل.
- `download`: توكن صالح/منتهي/مفقود، T3/download صالح/خاطئ.
- `callback`:
  - 1/2/3/4/6/7
  - 2 مع نفس checksum → لا إصدار
  - 2 مع checksum جديد → إصدار + PDF
  - 6 → إصدار + جلسة مفتوحة
  - 401 بتوقيع خاطئ
  - 400 بـ URL خارج allowlist
  - 413 بحجم زائد
  - 422 بمحتوى غير مطابق
- migration up/down + backfill (SQLite).
- snapshot: نجاح، فشل render (submission يبقى)، إعادة المحاولة.

### 14.2 الواجهة

**Vitest:**

- العلم `false` → لا زر تحرير ولا استيراد للمكوّن.
- الديمو → زر معطّل + tooltip المطلوب حرفياً.
- `canEditDocument` للدورات الأربعة.
- `OfficeEditor` fallback عند `onError`/مهلة.
- `fetchAllPages` يحمل 200 للنماذج.
- مappers للحقول الجديدة.

**Playwright:**

- الديمو: لا زر تحرير مفعّل + tooltip.
- API (mock): زر يظهر لـ HR ويختفي لـ SUPERVISOR.
- فشل config → رسالة + fallback للـ Overlay (بدون iframe).
- لا نحمّل iframe DS في CI (لا خادم)؛ نستخدم stub للمكوّن.

### 14.3 بوابات القبول

| المرحلة | البوابة |
|---|---|
| 2 | `docker compose up` صحي؛ `/onlyoffice/healthcheck` عبر web = true؛ WS يعمل؛ خط عربي يظهر |
| 3 | كل اختبارات الخلفية + migration up/down + لا كسر 86 اختباراً |
| 4 | `npm run lint` + `npm run build` + 73 Vitest؛ العلم false = لا تغيير |
| 5 | تكامل النماذج + R5/R6 + 21 Playwright (مع تكييف الديمو) |
| 6 | كل ما سبق + UAT على جهاز الشركة (8GB/4CPU) |
| 7 | دليل تشغيل عربي + متغيرات + استكشاف أخطاء |

**معايير UAT (جهاز الشركة):**

1. رفع DOCX عربي → فتح → تعديل → حفظ → ظهور v2 + معاينة PDF.
2. رفع XLSX → تحرير خلايا → حفظ → تحميل الإصدار.
3. `.doc` قديم → تحويل → تحرير → حفظ.
4. حفظ بلا تغيير → لا إصدار جديد.
5. تحرير متزامن من مستخدمين → 409 + رسالة واضحة.
6. PDF/صورة → المسار القديم كما هو.
7. تعبئة نموذج → Submission → لقطة PDF مطابقة للمعاينة.
8. إطفاء العلم → كل شيء يعمل بالطريقة القديمة.
9. إعادة تشغيل الحاويات → النسخ والملفات سليمة.
10. العربية/RTL في المحرّر والطباعة.

---

## 15) المخاطر المتبقية

| # | الخطر | الاحتمال | الأثر | التخفيف |
|---|---|---|---|---|
| O1 | دعم DS للمسار الافتراضي `/onlyoffice/` يتطلب ضبط `X-Forwarded-Host` بدقة | متوسط | عالٍ | استخدام إعداد `document-server-proxy` الرسمي + اختبار WS في المرحلة 2 |
| O2 | حد الاتصالات المتزامنة في CE (تحقق من 10.x) | متوسط | متوسط | استخدام HR منخفض؛ قياس + توثيق الحد |
| O3 | فشل `documentserver-generate-allfonts.sh` وقت البناء | متوسط | متوسط | تشغيله مرة بعد الإقلاع + توثيقه |
| O4 | فروق دقة لقطة PDF عن طباعة المتصفح | مرتفع | منخفض | Cairo + اختبار UAT + إبقاء الطباعة متاحة |
| O5 | اختلاف توقيع DS 10 (`operation`) عن نسخ أقدم | متوسط | متوسط | تطبيع claims + اختبار مع النسخة المثبّتة |
| O6 | استهلاك ذاكرة DS مع ملفات كبيرة | متوسط | متوسط | 8GB كافية مبدئياً؛ مراقبة + سقف 20MB |
| O7 | تسريب توكن التنزيل من config | منخفض | متوسط | TTL قصير + T3/download + عدم تسجيل args |
| O8 | تعارض حفظ بعد انتهاء الجلسة | متوسط | منخفض | نسخ متعددة + `parent_version_id` + Audit |
| O9 | تحويل `.xls` معقد (Pivot/Macros) | متوسط | متوسط | رفض الماكرو + اختبار UAT + إبقاء الأصل |
| O10 | تراجع أداء الـ API أثناء تحويل PDF المتزامن | متوسط | متوسط | تحويل بعد الحفظ + worker retry + مهلة |

---

## 16) خريطة الملفات والتغييرات (حسب المرحلة)

> **لا يُنفّذ أي منها في المرحلة 1.** هذه خريطة للتخطيط والمراجعة.

### المرحلة 2 — Docker

- `docker-compose.yml` (خدمة `onlyoffice` + volumes + build args + depends_on).
- `infra/onlyoffice/Dockerfile` (جديد).
- `infra/nginx/default.conf` (`map` + `location /onlyoffice/` + سجل بدون args).
- `infra/web/Dockerfile` (build args جديدة).
- `.env.example` (متغيرات DS/Office).

### المرحلة 3 — الخلفية

- `apps/api/requirements.txt` (+ pypdf, reportlab, arabic-reshaper, python-bidi).
- `apps/api/app/core/config.py` (+ إعدادات Office + تحقق).
- `apps/api/app/core/security.py` (`DOCUMENT_EDITOR_ROLES`).
- `apps/api/app/models/form.py` (+ `FormFileVersion`, `OfficeSession`, أعمدة).
- `apps/api/app/schemas/form.py` + `schemas/office.py` (جديد).
- `apps/api/app/services/versions.py` (جديد).
- `apps/api/app/services/office.py` (جديد: config/tokens/callback).
- `apps/api/app/services/render.py` (جديد: لقطة PDF).
- `apps/api/app/services/documents.py` (تخزين إصدارات + تحويل OOXML + تحقق).
- `apps/api/app/services/forms.py` (ربط الإصدارات + snapshot + R6).
- `apps/api/app/routers/office.py` (جديد).
- `apps/api/app/routers/forms.py` (R6 + endpoints جديدة).
- `apps/api/app/routers/__init__.py` (تسجيل office).
- `apps/api/alembic/versions/<rev>_office_versioning.py` (جديد).
- `apps/api/app/worker.py` (مهام PDF المعلّقة).
- `apps/api/app/assets/fonts/Cairo-*.ttf` (جديد).
- `apps/api/tests/test_office_*.py` (جديد) + تحديث `test_forms.py`.

### المرحلة 4 — الواجهة

- `package.json` (+ `@onlyoffice/document-editor-react@2.3.0`).
- `src/components/OfficeEditor.tsx` (جديد).
- `src/components/FormsManager.tsx` (الزر + الإصدارات + fallback).
- `src/components/forms/FormDesigner.tsx` (تثبيت الإصدار).
- `src/components/forms/FormFiller.tsx` (PDF الإصدار المثبّت + اللقطة).
- `src/services/formStore.ts` + `apiClient.ts` (DTOs/نقاط/تنزيل إصدار).
- `src/types/index.ts` (+ أنواع الإصدارات/الحقول).
- `src/utils/roles.ts` (`canEditDocument`).
- `tests/unit/*` + `tests/e2e/forms-demo.spec.ts`.

### المرحلة 5 — التكامل

- ربط التدفق الكامل + لافتات «تغيّر التخطيط» + قائمة الإصدارات.
- R5 في `apiClient.ts`، R6 في الخلفية/الواجهة.
- لا لمس `SmartForms.tsx` / `formFileParser.ts` (تُعلَّم `@deprecated` فقط).

### المرحلة 6 — الاختبار

- اختبارات جديدة + تشغيل كامل + UAT.

### المرحلة 7 — التوثيق

- `docs/ONLYOFFICE-RUNBOOK-AR.md` (تشغيل/متغيرات/استكشاف أخطاء/نسخ احتياطي).
- تحديث `README.md` و`docs/PLAN.md`.

---

## 17) بنود يجب التحقق منها في المرحلتين 2 و3

1. **وسم صورة DS:** أحدث إصدار مستقر (10.0.x) مقابل 9.4.x — يُثبّت رقم كامل.
2. **سلوك `operation`** في توقيع DS المثبّت (callback/download) — يُختبر عملياً.
3. **`JWT_IN_BODY=true`**: هل يصل الجسم كاملاً أم `{token}` فقط؟ (التصميم يدعم الاثنين).
4. **إرسال T3/download** على طلب GET للمستند — إن لم يُرسل، يُطفأ الفحص.
5. **`X-Forwarded-Host`** مع `add_header` الحالي وWebSocket عبر `/onlyoffice/`.
6. **`documentserver-generate-allfonts.sh`** وقت البناء/الإقلاع.
7. **حد الاتصالات المتزامنة** في CE مع 8GB/4CPU.
8. **جودة تحويل `.doc/.xls`** (جداول/خطوط) عبر LibreOffice.
9. **دقة لقطة PDF** مقابل طباعة المتصفح (Cairo).
10. **توافق `@onlyoffice/document-editor-react@2.3.0`** مع React 19 + TypeScript 7.
11. **حد حجم الملف** الفعلي في DS (20MB) وسلوك الملفات الكبيرة.
12. **النسخ الاحتياطي**: `uploads` + `pg_dump` معاً يعطيان استعادة كاملة
    (مجلدات DS ليست مطلوبة).

---

## 18) تعريف الإنجاز للمرحلة 1

- [x] نموذج بيانات مُصمّم (جداول/أعمدة/قيود/ثوابت).
- [x] عقود API كاملة (نجاح/أخطاء/حالات).
- [x] استراتيجية JWT (T1/T2/T3 + التحقق + SSRF).
- [x] مخطط شبكة Docker + Nginx + الخطوط.
- [x] أعلام الميزات والإعدادات.
- [x] خطة الهجرة/التراجع.
- [x] إصلاحات R5/R6/R10 مُخطّطة.
- [x] اختبارات وبوابات قبول.

**لا يتضمّن:** أي تعديل على `src/` أو `apps/api/` أو `docker-compose.yml`
أو قاعدة البيانات.

---

## 19) طلب الموافقة

بعد مراجعة هذا التصميم، المطلوب:

1. **الموافقة على نموذج البيانات** (خاصة: `current_version_id` بلا FK،
   تثبيت الإصدار في القوالب، حقوق الجلسات).
2. **الموافقة على عقود API** (أسماء/مسارات/أكواد أخطاء).
3. **الموافقة على استراتيجية التوكنات** (T2 + T3/download).
4. **الموافقة على لقطة الـ Submission** كعملية غير معطِّلة عند فشل الـ render.
5. **الموافقة على خطة النشر التدريجي** (Flag off → migration → DS → Flag on).

بعد الموافقة أبدأ **المرحلة 2 (Docker فقط)**: خدمة `onlyoffice`، صورة الخطوط،
بروكسي Nginx، والمتغيرات — مع تقرير تحقق قبل الانتقال للمرحلة 3.

---

### المراجع

- وثائق ONLYOFFICE: توقيع الطلبات (Browser / Token in body / Token in header)
  وCallback handler — إصدار 10.x.
- مستودع `ONLYOFFICE/document-server-proxy` — إعداد virtual path.
- تقرير المرحلة 0 + `AGENTS.md` (قواعد المستندات والأمان والاختبارات).
