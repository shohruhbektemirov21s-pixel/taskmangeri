"""Ikki matnni solishtirish - qaysi bo'lagi o'zgargani bilan.

NEGA KERAK. Tahrir tarixi ilgari shunchaki "eski matn" va "yangi matn" ni
ustma-ust ko'rsatardi: ikkovi uzun bo'lsa odam ularni ko'zi bilan
solishtirib chiqishga majbur edi va bitta so'z o'zgargani bilinmasdi.

NIMA QAYTADI. Har bir matn bo'laklarga bo'linadi va o'zgargani belgilanadi:

    {"old": [{"text": "Narx ", "changed": false},
             {"text": "1000", "changed": true},
             {"text": " so'm", "changed": false}],
     "new": [...],
     "has_changes": true}

Interfeys shu belgilangan bo'laklarni ajratib ko'rsatadi - hujjat
solishtirgichlaridagi kabi.

NEGA SO'Z BO'YICHA. Harf bo'yicha solishtirsak natija maydalanib ketadi
("o'zgardi" -> "o'zgarmadi" da beshta alohida bo'lak chiqadi); qator
bo'yicha solishtirsak bitta so'z uchun butun xatboshi qizarib ketadi.
So'z - o'qishga eng qulay o'lcham.

Kutubxona qo'shilmadi: `difflib` Python bilan birga keladi.
"""
import re
from difflib import SequenceMatcher

# So'zlar va ular orasidagi bo'shliq/tinish belgilari alohida bo'lak bo'ladi -
# shunda qayta yig'ilgan matn asl matnga bit-ba-bit teng chiqadi.
_TOKEN = re.compile(r"\w+|\s+|[^\w\s]", re.UNICODE)

# Bitta javob qancha bo'lakdan oshmasin. Juda uzun matnlarda solishtirish
# ham sekinlashadi, ham foydasi qolmaydi - bunday holda butun matn "o'zgargan"
# deb bitta bo'lakda beriladi.
MAX_TOKENS = 4000


def tokenize(text):
    return _TOKEN.findall(text or "")


def _merge(pieces):
    """Yonma-yon turgan bir xil turdagi bo'laklarni bitta qilib qo'yadi.

    Aks holda har bir so'z alohida `<span>` bo'lib chiqardi - ham og'ir,
    ham ko'rinishi titroq.
    """
    out = []
    for text, changed in pieces:
        if out and out[-1]["changed"] == changed:
            out[-1]["text"] += text
        else:
            out.append({"text": text, "changed": changed})
    return out


def word_diff(old_text, new_text):
    """Eski va yangi matnni so'z bo'yicha solishtiradi."""
    old_text = old_text or ""
    new_text = new_text or ""

    if old_text == new_text:
        return {
            "old": [{"text": old_text, "changed": False}] if old_text else [],
            "new": [{"text": new_text, "changed": False}] if new_text else [],
            "has_changes": False,
        }

    a, b = tokenize(old_text), tokenize(new_text)
    if len(a) > MAX_TOKENS or len(b) > MAX_TOKENS:
        return {
            "old": [{"text": old_text, "changed": True}],
            "new": [{"text": new_text, "changed": True}],
            "has_changes": True,
            "truncated": True,
        }

    old_pieces, new_pieces = [], []
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        same = tag == "equal"
        if i1 != i2:
            old_pieces.append(("".join(a[i1:i2]), not same))
        if j1 != j2:
            new_pieces.append(("".join(b[j1:j2]), not same))

    return {
        "old": _merge(old_pieces),
        "new": _merge(new_pieces),
        "has_changes": True,
    }


def field_diff(old_values, new_values, labels=None):
    """Maydonlar bo'yicha solishtirish - fayl nomi, hajmi, izohi va h.k.

    Matn emas, nomlangan qiymatlar to'plami solishtiriladi. Har bir maydon
    uchun eski va yangi qiymat hamda o'zgargan-o'zgarmagani qaytadi:

        [{"key": "original_name", "label": "Fayl nomi",
          "old": "shart.docx", "new": "shart-2.docx", "changed": true}, ...]
    """
    labels = labels or {}
    rows = []
    for key in new_values:
        old = old_values.get(key)
        new = new_values.get(key)
        rows.append({
            "key": key,
            "label": labels.get(key, key),
            "old": "" if old is None else str(old),
            "new": "" if new is None else str(new),
            "changed": old != new,
        })
    return rows
