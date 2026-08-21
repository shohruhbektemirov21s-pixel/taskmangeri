import os
import sys
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(key, default=False):
    return os.getenv(key, str(int(default))).lower() in ("1", "true", "yes", "on")


def env_list(key, default=""):
    return [x.strip() for x in os.getenv(key, default).split(",") if x.strip()]


SECRET_KEY = os.getenv("SECRET_KEY", "dev-insecure-key-change-me")
# STANDARTI `False`. Ilgari `True` edi va bu xavfli standart: `.env` unutilsa
# yoki o'zgaruvchi nomida xato bo'lsa, server produksiyada jimgina debug
# rejimida ko'tarilardi - har bir xato to'liq traceback bilan, ichidagi
# sozlamalar va so'rov matnlari bilan birga ko'rinardi. `SECRET_KEY` uchun
# bunday himoya allaqachon bor (pastda), `DEBUG` esa himoyasiz qolgan edi.
# Ishlab chiqishda `backend/.env` da `DEBUG=1` turadi - hech narsa o'zgarmaydi.
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "*") or ["*"]

# `ALLOWED_HOSTS = ["*"]` bilan produksiyaga chiqib ketish - `SECRET_KEY`
# bilan bir xil jimgina xato, faqat oqibati boshqa joyda ko'rinadi.
#
# Gap Host sarlavhasida emas: WebSocket qatlami aynan shu ro'yxatga
# tayanadi (`config/asgi.py` dagi `AllowedHostsOriginValidator`). Ro'yxat
# `*` bo'lsa u HAR QANDAY `Origin` ni qabul qiladi, ya'ni begona saytdan
# ochilgan ulanishga qarshi himoya butunlay o'chadi. Bundan tashqari
# Django ning `Host` bo'yicha tekshiruvi ham yo'qoladi - parol tiklash
# kabi absolyut havolalar begona domen bilan yasalishi mumkin bo'ladi.
#
# Ishlab chiqishda hech narsa o'zgarmaydi: `DEBUG=1` da bu shart
# umuman qaralmaydi.
if not DEBUG and ALLOWED_HOSTS == ["*"]:
    raise ImproperlyConfigured(
        "ALLOWED_HOSTS ko'rsatilmagan. Produksiya uchun domenlarni sanang: "
        "ALLOWED_HOSTS=teamflow.uz,www.teamflow.uz"
    )

# Ishlab chiqish uchun standart kalit qulay, lekin u bilan serverga chiqib
# ketish - eng jimgina va eng qimmat xato: kalit ochiq bo'lsa har kim o'zi
# uchun haqiqiy sessiya va parol tiklash havolasini yasay oladi. Shuning
# uchun `DEBUG` o'chirilgan holda zaif kalit bilan ishga tushish taqiqlanadi:
# nosozlik ishga tushirish paytida, aniq xabar bilan chiqadi.
INSECURE_KEYS = {"dev-insecure-key-change-me"}
if not DEBUG and (SECRET_KEY in INSECURE_KEYS
                  or SECRET_KEY.startswith("change-me")
                  or len(SECRET_KEY) < 32):
    raise ImproperlyConfigured(
        "SECRET_KEY standart yoki juda qisqa. Produksiya uchun yangisini yarating: "
        "python -c \"from django.core.management.utils import get_random_secret_key as k; print(k())\""
    )

# Shu bilan birga, DEBUG o'chirilganda brauzer himoyalarini ham yoqamiz -
# ular faqat HTTPS ortida ma'noga ega, shuning uchun dev da tegilmaydi.
if not DEBUG:
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

