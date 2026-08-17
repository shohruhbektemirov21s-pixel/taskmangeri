"""WebSocket ulanishini «tirik» holatda ushlab turish qoidalari.

MUAMMO. Ruxsat va token faqat ULANISH paytida tekshirilardi. WebSocket esa
soatlab ochiq turadi, ya'ni:

  * loyihadan chiqarilgan odamning ochiq soketi suhbat xabarlarini olishda
    davom etardi - uzilgunga qadar;
  * access token muddati tugagach ham soket ishlayverardi.

YECHIM. Har bir chiqayotgan xabardan oldin arzon tekshiruv o'tkaziladi:
tokenning muddati o'tganmi va (agar consumer aytsa) ruxsat hali joyidami.
Bazaga har xabarda borilmaydi - javob `RECHECK_SECONDS` davomida eslab
turiladi, ya'ni eng yomon holatda ochiq qolish oynasi shu qadar bo'ladi.
"""
import time

RECHECK_SECONDS = 30

# Yopilish kodlari - mijoz nima bo'lganini shu orqali biladi.
CLOSE_EXPIRED = 4401     # token muddati tugadi (qayta ulanish kerak)
CLOSE_FORBIDDEN = 4403   # ruxsat olib qo'yildi


class LiveAuthMixin:
    """Ulanish davomida token va ruxsatni qayta tekshiradi.

    Consumer `recheck_allowed()` ni yozsa, u vaqti-vaqti bilan chaqiriladi
    (bazaga borishi mumkin). Yozmasa - faqat token muddati qaraladi.
    """

    _checked_at = 0.0
    _allowed = True

    async def still_live(self):
        """Xabar yuborish mumkinmi. Mumkin bo'lmasa soket yopiladi."""
        exp = self.scope.get("token_exp") or 0
        now = time.time()
        if exp and now >= exp:
            await self.close(code=CLOSE_EXPIRED)
            return False

        if now - self._checked_at < RECHECK_SECONDS:
            return self._allowed

        self._checked_at = now
        check = getattr(self, "recheck_allowed", None)
        self._allowed = True if check is None else bool(await check())
        if not self._allowed:
            await self.close(code=CLOSE_FORBIDDEN)
        return self._allowed

    async def fanout(self, message):
        """Guruhga kelgan xabarni mijozga uzatadi - tekshiruvdan keyin."""
        if not await self.still_live():
            return
        await self.send_json(message["payload"])
