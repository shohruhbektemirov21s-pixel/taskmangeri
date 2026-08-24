"""WebSocket uchun bir martalik, qisqa umrli chipta.

MUAMMO. Brauzer WebSocket ochayotganda `Authorization` sarlavhasini
qo'sha olmaydi, shuning uchun token so'rov SATRIDA ketardi:

    ws://host/ws/notifications/?token=<12 soatlik JWT>

So'rov satri esa hamma joyda yoziladi: nginx access-log, teskari proksi,
APM va brauzer tarixi. Ya'ni 12 soat amal qiladigan, butun API ga
yaradigan token jurnallarda qolib ketardi - va u yerdan uni o'chirish
hech kimning odatiy ishi emas.

YECHIM. Manzilga TOKEN emas, CHIPTA qo'yiladi:

    POST /api/ws-ticket/   ->  {"ticket": "...", "expires_in": 30}
    ws://host/ws/notifications/?ticket=<chipta>

Chipta uchta narsa bilan tokendan farq qiladi:

  * 30 SONIYA yashaydi - ulanish uchun yetadi, jurnalda topilganda esa
    allaqachon o'lik bo'ladi;
  * FAQAT WebSocket uchun - u bilan API ga murojaat qilib bo'lmaydi,
    boshqa tuz (`salt`) ishlatiladi;
  * ichida faqat foydalanuvchi IDsi va asl tokenning tugash vaqti bor -
    ya'ni chiptani ushlab olgan odam undan tokenni tiklay olmaydi.

ESKI YO'L QOLADI. `?token=` hali ham qabul qilinadi: mijoz yangilanmagan
bo'lsa ulanish uzilmasin. Frontend chiptaga o'tgach uni olib tashlash
mumkin (`config/ws_auth.py`).

NEGA JADVAL EMAS. Chipta 30 soniya yashaydi va bir martalik bo'lishi
SHART emas - u shu qadar qisqaki, qayta ishlatish oynasi amalda yo'q.
Imzo o'zi kim uchun va qachon berilganini olib yuradi
(`django.core.signing`), ya'ni saqlash va tozalash kerak emas.
"""
from django.core import signing

SALT = "teamflow.ws.ticket"

# Chipta necha soniya yashaydi. Ulanish uchun 30 soniya bemalol yetadi:
# mijoz chiptani olgach darrov soket ochadi.
TTL = 30


def issue(user, token_exp=0):
    """Foydalanuvchi uchun chipta yasaydi.

    `token_exp` - ASL access tokenning tugash vaqti. U chiptaga
    ko'chiriladi, chunki soketni tirik ushlab turish shunga qarab
    to'xtatiladi (`LiveAuthMixin`): chipta qisqa bo'lgani bilan ulanish
    tokenning umridan uzoq yashamasligi kerak.
    """
    return signing.dumps({"u": user.pk, "e": int(token_exp or 0)}, salt=SALT)


def read(ticket):
    """Chiptadan `(user_id, token_exp)`. Yaroqsiz bo'lsa `(None, 0)`."""
    if not ticket:
        return None, 0
    try:
        data = signing.loads(ticket, salt=SALT, max_age=TTL)
    except signing.BadSignature:
        # Muddati o'tgani ham, buzib yozilgani ham - bir xil javob.
        return None, 0
    return data.get("u"), int(data.get("e") or 0)
