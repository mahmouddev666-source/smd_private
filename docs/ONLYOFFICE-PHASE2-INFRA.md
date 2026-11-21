# المرحلة 2 — البنية التحتية لـ ONLYOFFICE (تقرير التحقق)

> **المشروع:** SMD-HR — شركة السويس لمشتقات الميثانول
> **الوثيقة:** تقرير المرحلة 2 (Docker + Nginx + الخطوط) من 7 مراحل
> **التاريخ:** 2026-11-21
> **يعتمد على:** `docs/ONLYOFFICE-PHASE1-DESIGN.md` (التصميم المعتمد)
> **النطاق:** بنية تحتية فقط — **لا كود تطبيقي، لا هجرة قاعدة بيانات، لا تغيير في الواجهة**

---

## 0) الملخّص

تم تجهيز كل ما يخصّ التشغيل: خدمة `onlyoffice` معزولة على شبكة داخلية بلا منافذ منشورة،
وصورة مبنية على إصدار مثبّت مع خط **Cairo**، وبروكسي نفس-الأصل على `/onlyoffice/` مع
تمرير WebSocket، ومتغيّرات البيئة وأعلام الميزة (معطّلة افتراضيًا).

**الحالة:** ✅ التحقق الساكن مكتمل — ⏳ التحقق التشغيلي (بناء الصور، صحة الحاوية،
البروكسي، الخطوط) **مطلوب على جهاز الشركة** لأن Docker غير مثبّت على جهاز التطوير الحالي.

| البند | الحالة |
|---|---|
| `docker compose config` (تحقق الصيغة والاعتماديات) | ✅ ناجح |
| `nginx -t` على إعداد البروكسي الفعلي | ✅ ناجح |
| وجود وسم الصورة `onlyoffice/documentserver:10.0.0.1` على Docker Hub | ✅ مؤكَّد |
| خطوط Cairo (ملفات + جداول أسماء + تغطية عربية) | ✅ مؤكَّدة بفحص برمجي |
| بناء الصور وتشغيل الحاويات | ⏳ جهاز الشركة |
| `/onlyoffice/healthcheck` عبر nginx | ⏳ جهاز الشركة |
| ظهور Cairo في `fc-list` داخل الحاوية | ⏳ جهاز الشركة |
| WebSocket | ⏳ يُثبت نهائيًا عند أول جلسة تحرير (المرحلة 5) |

---

## 1) الملفات المتغيّرة

| الملف | التغيير |
|---|---|
| `infra/onlyoffice/Dockerfile` | **جديد** — صورة DS + `fontconfig` + `fonts-noto-core` + Cairo، مع فحص بناء يرفض الصورة إن لم يرَ الخطّين |
| `infra/onlyoffice/fonts/Cairo-Regular.ttf` | **جديد** — نسخة ثابتة (wght 400) من الخط المتغيّر الرسمي |
| `infra/onlyoffice/fonts/Cairo-Bold.ttf` | **جديد** — نسخة ثابتة (wght 700)، جداول الأسماء/الوزن مُصحّحة |
| `infra/onlyoffice/fonts/OFL-Cairo.txt` | **جديد** — نصّ ترخيص SIL OFL 1.1 (إلزامي عند إعادة التوزيع) |
| `docker-compose.yml` | خدمة `onlyoffice` (بلا منافذ، شبكة داخلية، JWT، volumes، healthcheck)، ربط `api` و`web` بالشبكة الداخلية، أعلام الواجهة كـ build args، volumes وnetwork الجديدة |
| `infra/nginx/default.conf` | `map` للـ WebSocket، `log_format` بلا query string، `location ^~ /onlyoffice/`، `location ^~ /api/office/` |
| `infra/web/Dockerfile` | `ARG`/`ENV` لـ `VITE_ONLYOFFICE_ENABLED` و`VITE_ONLYOFFICE_URL` و`VITE_OFFICE_LOAD_TIMEOUT_MS` |
| `.env.example` | كتلة ONLYOFFICE/Office كاملة + أعلام الواجهة |
| `README.md` | تحديث عدد الخدمات + قسم تشغيل/تحقق مختصر |

**غير ملموس:** `src/**`، `apps/api/**`، أي هجرة Alembic، `SmartForms`، `FormDesigner`،
`formFileParser` — كلها كما هي.

---

## 2) الشبكة والعزل

