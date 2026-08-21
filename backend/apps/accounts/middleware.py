"""So'nggi faollik: kim tizimdan haqiqatan foydalanayotgani.

`User.last_seen` modelda ham, `django-admin/` da ham bor edi, lekin unga
HECH QAYERDA yozilmasdi - hamma foydalanuvchida bo'sh turardi. Ya'ni
«kim kirmayapti, kim tashlab ketdi» degan savolga tizim javob bera
olmasdi: buni bilvosita, tarix lentasidagi hodisalar soni bo'yicha
taxmin qilish kerak edi.

NEGA JAVOB TOMONIDA. Ilova JWT bilan ishlaydi, ya'ni `request.user` ni
`AuthenticationMiddleware` emas, DRF ning autentifikatsiya qatlami
aniqlaydi - u esa KO'RINISH ichida ishlaydi. So'rov kirib kelayotganda
foydalanuvchi hali anonim, javob qaytayotganda esa DRF uni asosiy
so'rovga ham yozib qo'ygan bo'ladi (`Request.user` setteri
`self._request.user` ga ham tegadi). Shuning uchun tekshiruv
`get_response` dan KEYIN turadi - oldinda tursa hamma JWT so'rovi
anonim ko'rinardi va maydon yana bo'sh qolardi.

NEGA HAR SO'ROVDA YOZILMAYDI. Bitta sahifa o'nlab so'rov yuboradi;
har biriga `UPDATE` yozish Db2 ga bekorchi yuk bo'lardi. Yozuv keshdagi
qulf bilan besh daqiqada bir martaga tushiriladi - «oxirgi faollik»
uchun bu aniqlik yetarli.
"""
import logging

from django.core.cache import cache
from django.utils import timezone

from .models import User

logger = logging.getLogger(__name__)

# Bitta odam uchun ikki yozuv orasidagi eng qisqa oraliq (soniya).
WRITE_EVERY = 5 * 60


class LastSeenMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        self.touch(request)
        return response

    @staticmethod
    def touch(request):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated or not user.pk:
            return
        try:
            # `add` - kalit yo'q bo'lsagina qo'yadi, ya'ni oraliqdagi
            # birinchi so'rov. Qolganlari darrov qaytadi.
            if not cache.add("last-seen:{}".format(user.pk), 1, WRITE_EVERY):
                return
            now = timezone.now()
            # `update()`, `save()` emas: birgina ustun yoziladi, signal
            # chaqirilmaydi va bir vaqtda kelgan boshqa so'rov yozgan
            # maydonlar ustidan o'chirib yuborilmaydi.
            User.objects.filter(pk=user.pk).update(last_seen=now)
            user.last_seen = now
        except Exception:
            # Faollik belgisi so'rovni yiqitmasin: kesh yoki baza javob
            # bermasa ham sahifa ochilaverishi kerak.
            logger.exception("last_seen yozilmadi")
