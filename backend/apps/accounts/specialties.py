"""Mutaxassisliklar va ularga bog'liq xususiyatlar.

Ro'yxatdan o'tishda har bir foydalanuvchi mutaxassislik tanlaydi.
Shu tanlov keyin butun tizimga ta'sir qiladi:
  - loyihada qaysi vazifalar unga tavsiya etiladi
  - menejer vazifa berayotganda mos odamlarni ko'radi
  - loyiha "kerakli mutaxassisliklar" ro'yxati bilan e'lon qilinadi
  - profil taklif qilinadigan ko'nikmalar bilan to'ldiriladi
"""
from django.db import models


class Specialty(models.TextChoices):
    BACKEND = "BACKEND", "Backend dasturchi"
    FRONTEND = "FRONTEND", "Frontend dasturchi"
    FULLSTACK = "FULLSTACK", "Fullstack dasturchi"
    MOBILE = "MOBILE", "Mobil dasturchi"
    DEVOPS = "DEVOPS", "DevOps muhandisi"
    QA = "QA", "Tester (QA)"
    DESIGNER = "DESIGNER", "UI/UX dizayner"
    DATA = "DATA", "Data / ML muhandisi"
    ANALYST = "ANALYST", "Biznes tahlilchi"
    SECURITY = "SECURITY", "Xavfsizlik mutaxassisi"
    PM = "PM", "Loyiha menejeri"


class Seniority(models.TextChoices):
    INTERN = "INTERN", "Stajyor"
    JUNIOR = "JUNIOR", "Junior"
    MIDDLE = "MIDDLE", "Middle"
    SENIOR = "SENIOR", "Senior"
    LEAD = "LEAD", "Lead / Arxitektor"