```text
        المتصفح
          │  http://<host>/            (SPA)
          │  http://<host>/api/*       (REST)
          │  http://<host>/onlyoffice/*(iframe + WebSocket)
          ▼
   ┌──────────────┐  /api/  ┌──────────────┐   SQL   ┌──────────────┐
   │ web (nginx)  │────────►│  api:8000    │────────►│   db:5432    │
   │  :80 منشور   │         │  FastAPI     │         └──────────────┘
   │              │  /onlyoffice/  │
   └──────┬───────┘────────►┌──────▼───────┐
          │                 │ onlyoffice:80│  ← لا منافذ منشورة
          └────────────────►│  DS 10.0.0.1 │
                            └──────────────┘
```

| الخدمة | الشبكات | المنافذ على المضيف |
|---|---|---|
| `db` | `smd` | — |
| `api` | `smd` + `office_internal` | — (`8000` داخلي) |
| `worker` | `smd` | — |
| `web` | `smd` + `office_internal` | `${WEB_PORT:-80}:80` |
| `onlyoffice` | `office_internal` فقط | **لا شيء** |

`office_internal` معرّفة `internal: true` → لا مسار خروج للإنترنت من حاوية المحرّر،
ولا وصول لأي خدمة خارج المشروع. `db` و`worker` غير موجودين على هذه الشبكة أصلًا.

**عنوان الـ Callback والتنزيل (المرحلة 3):** `http://api:8000/...` — اسم الخدمة على
`office_internal`، لا `localhost` ولا IP ثابت.

**نقطة إلزامية اكتُشفت أثناء التنفيذ:** ONLYOFFICE يرفض افتراضيًا الاتصال بعناوين IP
الخاصة (`request-filtering-agent`)، وهذا يشمل `api:8000`. لذلك تُضبط
`ALLOW_PRIVATE_IP_ADDRESS=true` — بدونها كل جلسة تحرير تفشل بـ «download failed».
`ALLOW_META_IP_ADDRESS` يبقى `false`، والحاوية بلا مسار خارجي، وكل URL تتلقاه موقّع
من الـ API.

---

## 3) متغيّرات البيئة (`.env.example`)

```dotenv
onlyoffice  ── JWT_ENABLED=true · JWT_HEADER=Authorization · JWT_IN_BODY=true
               GENERATE_FONTS=true · ALLOW_PRIVATE_IP_ADDRESS=true · TZ=Africa/Cairo

env         ── ONLYOFFICE_ENABLED=false            # المفتاح الرئيسي (الافتراضي: معطّل)
               ONLYOFFICE_IMAGE=onlyoffice/documentserver:10.0.0.1
               ONLYOFFICE_JWT_SECRET=…             # إلزامي، ≥32 حرفًا
               ONLYOFFICE_INTERNAL_URL=http://onlyoffice
               ONLYOFFICE_INTERNAL_HOST=onlyoffice
               ONLYOFFICE_CALLBACK_BASE=http://api:8000
               OFFICE_TOKEN_SECRET=""              # فارغ → SECRET_KEY
               OFFICE_DOWNLOAD_TOKEN_TTL_SECONDS=600
               OFFICE_CALLBACK_TOKEN_TTL_SECONDS=43200
               OFFICE_SESSION_TTL_MINUTES=60
               OFFICE_MAX_FILE_MB=20 · OFFICE_MAX_CALLBACK_MB=50
               OFFICE_VERSION_RETENTION=0          # 0 = كل النسخ
               OFFICE_LEGACY_CONVERT_ON_UPLOAD=true
               OFFICE_REQUIRE_DS_DOWNLOAD_TOKEN=true
               OFFICE_ALLOW_COEDITING=false
               SUBMISSION_SNAPSHOT_ENABLED=true

build-time  ── VITE_ONLYOFFICE_ENABLED=false · VITE_ONLYOFFICE_URL=/onlyoffice
               VITE_OFFICE_LOAD_TIMEOUT_MS=20000
```

- `ONLYOFFICE_JWT_SECRET` يستخدم `${VAR:?…}` في Compose → **بدونه لا يقلع المشروع**.
  القيمة في `.env.example` مجرّد Placeholder ويجب استبدالها:
  `openssl rand -hex 32`.
- كل الإعدادات الجديدة لا تفعّل شيئًا وهي `false`: سلوك النظام اليوم لا يتغيّر.

---

## 4) بروكسي Nginx (`/onlyoffice/`)

