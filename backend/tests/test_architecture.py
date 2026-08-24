"""Qatlamlar qoidasi - izohda emas, TESTDA.

NEGA BU FAYL BOR. Loyihaning arxitekturasi CLAUDE.md da va modul
izohlarida yozilgan, lekin uni hech nima tekshirmasdi. Natijasi ikki xil:

  1. Qoida jimgina buzilardi. Tozalash buyrug'i `apps/core` ga qo'yildi va
     u beshta domen ilovasining modelini import qilardi - ya'ni «core da
     domen importi bo'lmasin» degan BIRINCHI qoida buzilgan edi, hech
     narsa qizarmasdi.
  2. Import HALQASI o'sib borardi. Uni funksiya ichiga yashirish
     («kechiktirilgan import») ishlaydi, lekin bog'liqlikni yo'q qilmaydi -
     faqat ko'rinmas qiladi. Shu sabab test kechiktirilganini ham sanaydi.

BU TEST NIMANI VA'DA QILMAYDI. U mavjud halqani YO'QOTMAYDI:
`projects ↔ tasks` va shunga o'xshash bog'lanishlar haqiqiy domen
bog'liqligi (loyihaning bajarilishi vazifalardan hisoblanadi, vazifa esa
loyihaga tegishli) va ularni ajratish alohida, katta ish. Test qiladigan
narsa - HOLATNI QOTIRISH: bugungi halqalar ro'yxati yozib qo'yilgan va
YANGISI qo'shilsa test qizaradi.

Ro'yxatni "tuzatish" uchun unga yangi juftlik qo'shmang - avval halqaning
o'zini yo'qotishga harakat qiling. Halqa kamaysa, ro'yxatdan o'chiring.
"""
import ast
import os
import re

from django.test import SimpleTestCase

APPS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "apps")

# Bu ilovalar domen emas: ular hech kimga bog'liq bo'lmasligi kerak.
BOTTOM = {"core", "uitexts"}

# Eng ustki qavat: hammani biladi, uni esa hech kim import qilmaydi.
TOP = {"panel"}

# BUGUNGI HALQALAR. Ular haqiqiy domen bog'liqliklari va bu test ularni
# yo'qotmaydi - faqat YANGISI qo'shilmasligini kafolatlaydi.
#
# Har biri nima uchun borligini bilib turing:
#   accounts <-> activity   - tarix aktyorni ko'rsatadi, profil tarixni
#   accounts <-> projects   - ruxsatlar `projects` da, foydalanuvchi `accounts` da
#   accounts <-> tasks      - «kimda qancha ish bor» ikki tomondan so'raladi
#   activity <-> projects   - tarix loyihaga bog'lanadi, loyiha tarix yozadi
#   activity <-> tasks      - o'sha sabab, vazifa uchun
#   projects <-> tasks      - loyihaning bajarilishi vazifalardan hisoblanadi
#   projects <-> workspaces - maydon loyihalarni o'chiradi, loyiha maydonni biladi
#
# Ro'yxatda YO'Q, chunki bir tomonlama: `chat -> projects/workspaces`,
# `notifications -> telegram`, `panel -> hamma`. Ular halqa emas.
KNOWN_CYCLES = {
    ("accounts", "activity"),
    ("accounts", "projects"),
    ("accounts", "tasks"),
    ("accounts", "workspaces"),
    ("activity", "projects"),
    ("activity", "tasks"),
    ("projects", "tasks"),
    ("projects", "workspaces"),
}

IMPORT_RE = re.compile(r"^(\s*)from apps\.([a-z_]+)")


def app_names():
    return sorted(d for d in os.listdir(APPS_DIR)
                  if os.path.isdir(os.path.join(APPS_DIR, d)) and not d.startswith("_"))