# Har bir mutaxassislik uchun tizim xususiyatlari
SPECIALTY_PROFILE = {
    Specialty.BACKEND: {
        "icon": "{ }",
        "color": "#3fb950",
        "skills": ["Python", "Django", "PostgreSQL", "REST API", "Docker"],
        "task_types": ["FEATURE", "BUG", "CHORE", "RESEARCH"],
        "default_project_role": "DEVELOPER",
        "focus": "Server logikasi, API, ma'lumotlar bazasi",
        "checklist": [
            "API endpoint hujjatlashtirildi",
            "Migratsiya yozildi va tekshirildi",
            "Xatolik holatlari qayta ishlandi",
            "Testlar otdi",
        ],
    },
    Specialty.FRONTEND: {
        "icon": "</>",
        "color": "#2f81f7",
        "skills": ["TypeScript", "React", "CSS", "Vite", "REST API"],
        "task_types": ["FEATURE", "BUG", "CHORE"],
        "default_project_role": "DEVELOPER",
        "focus": "Interfeys, komponentlar, foydalanuvchi tajribasi",
        "checklist": [
            "Mobil ekranda tekshirildi",
            "Yuklanish va xato holatlari bor",
            "Dizaynga mos keladi",
            "Konsolda xato yoq",
        ],
    },
    Specialty.FULLSTACK: {
        "icon": "<>",
        "color": "#a371f7",
        "skills": ["TypeScript", "React", "Python", "Django", "PostgreSQL"],
        "task_types": ["FEATURE", "BUG", "CHORE", "RESEARCH"],
        "default_project_role": "DEVELOPER",
        "focus": "Backend va frontendni uchidan-uchiga yopish",
        "checklist": [
            "API va UI birga ishlaydi",
            "Migratsiya va tiplar yangilandi",
            "Uchidan-uchiga qolda tekshirildi",
        ],
    },
    Specialty.MOBILE: {
        "icon": "[ ]",
        "color": "#db6d28",
        "skills": ["Flutter", "Dart", "Kotlin", "Swift", "REST API"],
        "task_types": ["FEATURE", "BUG", "CHORE"],
        "default_project_role": "DEVELOPER",
        "focus": "Android / iOS ilova",
        "checklist": [
            "Android va iOS da tekshirildi",
            "Offline holat qayta ishlandi",
            "Ekran olchamlariga moslashdi",
        ],
    },
    Specialty.DEVOPS: {
        "icon": "( )",
        "color": "#d29922",
        "skills": ["Docker", "CI/CD", "Nginx", "Linux", "Monitoring"],
        "task_types": ["CHORE", "BUG", "RESEARCH"],
        "default_project_role": "DEVELOPER",
        "focus": "Infratuzilma, deploy, monitoring",
        "checklist": [
            "Deploy hujjatlashtirildi",
            "Rollback yoli bor",
            "Maxfiy kalitlar .env da",
            "Monitoring/log sozlandi",
        ],
    },
    Specialty.QA: {
        "icon": "[v]",
        "color": "#f778ba",
        "skills": ["Test-case", "Postman", "Selenium", "Bug reporting"],
        "task_types": ["BUG", "CHORE", "DOCS"],
        "default_project_role": "QA",
        "focus": "Sifat nazorati, test stsenariylari",
        "checklist": [
            "Test stsenariylari yozildi",
            "Regressiya tekshirildi",
            "Xatolik qadamlari aniq korsatildi",
        ],
    },
    Specialty.DESIGNER: {
        "icon": "( o )",
        "color": "#f85149",
        "skills": ["Figma", "UI kit", "Prototip", "User flow"],
        "task_types": ["FEATURE", "DOCS", "RESEARCH"],
        "default_project_role": "DEVELOPER",
        "focus": "Interfeys dizayni va foydalanuvchi oqimi",
        "checklist": [
            "Figma havolasi biriktirildi",
            "Mobil va desktop variantlari bor",
            "Komponentlar dizayn tizimiga mos",
        ],
    },
    Specialty.DATA: {
        "icon": "|||",
        "color": "#56d364",
        "skills": ["Python", "Pandas", "SQL", "ML", "ETL"],
        "task_types": ["RESEARCH", "FEATURE", "CHORE"],
        "default_project_role": "DEVELOPER",
        "focus": "Ma'lumotlar tahlili va modellar",
        "checklist": [
            "Ma'lumot manbasi korsatilgan",
            "Natija takrorlanadigan (notebook/script)",
            "Metrikalar yozildi",
        ],
    },
    Specialty.ANALYST: {
        "icon": "= =",
        "color": "#79c0ff",
        "skills": ["Talablar tahlili", "SQL", "BPMN", "Hujjatlashtirish"],
        "task_types": ["DOCS", "RESEARCH", "CHORE"],
        "default_project_role": "VIEWER",
        "focus": "Talablar, biznes jarayonlar, hujjatlar",
        "checklist": [
            "Talab aniq va olchanadigan",
            "Manfaatdor tomon tasdiqladi",
            "Chegaraviy holatlar yozildi",
        ],
    },
    Specialty.SECURITY: {
        "icon": "[!]",
        "color": "#ff7b72",
        "skills": ["OWASP", "Pentest", "Audit", "Shifrlash"],
        "task_types": ["BUG", "RESEARCH", "CHORE"],
        "default_project_role": "DEVELOPER",
        "focus": "Xavfsizlik auditi va zaifliklar",
        "checklist": [
            "Zaiflik darajasi baholandi",
            "Tuzatish yoli korsatildi",
            "Qayta tekshiruv otkazildi",
        ],
    },
    Specialty.PM: {
        "icon": "= >",
        "color": "#8b949e",
        "skills": ["Rejalashtirish", "Agile", "Risk boshqaruvi", "Kommunikatsiya"],
        "task_types": ["CHORE", "DOCS", "RESEARCH"],
        "default_project_role": "MANAGER",
        "focus": "Rejalashtirish, jamoa va muddatlar",
        "checklist": [
            "Vazifa aniq tavsiflangan",
            "Ijrochi va muddat belgilangan",
            "Bogliqliklar korsatilgan",
        ],
    },
}


def profile_for(specialty):
    """Mutaxassislik uchun xususiyatlar to'plami."""
    return SPECIALTY_PROFILE.get(specialty, {
        "icon": "*", "color": "#8b949e", "skills": [], "task_types": [],
        "default_project_role": "DEVELOPER", "focus": "", "checklist": [],
    })


def specialty_catalog():
    """Frontend uchun to'liq katalog."""
    out = []
    for value, label in Specialty.choices:
        p = profile_for(value)
        out.append({
            "value": value,
            "label": label,
            "icon": p["icon"],
            "color": p["color"],
            "skills": p["skills"],
            "task_types": p["task_types"],
            "default_project_role": p["default_project_role"],
            "focus": p["focus"],
            "checklist": p["checklist"],
        })
    return out