- المسار نفسه-الأصل يلغي مشاكل CORS وCSP والإطار.
- `proxy_pass http://onlyoffice/;` (شرطة أخيرة) تقصّ البادئة قبل التمرير.
- `X-Forwarded-Host $host/onlyoffice` — **بدون** ضبط `Host` يدويًا؛ هذا هو أسلوب
  «virtual path» الرسمي من `ONLYOFFICE/document-server-proxy`. بدونه يبني DS روابط
  الأصول من الجذر فتظهر صفحة بيضاء.
- `Upgrade`/`Connection` عبر `map` للـ WebSocket.
- `proxy_read_timeout 3600s` + `proxy_buffering off` + `proxy_request_buffering off`.
- `location ^~ /onlyoffice/` و`^~ /api/office/` حتى لا تسرق `location ~*` الخاصة
  بمنع الخرائط/الملفات المصدرية أصول المحرّر.
- `log_format office_safe` بلا `$request`: توكنات التنزيل والكولباك لا تُكتب في السجلات.

> **قيد مقصود:** nginx يحلّ اسم `onlyoffice` عند الإقلاع فقط. عند إعادة إنشاء الحاوية
> (تغيّر IP) أعد تشغيل `web`. موثّق في README وهنا.

---

## 5) الخطوط العربية

| العنصر | القيمة |
|---|---|
| المصدر | `google/fonts` — `Cairo[slnt,wght].ttf` (SIL OFL 1.1) |
| النسخ المضمّنة | static instances عند `wght=400` و`wght=700` و`slnt=0` (بقايا fvar أُزيلت) |
| جداول الأسماء | `Cairo / Regular / Cairo Regular / Cairo-Regular` و`Cairo / Bold / Cairo Bold / Cairo-Bold`، `OS/2.usWeightClass` = 400/700 |
| التغطية | كل الحروف العربية + الأرقام (تحقّق برمجي على `cmap`) |
| الموقع في الصورة | `/usr/share/fonts/truetype/custom/` |
| الترخيص | `/usr/share/doc/fonts-cairo/OFL.txt` |
| التفعيل | `GENERATE_FONTS=true` → إعادة بناء `AllFonts.js` عند كل إقلاع (لا حاجة لسكربت وقت البناء) |
| فحص البناء | يفشل البناء إن لم يجد fontconfig النمطين أو لم يجد Cairo في خطوط دعم `U+0627` |

نفس الملفّين سيُنسخان في المرحلة 3 إلى `apps/api/app/assets/fonts/` لمولّد لقطة PDF،
فتتطابق المعاينة والطباعة ولقطة الأرشيف.

---

## 6) التحقق الساكن المنفَّذ (نتائج فعلية)

| # | الفحص | الأمر | النتيجة |
|---|---|---|---|
| 1 | صيغة Compose + interpolation + الاعتماديات + الشبكات + volumes | `docker-compose config` (binary رسمي v5.7.1، بمتغيّرات `.env.example`) | ✅ `exit 0`؛ `onlyoffice` بلا `ports`، `office_internal.internal=true`، `web.depends_on` يشمل `onlyoffice`، أعلام `VITE_*` ظاهرة في `build.args` |
| 2 | صحة إعداد nginx | `nginx -t` (nginx 1.27.5، بنفس إعداد `location` والـ `map` والـ `log_format`، مع استبدال أسماء الخدمات بـ `127.0.0.1` فقط) | ✅ `syntax is ok` / `test is successful` |
| 3 | وجود وسم صورة DS | `GET hub.docker.com/v2/repositories/onlyoffice/documentserver/tags` | ✅ `10.0.0.1` موجود |
| 4 | سلامة الخطوط | فحص `fontTools`: الأسماء/الوزن، `fvar` محذوف، تغطية الحروف العربية والأرقام | ✅ نجح للنمطين |
| 5 | ملفات الصورة | وجود `Dockerfile` + `fonts/Cairo-*.ttf` + `OFL-Cairo.txt` | ✅ |
| 6 | عدم تجاهل git للخطوط | `git check-ignore infra/onlyoffice/fonts/Cairo-Regular.ttf` | ✅ غير متجاهَل |

> `nginx -t` شُغّل على نسخة من الملف نفسه مع تغيير اسمي المضيفين فقط
> (`api`→`127.0.0.1:8000`, `onlyoffice`→`127.0.0.1:8080`) ومسار السجل، لأن أسماء
> خدمات Docker لا تُحلّ على Windows. كل التوجيهات الأخرى (map، headers، timeouts،
> buffering) مُختبرة كما هي.