INSTALLED_APPS = [
    # daphne ro'yxatning boshida turishi shart - shunda runserver ham
    # ASGI rejimida ishlaydi va WebSocket ulanishlarini qabul qiladi.
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # uchinchi tomon
    "rest_framework",
    # Bekor qilingan refresh tokenlar ro'yxati. Usiz "chiqish" degani faqat
    # brauzerdagi tokenni tashlash bo'lardi: o'g'irlangan refresh token
    # 14 kun ishlayverar, parol almashtirish ham unga tegmasdi.
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "channels",
    # loyiha ilovalari
    # `apps.core` da model YO'Q va domen ilovalariga bog'liqlik ham yo'q -
    # u eng pastki qatlam: Db2 adapteri, umumiy maydonlar, yumshoq
    # o'chirish, so'rov yordamchilari, fayl uzatish va o'qish shlyuzi.
    "apps.core",
    "apps.accounts",
    "apps.workspaces",
    "apps.projects",
    "apps.tasks",
    "apps.activity",
    "apps.notifications",
    "apps.chat",
    # Telegram boti: bildirishnomalarni Telegramga ham uzatadi.
    # Token qo'yilmasa butunlay jim turadi (`apps/telegram/client.is_configured`).
    "apps.telegram",
    # Interfeys so'zlari: sayt matnlari kodda emas, bazada turadi va
    # `django-admin/` dan tahrirlanadi.
    "apps.uitexts",
    # Takliflar: jamoa taklif beradi va ovoz beradi, boshliq qaror qiladi.
    "apps.suggestions",
    # Panel va hisobotlar - bir necha domen ustidan o'qiydigan ko'rinishlar
    # (bosh panel, «Mening ishim», jamoa yuklamasi, ochiq qidiruv).
    # Modeli yo'q va shu sababdan eng oxirida: u hammani biladi, uni esa
    # hech kim bilmaydi.
    "apps.panel",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Ikkovi ham JAVOB tomonida ishlaydi, shuning uchun eng oxirida:
    # `last_seen` DRF foydalanuvchini aniqlab bo'lgach yoziladi, muddat
    # eslatmasi esa javob tayyor bo'lgach yuboriladi - hech biri so'rovni
    # kutdirmaydi.
    "apps.accounts.middleware.LastSeenMiddleware",
    "apps.panel.middleware.DeadlineReminderMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------- Baza
# IBM Db2. Loyihada bazaga xos maydon yo'q: JSON `apps.core.fields.JSONTextField`
# orqali matnda saqlanadi, kerakli mutaxassisliklar esa alohida jadvalda
# (`projects.ProjectSpecialty`) - shuning uchun migratsiyalar boshqa bazada ham
# ishlaydi, lekin loyiha Db2 ga sozlangan.
DATABASES = {
    "default": {
        # `ibm_db_django` ustidagi tuzatish qatlami (apps/core/db2/base.py):
        # asl adapter mintaqali vaqtni Db2 tushunmaydigan ko'rinishda uzatadi.
        "ENGINE": "apps.core.db2",
        "NAME": os.getenv("DB2_DB", "TEAMFLOW"),
        "USER": os.getenv("DB2_USER", "db2inst1"),
        "PASSWORD": os.getenv("DB2_PASSWORD", "teamflow"),
        "HOST": os.getenv("DB2_HOST", "db2"),
        "PORT": os.getenv("DB2_PORT", "50000"),
        "PCONNECT": True,        # ulanishni qayta ishlatish
        "CONN_MAX_AGE": 60,
        # Db2 da baza nomi 8 belgidan oshmaydi va adapter unga o'zi `t_`
        # qo'shadi - `t_TEAMFLOW` esa yaroqsiz nom (SQL1001N). Shuning uchun
        # sinov bazasi nomini o'zimiz beramiz.
        "TEST": {"NAME": os.getenv("DB2_TEST_DB", "TFTEST")},
    }
}

AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["apps.accounts.backends.EmailBackend"]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "uz"
TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Tashkent")

# ---------------------------------------------------------------- Telegram
# Token @BotFather dan olinadi va `backend/.env` da turadi. Qo'yilmasa
# Telegram qismi butunlay o'chadi: ilova oldingidek ishlayveradi, faqat
# xabar yuborilmaydi va profildagi bo'lim ko'rinmaydi.
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "")
# Telegramdagi tugmalar shu manzilga olib boradi. Bo'sh bo'lsa tugma
# umuman chizilmaydi - ishlamaydigan havoladan ko'ra yo'g'i yaxshi.
SITE_URL = os.getenv("SITE_URL", "")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------- DRF
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardPagination",
    "PAGE_SIZE": 30,
    "DATETIME_FORMAT": "%Y-%m-%dT%H:%M:%S%z",
    # Spam va qo'pol kuch (brute force) ga qarshi cheklovlar.
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "chat": "90/min",        # bir odam daqiqada 90 tadan ko'p xabar yozmaydi
        "invite": "40/hour",     # jamoaga a'zo qo'shish - to'p-to'p qo'shib tashlamasin
        "auth": "20/min",        # kirish va ro'yxatdan o'tish urinishlari
        "search": "120/min",     # odam qidirish
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=12),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    # Yangilangandan keyin eskisi ishlamaydi: bir refresh token faqat bir
    # marta ishlatiladi. Aks holda o'g'irlangan eski token muddati
    # tugagunga qadar (14 kun) yangi access token olib turardi.
    "BLACKLIST_AFTER_ROTATION": True,
    # Kirish paytida `last_login` yozilsin. Standarti `False` va shu sabab
    # maydon 37 hisobdan bittasida to'lgan edi: sessiya bilan kirgan yagona
    # odamniki. Endi JWT bilan kirgan har bir odamnikiga ham yoziladi.
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# ---------------------------------------------------------------- CORS
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://localhost:8080",
)
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env_list(
    "CSRF_TRUSTED_ORIGINS",
    "http://localhost:5173,http://localhost:8000,http://localhost:8080",
)
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True

