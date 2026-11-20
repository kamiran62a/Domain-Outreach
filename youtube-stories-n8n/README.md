# قناة قصص يوتيوب شورتس تلقائية (n8n)

كل يوم الساعة 6 مساءً (بتوقيت الرياض) يقوم الـ workflow بـ:

1. **Claude** يكتب قصة عربية جديدة (45–55 ثانية) مع العنوان والوصف والوسوم ونص الصورة المصغّرة ووصف 6 مشاهد. يتذكّر آخر العناوين حتى لا يكرر نفسه.
2. **ElevenLabs** يحوّل القصة لصوت عربي، مع توقيت كل حرف (للترجمة على الشاشة).
3. **Replicate (FLUX schnell)** يرسم 6 صور عمودية 9:16 بنفس الأسلوب.
4. **ffmpeg** (داخل نفس السيرفر) يركّب الفيديو: حركة Ken Burns على كل صورة، عنوان أول 3 ثوانٍ، ترجمة عربية متزامنة مع الصوت، 1080×1920.
5. يصمّم **الصورة المصغّرة** (أول مشهد + نص كبير).
6. **يرفع على يوتيوب**، يعلّمه كمحتوى مولَّد بالذكاء الاصطناعي، ويضع الصورة المصغّرة.

```
Every day → Settings → Build Claude request → Claude → Parse story → ElevenLabs
→ One item per scene → Replicate ×6 → Build render job → Save job → Render (ffmpeg)
→ Read video → YouTube upload → Label as AI → Thumbnail → Remember title
```

## الملفات

| الملف | وش هو |
|---|---|
| `Dockerfile` | n8n 2.47.7 + ffmpeg + خطوط Noto العربية |
| `docker-compose.yml` | n8n + Caddy (شهادة HTTPS تلقائية) |
| `scripts/render.mjs` | سكربت تركيب الفيديو والصورة المصغّرة |
| `workflow.json` | الـ workflow، تستورده في n8n |
| `.env.example` | الإعدادات: الدومين ومفتاح التشفير |

## التشغيل خطوة بخطوة

### 1. السيرفر

أي VPS فيه Docker، بذاكرة 4GB على الأقل (Hetzner، DigitalOcean، …). وجّه دومين فرعي له (سجل A)، مثل `n8n.yourdomain.com`.

```bash
git clone <هذا المستودع> && cd youtube-stories-n8n
```

```bash
cp .env.example .env
```

عدّل `.env`: ضع الدومين، وولّد مفتاح التشفير بهذا الأمر وانسخه في `N8N_ENCRYPTION_KEY`:

```bash
openssl rand -hex 32
```

```bash
docker compose up -d --build
```

افتح `https://n8n.yourdomain.com` وأنشئ حساب المالك.

### 2. المفاتيح (Credentials في n8n)

من **Credentials → Add credential → Header Auth**، أنشئ ثلاثة بهذه الأسماء بالضبط:

| الاسم | Header Name | Value | من وين |
|---|---|---|---|
| `Anthropic API` | `x-api-key` | مفتاحك | console.anthropic.com |
| `ElevenLabs API` | `xi-api-key` | مفتاحك | elevenlabs.io → Profile → API Keys |
| `Replicate API` | `Authorization` | `Bearer r8_...` | replicate.com/account/api-tokens |

### 3. ربط يوتيوب (أهم خطوة)

1. في [Google Cloud Console](https://console.cloud.google.com): أنشئ مشروع ← فعّل **YouTube Data API v3**.
2. **OAuth consent screen**: نوع External، أضف إيميلك، ثم **Publish app → In production**. لو تركته على Testing، الربط ينقطع كل 7 أيام ويتوقف النشر.
3. **Credentials → Create OAuth client ID → Web application**، وفي Authorized redirect URIs ضع:
   `https://n8n.yourdomain.com/rest/oauth2-credential/callback`
4. في n8n: **Add credential → YouTube OAuth2 API**، سمّه `YouTube account`، الصق Client ID و Secret، واضغط **Sign in with Google** واختر حساب القناة.

### 4. استيراد الـ workflow

1. **Workflows → Import from file** واختر `workflow.json`.
2. افتح كل عقدة عليها علامة تحذير واختر الـ credential المناسب لها.
3. افتح عقدة **Settings** وعدّل:
   - `elevenlabs_voice_id`: انسخه من مكتبة الأصوات في ElevenLabs (اختر صوت عربي، أو أي صوت يدعم multilingual).
   - `story_theme`: نوع القصص (الافتراضي: غموض وتراث شعبي).
   - `image_style`: أسلوب الرسم.
   - `privacy`: يبدأ على `private` للتجربة.
4. اضغط **Run now (test)** وتابع كل عقدة. أول تشغيل ياخذ 1–3 دقائق.
5. شوف الفيديو على القناة. إذا عجبك، رجّع `privacy` إلى `public` وفعّل الـ workflow (**Active**).

## أشياء لازم تعرفها قبل ما تعتمد عليه

- **الفيديوهات تنحبس على Private حتى يعتمد يوتيوب مشروعك.** أي مشروع Google Cloud جديد يرفع عن طريق الـ API تكون فيديوهاته خاصة إجبارياً إلى أن تقدّم [نموذج تدقيق YouTube API](https://support.google.com/youtube/contact/yt_api_form) وينقبل. قدّمه من أول يوم.
- **الصورة المصغّرة المخصصة** تحتاج قناة موثّقة برقم جوال. وفي الشورتس يوتيوب ما يعرضها دائماً، لذلك العنوان مكتوب أيضاً على أول 3 ثوانٍ من الفيديو. لو فشلت هذه الخطوة يكمل الـ workflow عادي.
- **سياسة يوتيوب للمحتوى المكرر:** القنوات اللي تنشر محتوى آلي متشابه ممكن تنرفض من برنامج الشركاء (الربح). تنوّع القصص، الصوت، وأسلوب الصور يفرق كثيراً. راجع أول أسبوعين بنفسك قبل ما تتركه يشتغل لحاله.
- **تعليم المحتوى كذكاء اصطناعي** (`containsSyntheticMedia`) مفعّل تلقائياً، لأن يوتيوب يطلبه للمحتوى الواقعي المولّد.
- **الحماية من رفض Claude:** الطلب يستخدم `fallbacks: "default"`، يعني لو رُفض الطلب لسبب أمان يعيد المحاولة بموديل بديل تلقائياً. إذا رُفض نهائياً يتوقف التشغيل ويظهر السبب.

## التكلفة التقريبية

تقدير فقط، راجع أسعار كل خدمة:

- Claude: سنتات قليلة لكل قصة.
- ElevenLabs: القصة حوالي 700–900 حرف، يعني حوالي 25 ألف حرف شهرياً. خطة Starter أو Creator تكفي.
- Replicate FLUX schnell: حوالي 6 صور لكل فيديو، تكلفة صغيرة جداً.
- السيرفر: حوالي 5–10 دولار شهرياً.

## تعديلات شائعة

- **وقت النشر:** عقدة **Every day**، أو `TIMEZONE` في `.env`.
- **عدد المشاهد:** `scenes` في Settings (المدة تتوزع بالتساوي على الصور).
- **شكل الترجمة:** حجم الخط والألوان في `scripts/render.mjs` (قسم `[V4+ Styles]`). بعد أي تعديل:

  ```bash
  docker compose up -d --build
  ```