---

## 7) التحقق التشغيلي — checklist على جهاز الشركة

> نفّذها بالترتيب. أي خطوة لا تعطي النتيجة المتوقّعة = توقّف قبل المرحلة 3.

### 7.1 الإعداد والبناء

```bash
cp .env.example .env
# عدّل: SECRET_KEY, POSTGRES_PASSWORD, ONLYOFFICE_JWT_SECRET (openssl rand -hex 32)

docker compose config >/dev/null && echo "compose OK"
docker compose build onlyoffice web
docker compose up -d
```

**المتوقّع:** بناء `onlyoffice` ينجح، وآخر خطوة فيه تطبع نتائج `fc-list` لـ Cairo
(وجود `Cairo:style=Regular` و`Cairo:style=Bold`)، وبدونها كان البناء سيفشل.

### 7.2 صحة الحاويات

```bash
docker compose ps
```

**المتوقّع:** `db` و`api` و`web` و`worker` و`onlyoffice` — `onlyoffice` بحالة
`healthy` بعد 2–4 دقائق من أول إقلاع (تهيئة قاعدة DS + توليد قائمة الخطوط).
إن ظلّت `starting` أكثر من 6 دقائق:

```bash
docker compose logs --tail=100 onlyoffice
```

### 7.3 وصول المتصفح للـ DS عبر nginx

```bash
curl -fsS http://localhost/onlyoffice/healthcheck        # → true
curl -fsSI http://localhost/onlyoffice | head -n 1       # → 301 (إلى /onlyoffice/)
curl -fsSI http://localhost/onlyoffice/web-apps/apps/api/documents/api.js | head -n 8
```

**المتوقّع:** `true`، و`HTTP/1.1 200` مع `Content-Type: application/javascript`.

### 7.4 تحميل واجهة المحرّر كاملة (بدون تحرير مستند بعد)

افتح في المتصفح:
`http://localhost/onlyoffice/example/`

**المتوقّع:** تظهر صفحة أمثلة ONLYOFFICE كاملة التنسيق (بدون صفحة بيضاء وبدون
أخطاء 404 في Network). هذا يثبت أن `X-Forwarded-Host` صحيح وأن الأصول تُحمّل من
`/onlyoffice/...` لا من الجذر.

### 7.5 الخطوط داخل الحاوية

```bash
docker compose exec onlyoffice fc-list | grep -i cairo
docker compose exec onlyoffice grep -c -i cairo \
  /var/www/onlyoffice/documentserver/sdkjs/common/AllFonts.js
```

**المتوقّع:** سطرَان (`Cairo:style=Regular` و`Cairo:style=Bold`)، وعدد أكبر من صفر
في `AllFonts.js`. إن كان العدد صفرًا: `docker compose restart onlyoffice` وانتظر
اكتمال توليد الخطوط ثم أعد الفحص.

### 7.6 العزل

```bash
docker compose port onlyoffice 80            # → لا مخرجات (لا منفذ منشور)
docker network inspect smd-hr_office_internal --format '{{.Internal}}'   # → true
docker compose exec onlyoffice sh -lc 'getent hosts api; getent hosts db'
```

**المتوقّع:** لا منفذ منشور؛ `Internal=true`؛ `api` يُحلّ، و`db` **لا** يُحلّ.

### 7.7 WebSocket

لا يمكن إثباته نهائيًا قبل وجود جلسة تحرير حقيقية (تحتاج مستندًا ومفتاحًا موقّعًا من
الـ API). في المرحلة 2 نتحقق من أن المسار والرؤوس جاهزة:

- `GET /onlyoffice/healthcheck` عبر nginx ينجح (7.3).
- صفحة `/onlyoffice/example/` تُحمّل (7.4) — وهذا يتضمن اتصال DS الداخلي.
- **الإثبات النهائي:** في المرحلة 5 عند فتح محرّر لأول مرة، تتحقق DevTools →
  Network → WS من وجود اتصال `101 Switching Protocols` على `/onlyoffice/doc/...`.
  إن ظهر `400/426` فراجع `map $http_upgrade` و`proxy_set_header Connection`.

### 7.8 اختبار الخط العربي بصريًا