# ---------------------------------------------------------------- Real-time
# Bildirishnoma va chat WebSocket orqali yetkaziladi. Kanal qatlami Redis da:
# bir nechta backend jarayoni bo'lsa ham xabar hammaga yetib boradi.
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
# Pub/Sub qatlami tanlandi: navbatga asoslangan `core.RedisChannelLayer` bo'sh
# turgan ulanishda "Timeout reading from redis" bilan yiqilib, tirik WebSocketni
# uzib yuboradi. Bizga navbat kerak emas - faqat guruhga tarqatish kerak.
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.pubsub.RedisPubSubChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

# Kesh ham Redis da: so'rov cheklovlari (throttling) shu yerda sanaladi.
# Xotiradagi kesh bo'lsa har bir jarayon o'zicha sanab, cheklov osongina
# aylanib o'tilardi.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
    }
}

# Testlarda kesh xotirada bo'ladi. Aks holda testlar dev server bilan BITTA
# Redis ni bo'lishadi va bir-biriga aralashadi: kunlik eslatma qulfi
# (`deadline-reminders:<sana>`) qaysi tomon birinchi tegsa o'shaniki bo'lib,
# testlardagi so'rov sanog'i o'zgarib turardi (test_panel ba'zan yiqilardi),
# dev server esa o'sha kungi eslatmalarini yubormay qolardi. Throttle
# hisoblagichlari ham shu keshda - ular ham izolyatsiyada bo'lgani ma'qul.
TESTING = len(sys.argv) > 1 and sys.argv[1] == "test"
if TESTING:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# ---------------------------------------------------------------- Fon oqimi
# Tashqi tarmoqqa boradigan ishlar (hozircha - Telegram) foydalanuvchi
# so'rovining ichida emas, kichik oqimlar to'plamida bajariladi:
# `apps/core/background.py`. Testlarda o'chiriladi - u yerda chaqiruv
# joyida bajarilishi va natijasi darrov ko'rinishi kerak.
BACKGROUND_TASKS = env_bool("BACKGROUND_TASKS", True) and not TESTING

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
}