def imports_of(app):
    """`(modul_darajasida, kechiktirilgan)` - ikkala to'plam ham ilova nomlari."""
    top, deferred = set(), set()
    root_dir = os.path.join(APPS_DIR, app)
    for root, _, files in os.walk(root_dir):
        if "migrations" in root or "__pycache__" in root:
            continue
        for name in files:
            if not name.endswith(".py"):
                continue
            path = os.path.join(root, name)
            with open(path, encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    m = IMPORT_RE.match(line)
                    if not m:
                        continue
                    indent, target = m.group(1), m.group(2)
                    if target == app:
                        continue
                    (deferred if indent else top).add(target)
    return top, deferred


def full_graph():
    graph = {}
    for app in app_names():
        top, deferred = imports_of(app)
        graph[app] = top | deferred
    return graph


class LayerTest(SimpleTestCase):
    """Qatlam tartibi buzilmasin."""

    def test_core_domen_ilovalarini_bilmaydi(self):
        """ENG MUHIM QOIDA. `apps.core` eng pastki qavat.

        U Db2 adapteri, umumiy maydonlar, yumshoq o'chirish va so'rov
        yordamchilarini beradi - ya'ni domen ilovalari UNGA tayanadi.
        Teskarisi bo'lsa halqa yopiladi va uni sindirish uchun funksiya
        ichiga yashiringan importlar kerak bo'ladi.
        """
        for app in sorted(BOTTOM):
            top, deferred = imports_of(app)
            domain = (top | deferred) - BOTTOM
            self.assertEqual(
                domain, set(),
                "`apps.{}` domen ilovasini import qilyapti: {}. "
                "Bunday kodning joyi `apps.panel` - u hammani biladi va "
                "uni hech kim import qilmaydi.".format(app, ", ".join(sorted(domain))))

    def test_panelga_hech_kim_boglanmaydi(self):
        """`apps.panel` eng ustki qavat - unga bog'lanish halqa yasaydi."""
        for app in app_names():
            if app in TOP:
                continue
            top, deferred = imports_of(app)
            for upper in TOP:
                self.assertNotIn(
                    upper, top | deferred,
                    "`apps.{}` `apps.{}` ni import qilyapti - ustki qavatga "
                    "bog'lanib bo'lmaydi.".format(app, upper))

    def test_yangi_halqa_qoshilmagan(self):
        """Bugungi halqalar ro'yxati - yangisi qo'shilsa test qizaradi."""
        graph = full_graph()
        found = set()
        for a, targets in graph.items():
            for b in targets:
                if a in graph.get(b, set()):
                    found.add(tuple(sorted((a, b))))

        new = found - KNOWN_CYCLES
        self.assertEqual(
            new, set(),
            "YANGI import halqasi: {}. Bog'liqlikni funksiya ichiga "
            "yashirish uni yo'qotmaydi - qaysi tomon kimga tayanishi "
            "kerakligini hal qiling.".format(
                ", ".join("{} <-> {}".format(*pair) for pair in sorted(new))))

    def test_royxatda_eskirgan_halqa_yoq(self):
        """Halqa yo'qolgan bo'lsa ro'yxatdan ham o'chirilsin.

        Aks holda ro'yxat vaqt o'tib «ruxsat etilganlar» emas, «qachondir
        shunday bo'lgan» ro'yxatiga aylanadi va hech kim unga ishonmaydi.
        """
        graph = full_graph()
        found = set()
        for a, targets in graph.items():
            for b in targets:
                if a in graph.get(b, set()):
                    found.add(tuple(sorted((a, b))))

        stale = KNOWN_CYCLES - found
        self.assertEqual(
            stale, set(),
            "Bu halqalar endi yo'q - `KNOWN_CYCLES` dan o'chiring: {}".format(
                ", ".join("{} <-> {}".format(*pair) for pair in sorted(stale))))


class DeferredImportTest(SimpleTestCase):
    """Funksiya ichidagi importlar KO'PAYMASIN.

    Ular halqani sindirish uchun kerak bo'ladi, lekin bog'liqlikni
    yo'qotmaydi - faqat ko'rinmas qiladi. Soni o'sib borsa, arxitektura
    jimgina chalkashadi.
    """

    # Bugungi holat. TUSHIRING, ko'tarmang.
    LIMIT = 92

    def count(self):
        total = 0
        for app in app_names():
            root_dir = os.path.join(APPS_DIR, app)
            for root, _, files in os.walk(root_dir):
                if "migrations" in root or "__pycache__" in root:
                    continue
                for name in files:
                    if not name.endswith(".py"):
                        continue
                    with open(os.path.join(root, name), encoding="utf-8",
                              errors="ignore") as fh:
                        for line in fh:
                            m = IMPORT_RE.match(line)
                            if m and m.group(1) and m.group(2) != app:
                                total += 1
        return total

    def test_soni_oshmagan(self):
        found = self.count()
        self.assertLessEqual(
            found, self.LIMIT,
            "Funksiya ichidagi importlar {} ta bo'ldi (chegara {}). "
            "Yangi bog'liqlikni yashirish o'rniga qatlam tartibini "
            "to'g'rilang.".format(found, self.LIMIT))

    def test_chegara_haqiqatga_yaqin(self):
        """Qarz kamaysa chegara ham tushsin - aks holda u ma'nosiz bo'ladi."""
        found = self.count()
        self.assertGreater(
            found, self.LIMIT - 12,
            "Importlar {} ta - chegara {} juda bo'sh qolgan, uni "
            "tushiring.".format(found, self.LIMIT))


class ModuleShapeTest(SimpleTestCase):
    """Loyihaning yozilmagan konvensiyalari."""

    def test_api_viewsda_emas_apida(self):
        """«API view'lar `api.py` da yoziladi, `views.py` da emas.»"""
        stray = []
        for app in app_names():
            path = os.path.join(APPS_DIR, app, "views.py")
            if os.path.exists(path) and os.path.getsize(path) > 200:
                stray.append(app)
        self.assertEqual(stray, [], "`views.py` da kod bor: {}".format(stray))

    def test_modellar_ast_bilan_oqiladi(self):
        """Har bir `models.py` sintaktik jihatdan butun bo'lsin.

        Arzon, lekin foydali: bu test `SimpleTestCase` va bazasiz
        yuguradi, ya'ni sintaktik xatoni Db2 ko'tarilishidan OLDIN
        aytadi.
        """
        for app in app_names():
            path = os.path.join(APPS_DIR, app, "models.py")
            if not os.path.exists(path):
                continue
            with open(path, encoding="utf-8") as fh:
                ast.parse(fh.read(), filename=path)