1. أنشئ ملف DOCX عربيًا (RTL، جملة مثل «شركة السويس لمشتقات الميثانول — إجازة سنوية»)
   بخط Cairo.
2. ارفعه من شاشة النماذج بعد اكتمال المرحلة 3، أو ضعه في `uploads` يدويًا مؤقتًا
   وافتحه من DS للتجربة.
3. **المعيار:** الحروف غير مقطّعة، الاتجاه RTL، الفاصلة العربية والأرقام سليمة،
   واسم الخط في قائمة الخطوط يظهر `Cairo` (لا بديل مثل DejaVu).

### 7.9 إعادة التشغيل والاستمرارية

```bash
docker compose restart onlyoffice web
docker compose ps
curl -fsS http://localhost/onlyoffice/healthcheck
```

**المتوقّع:** العودة إلى `healthy` وبقاء الإعدادات (JWT والخطوط) بعد إعادة التشغيل.

---

## 8) استكشاف الأخطاء

| العرض | السبب المرجّح | الحل |
|---|---|---|
| صفحة بيضاء في `/onlyoffice/example/` وأخطاء 404 لأصول من الجذر | `X-Forwarded-Host` لا يحتوي `/onlyoffice` أو تم ضبط `Host` يدويًا | راجع `infra/nginx/default.conf` ثم `docker compose restart web` |
| `502 Bad Gateway` على `/onlyoffice/` | nginx أقلع قبل وجود حاوية DS أو أعيد إنشاؤها بتغيّر IP | `docker compose up -d onlyoffice && docker compose restart web` |
| المحرّر يفتح ثم «Download failed» | `ALLOW_PRIVATE_IP_ADDRESS` غير مفعّل أو `api:8000` غير قابل للوصول من DS | تحقق من المتغيّر ومن `docker compose exec onlyoffice getent hosts api` |
| فشل بناء الصورة عند خطوة الخطوط | ملف خط تالف أو `COPY` خاطئ | تحقق من `infra/onlyoffice/fonts/` (الحجم ~165KB لكل نمط) |
| `ONLYOFFICE_JWT_SECRET must be set in .env` | المتغيّر مفقود/فارغ | أضف قيمة ≥32 حرفًا في `.env` |
| حاوية `onlyoffice` تبقى `starting` طويلًا | أول إقلاع (تهيئة DB + توليد الخطوط) أو ذاكرة غير كافية | راقب `docker compose logs -f onlyoffice`؛ الجهاز 8GB كافٍ |
| الخط يظهر بديلًا في المحرّر | `AllFonts.js` لم يُولّد بعد | `docker compose restart onlyoffice` ثم أعد 7.5 |

---

## 9) التراجع

| المستوى | الإجراء | الأثر |
|---|---|---|
| إيقاف الميزة | `ONLYOFFICE_ENABLED=false` + `VITE_ONLYOFFICE_ENABLED=false` وإعادة بناء `web` | سلوك اليوم حرفيًا |
| إيقاف الحاوية | `docker compose stop onlyoffice` (مع إبقاء `web` يعمل) | `/onlyoffice/` يعطي 502 فقط؛ بقية النظام سليم |
| إزالة كاملة | حذف خدمة `onlyoffice` من Compose + `docker compose up -d --build web` | لا بيانات شركة تضيع: النسخ في `uploads` + PostgreSQL |
| حذف بيانات المحرّر | `docker compose down` ثم حذف volumes `oo_*` | آمن — ليست مصدر الحقيقة |

---

## 10) ملاحظات وقيود معروفة

1. **nginx يحلّ أسماء الخدمات عند الإقلاع فقط** → بعد إعادة إنشاء `onlyoffice` أعد
   تشغيل `web`.
2. **`ALLOW_PRIVATE_IP_ADDRESS=true`** ضروري لعمل التنزيل والـ callback على شبكة
   Docker الخاصة؛ مقبول لأن الشبكة `internal` والـ URLs موقّعة من الـ API.
3. **`GENERATE_FONTS=true`** يعيد بناء قائمة الخطوط كل إقلاع (يضيف ~20–60 ثانية
   لأول `healthy`). البديل (`false`) يخاطر بعدم ظهور Cairo بعد تحديث الصورة.
4. **لا HTTPS** في هذه الدورة (قرار المالك: HTTP داخلي فقط). عند الانتقال إليه لاحقًا
   يجب إضافة `X-Forwarded-Proto https` تلقائيًا (موجود) وشهادة على nginx الخارجي فقط.
