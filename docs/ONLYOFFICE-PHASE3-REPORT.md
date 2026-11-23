# التقرير النهائي — المرحلة 3 (ONLYOFFICE Backend)

**الحالة:** مكتمل ومُلتزم في Git (`7a25689` + `b370979`)؛ انتقل العمل إلى Phase 4 ثم اكتمل بدوره (`8bd594d`).
**التاريخ:** 2026-11-22 · **آخر مزامنة:** 2026-11-23
**النطاق:** الباك إند فقط (`apps/api`) — لم يتم تعديل أي ملف من واجهة المستخدم،
ولا من `SmartForms` / `formFileParser` / PDF.js، تأجيلاً لتقاعدها إلى المرحلة 5.

---

## 1) ملخّص تنفيذي

اكتملت المهام **T3-00 … T3-19** على جانب الباك إند عبر ثلاث موجات:

| الموجة | المهام | النتيجة | Git |
|---|---|---|---|
| A — الأساس | T3-00/01/02/03/04/18/19 | نماذج الإصدارات والجلسات، هجرة + backfill، إعدادات fail-fast، ترخيص، ورديات، أدوار التحرير | مُضمّنة في الـ commit الموحّد |
| B — محرّر ONLYOFFICE | T3-05/06/07/08/09/10/11/12/13 | خدمة إصدارات ذرّية، OOXML + تحويل + PDF، طبقتا JWT (T2/T3)، كل نقاط `/api/office/*`، حماية SSRF، `no-store` | commit `7a25689` |
| C — لقطة Submission | T3-14/15/16 | مولّد PDF عربي بخط Cairo، حفظ خلفي غير حاجز، إعادة محاولة في worker حتى 3 مرات | ✅ `b370979` |

تم رفع عدد اختبارات pytest من 117 (الموجة A) إلى 191 (بعد الموجة B) ثم إلى
**209 اختبارًا** بعد الموجة C. اختبارات الواجهة كانت **76** أثناء Phase 3، ثم أصبحت **87** بعد Phase 4.

---

## 2) ما نُفّذ في الموجة C (T3-14 → T3-16)

### T3-14 — مولّد لقطة PDF

- ملف جديد `apps/api/app/services/render.py`:
  - `reportlab` لرسم طبقة الحقول، `pypdf` لدمجها مع PDF الإصدار دون تعديل الأصل،
    `arabic-reshaper` + `python-bidi` لتشكيل العربية وترتيبها البصري،
    وخط **Cairo-Regular/Bold** مضمّن في `apps/api/app/assets/fonts/`.
  - الإحداثيات تُحوَّل من `%` (أعلى-يسار في الواجهة) إلى نقاط PDF (أسفل-يسار)
    بناءً على `mediabox` لكل صفحة؛ حجم الخط يُقاس بنسبة عرض A4 (794px).
  - المحاذاة `right/center/left`، قصّ النص داخل الصندوق مع `...`، ودعم الألوان.
  - الصور تُغلَّف في صفحة A4 قبل الرسم (عبر `reportlab`) ثم تُدمج كخلفية.
  - الكتابة ذرّية عبر ملف `.tmp` ثم `os.replace`، مع SHA-256 للمخرَز.
  - كل الأخطار المتوقعة تُترجم إلى `SnapshotRenderError` برسالة عربية ورمز ثابت؛
    لا يوجد مسار تخزين في أي استجابة.
- تثبيت الحزم في `requirements.txt`:
  `reportlab==5.1.0`, `pypdf==7.1.1`, `arabic-reshaper==3.1.0`, `python-bidi==0.6.12`.
- صورة API (`apps/api/Dockerfile`) تستخدم `COPY . .` من `apps/api`، لذا مجلد
  الخطوط الجديد يدخل الصورة تلقائيًا؛ لا يوجد `.dockerignore` يستبعده.

### T3-15 — دمج النماذج مع اللقطة

- `create_template` يثبّت `document_version_id = file.current_version_id`، و`create_submission`
  يثبّت نفس الإصدار في الطلب ولا يسمح بتغييره لاحقًا (لا يوجد endpoint للتعديل).
- `POST /api/forms/submissions` يُعيد **`201` مباشرة** بـ `snapshot_status=pending`،
  ثم يُجدوَل `BackgroundTasks` لتوليد اللقطة بعد إرسال الاستجابة. فشل التوليد
  يُسجَّل كحالة ولا يحول الحفظ إلى خطأ HTTP.