5. **WebSocket** لا يُثبت نهائيًا قبل المرحلة 5 (يحتاج مستندًا حقيقيًا).
6. **النسخ الاحتياطي** لا يتغيّر: `pg_dump` + مجلد `uploads`؛ volumes الـ `oo_*`
   قابلة للحذف وإعادة البناء.

---

## 11) بوابة الانتقال إلى المرحلة 3

يُشترط قبل كتابة أي كود Backend:

- [ ] `docker compose config` ناجح على جهاز الشركة وبـ `.env` الحقيقي.
- [ ] بناء `onlyoffice` ناجح + فحص الخطوط في البناء يمرّ.
- [ ] `onlyoffice` = `healthy`، و`/onlyoffice/healthcheck` = `true` عبر nginx.
- [ ] `/onlyoffice/example/` تُحمّل كاملة (أصول من `/onlyoffice/...`).
- [ ] `fc-list` يُظهر Cairo Regular/Bold، و`AllFonts.js` يحتوي Cairo.
- [ ] `docker compose port onlyoffice 80` بلا مخرجات، و`office_internal.Internal=true`.
- [ ] إعادة التشغيل تعيد الحالة `healthy` دون فقدان إعداد.

عند اكتمال هذه البنود (أو موافقتك على المتابعة مع تدوين أي بند متعذّر) أبدأ
**المرحلة 3 — الخلفية**: نموذج الإصدارات، الهجرة، التوكنات، `/api/office/*`،
ولقطة الـ Submission، مع إصلاحي R5/R6.

---

## 12) ورقة النتائج (تُملأ على جهاز الشركة)

### 12.1 تنفيذ التحقق تلقائيًا (سكربت جاهز)

```powershell
# من جذر المستودع، على الجهاز الذي يعمل عليه Docker
powershell -ExecutionPolicy Bypass -File infra\scripts\verify-phase2.ps1
```

- السكربت **للقراءة فقط**: لا يوقف/يعيد إنشاء/يحذف أي حاوية أو حجم بيانات.
- يطبع النتائج ويحفظ تقريرًا واحدًا في `%TEMP%` باسم
  `smd-phase2-verification-<التاريخ>.txt` ويطبع مساره في السطر الأخير.
- لا يكتب أي سرّ (لا `.env` ولا توكنات) — آمن للإرسال.
- عند أول تشغيل قد تكون الحاوية `starting`؛ انتظر 2–5 دقائق ثم أعد التشغيل.

### 12.2 ورقة النتائج

| # | الفحص | المتوقّع | النتيجة الفعلية |
|---|---|---|---|
| 1 | `docker compose config --quiet` | بلا مخرجات | |
| 2 | `docker compose ps` | `onlyoffice` = `healthy` | |
| 3 | `docker compose exec onlyoffice curl -fsS http://127.0.0.1/healthcheck` | `true` | |
| 4 | `curl http://localhost/onlyoffice/healthcheck` | `true` | |
| 5 | `curl -sSI http://localhost/onlyoffice` | `301` إلى `/onlyoffice/` | |
| 6 | `curl -sSI http://localhost/onlyoffice/web-apps/apps/api/documents/api.js` | `200` + `application/javascript` | |
| 7 | `fc-list \| grep -i cairo` (داخل الحاوية) | سطران: Regular + Bold | |
| 8 | `grep -c -i cairo .../AllFonts.js` | رقم > 0 | |
| 9 | `docker compose port onlyoffice 80` | بلا مخرجات | |
| 10 | `docker network inspect smd-hr_office_internal --format '{{.Internal}}'` | `true` | |
| 11 | `getent hosts api` / `getent hosts db` داخل الحاوية | `api` يُحلّ، `db` لا | |
| 12 | فتح `http://localhost/onlyoffice/example/` | الصفحة كاملة (لقطة شاشة) | |
| 13 | إعادة التشغيل: `docker compose restart onlyoffice web` ثم الفحص 4 | `true` بعد العودة | |

### 12.3 ما يُرسل للانتقال إلى المرحلة 3

1. ملف التقرير `smd-phase2-verification-*.txt`.
2. لقطة شاشة لصفحة `/onlyoffice/example/`.
3. أي سطر `[FAIL]` مع مخرج الأمر الخاص به (السكربت يضمّنه أصلًا).