- حقول إضافية فقط في `SubmissionOut`:
  `document_version_id`, `snapshot_status`, `snapshot_error`, `snapshot_attempts`,
  `rendered_checksum` — بدون كسر أي عقد قائم.
- نقاط جديدة للقراءة:
  - `GET /api/forms/submissions/{id}` — تفاصيل الطلب + حالة اللقطة.
  - `GET /api/forms/submissions/{id}/document` — لقطة PDF مع `Cache-Control: no-store`
    و`X-Content-Type-Options: nosniff`، و`404 SNAPSHOT_NOT_READY` قبل الجاهزية.
- `GET /api/forms/files/{id}/download?version_id=...` — معلمة اختيارية لتثبيت
  المعاينة على إصدار بعينه (السلوك القديم محفوظ عند غيابها).

### T3-16 — إعادة المحاولة في worker

- `app/worker.py`: دورة `_snapshot_once()` كل 30 ثانية (`SNAPSHOT_INTERVAL_SECONDS`)
  تبحث عن `pending`/`failed` بـ `snapshot_attempts < 3` وتستدعي `process_snapshot`.
- `SNAPSHOT_MAX_ATTEMPTS = 3` في `services/forms.py`؛ المحاولة الثالثة الفاشلة
  تُسجَّل في التدقيق كـ `forms.snapshot.exhausted` ولا تتم محاولة رابعة.
- النجاح يُسجَّل `forms.snapshot.ready` مع بصمة مختصرة؛ الفشل يُسجَّل
  `forms.snapshot.failed` مع رمز الخطأ. أي استثناء غير متوقع لا يوقف الـ worker
  ولا يوقف مزامنة ZKTeco أو النسخ الاحتياطي.
- `SUBMISSION_SNAPSHOT_ENABLED=false` يوقف الجدولة والـ worker تمامًا.

---

## 3) مصفوفة الأدوار (نقاط المرحلة 3)

| النقطة | ADMIN | HR | SUPERVISOR | VIEWER | مجهول |
|---|---|---|---|---|---|
| `POST /api/office/*` (config/session/versions/callback) | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /api/office/status` | ✅ | ✅ | ✅ | ✅ | ❌ 401 |
| `POST /api/forms/submissions` | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /api/forms/submissions/{id}` | ✅ | ✅ | ✅ | ✅ | ❌ 401 |
| `GET /api/forms/submissions/{id}/document` | ✅ | ✅ | ✅ | ✅ | ❌ 401 |
| `GET /api/forms/files/{id}/download?version_id=` | ✅ | ✅ | ✅ | ✅ | ❌ 401 |

كل استجابة `/api/office/*` واستجابة لقطة المستند تحمل `no-store`، ولا تُرجع
مسارات تخزين (`storage_path` / `rendered_pdf_path`) في أي JSON.

---

## 4) بوابة الجودة — الأوامر والمخرجات

تم التنفيذ من `apps/api` إلا حيث ذكر خلاف ذلك:

```text
$ python -m pytest -o addopts= -q --tb=short
........................................................................ [ 34%]
........................................................................ [ 68%]
.................................................................        [100%]
209 passed in 87.60s

$ npm test                      # من جذر المستودع
Test Files  10 passed (10)
Tests       76 passed (76)

$ python -c "import sys; sys.path.insert(0,'.'); import app.main, app.worker; import app.services.render as r; print('imports OK', r.FONT_REGULAR.is_file(), r.FONT_BOLD.is_file())"
imports OK True True

$ python -m alembic heads
b7e9c2d4f6a8 (head)

$ python -m alembic upgrade head → downgrade base → upgrade head
(7 revisions applied, 7 rolled back, 7 reapplied) → b7e9c2d4f6a8 (head)
```

تم اختبار الهجرة على ملف SQLite مؤقت (`C:/Users/rrr/AppData/Local/Temp/opencode/`)
وليس على قاعدة بيانات حقيقية. لا هجرة جديدة في الموجة C: أعمدة اللقطة موجودة
أصلًا في `f3c1a9d2b7e4_office_versions.py`.

اختبارات جديدة في الموجة C (18 اختبارًا):

| الملف | ما يغطّيه |
|---|---|
| `tests/test_render.py` (6) | الدمج دون تعديل الأصل، تشكيل العربية، تحويل الإحداثيات، خط Cairo، قص النص، تغليف الصور، أخطاء معرّفة |
| `tests/test_forms_snapshot.py` (8) | حفظ غير حاجز، فشل غير قاتل، `no-store`، `SNAPSHOT_NOT_READY`، مصفوفة الأدوار، Audit، تثبيت الإصدار، جلسة مغلقة بعد الاستجابة |
| `tests/test_worker_snapshot.py` (4) | نجاح بعد فشلين، سقف 3 محاولات، تعطيل بالـ flag، صمود أمام استثناء غير متوقع |

---

## 5) الانحرافات والقرارات التوثيقية

1. **Commit موحّد للموجتين A+B:** لم يكن هناك أي commit للمرحلة 3 سابقًا، لذا تم
   إدخال عمل الموجتين A+B في commit واحد (`7a25689`) بدل تقسيم مصطنع يترك الموجة B
   غير قابلة للبناء. أُلزمت الموجة C لاحقًا في commit مستقل (`b370979`) لأنه لم يكن
   هناك commit سابق للمرحلة 3 يمكن إلحاقها به. ثم أُلزمت Phase 4 في `8bd594d`.
2. **الجدولة داخل الطلب:** استخدمنا `BackgroundTasks` مع جلسة `db` المحقونة.
   FastAPI يغلق الـ dependencies من نوع `yield` قبل تنفيذ الـ background task؛ تحقّقنا
   أن `Session.close()` في SQLAlchemy قابل لإعادة الاستخدام وأضفنا اختبارًا
   صريحًا (`test_background_render_survives_a_closed_request_session`).
3. **مسار اللقطة:** `forms/<file_id>/submissions/<submission_id>.pdf` — مطابق
   للتصميم §9 ويضمن عدم الكتابة فوق لقطة طلب آخر.
4. **مساعد الاختبار:** `MINIMAL_PDF` اليدوي في `tests/test_forms.py` ليس PDF صالحًا
   لـ `pypdf 7` (بلا `xref/startxref`)، لذا يستخدم `office_helpers._write_pdf`
   الآن ملفًا مولّدًا بـ `reportlab`. هذا تغيير اختباري فقط ولم يمس منطق الإنتاج.
5. **لا تغيير في الواجهة داخل هذه المرحلة:** كل أعمال Phase 4 (شاشة ONLYOFFICE، عرض
   `snapshot_status`) نُفّذت لاحقًا في commit مستقل `8bd594d`، ولم يحدث أي تغيير في
   `src/` أثناء Phase 3 نفسها.

---

## 6) الدين التقني ونقاط العناية في UAT

- لا يوجد زر «إعادة توليد» يدوي للقطة؛ الإعادة مؤتمتة عبر worker حتى 3 محاولات فقط،
  وبعدها تبقى الحالة `failed` للمراجعة.
- النص الطويل يُقصّ بـ `...` داخل الصندوق بدل التحويل لسطور متعددة؛ قد يحتاج
  ضبط ارتفاع الصندوق في قالب UAT.
- تغليف الصور يستخدم A4 مع توسيط (letterbox) ولا يحترم أحجام صفحات أصلية أخرى.
- لم يُشغَّل Document Server فعليًا (لا حاوية ONLYOFFICE في بيئة التطوير)؛
  اختبارات T2/T3 والـ callback تغطي العقود والتوقيعات بمعطيات مُحاكاة، ويلزم
  اختبار تحرير حقيقي في UAT.
- التطابق البصري بين طباعة المتصفح ولقطة Cairo يحتاج مقارنة عينية على نماذج الشركة.
- `/api/office/*` تعتمد على `Cache-Control: no-store` عبر `NoStoreRoute` + middleware؛
  أي نقطة جديدة في المرحلة 4 يجب أن تمر عبر نفس النمط.
- التنظيف/Deprecation لـ `SmartForms` و`formFileParser` ما زال مؤجلًا إلى المرحلة 5.

---

## 7) الخلاصة

المرحلة 3 مكتملة: 209 اختبار باك إند، وهجرة قابلة للتصعيد والتراجع، ولا أسرار ولا
مسارات تخزين في الاستجابات. المحرّر واللقطة كلاهما خلف `ONLYOFFICE_ENABLED` /
`SUBMISSION_SNAPSHOT_ENABLED` مع قيم افتراضية تُبقي السلوك القديم كما هو. أُلزمت
الموجة C في `b370979`، ثم اكتملت Phase 4 في `8bd594d` (87 اختبار واجهة الآن).
المتبقي التشغيلي موثّق في `tasks.md`.
