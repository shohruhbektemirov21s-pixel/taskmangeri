"""Chat xabarini xonadagi barcha ochiq ulanishlarga tarqatish."""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def members_of(*, project=None, workspace=None):
    """Xona a'zolari - bildirishnoma kimga ketishini shu belgilaydi."""
    if project is not None:
        return [m.user for m in project.memberships.filter(is_active=True).select_related("user")]
    if workspace is not None:
        return [m.user for m in workspace.memberships.select_related("user")]
    return []


def can_read(user, *, project=None, workspace=None, partner=None):
    """Shu suhbatni o'qiy oladimi.

    Loyiha va ish maydoni suhbati - JAMOA ichida. Istisno faqat hamma
    loyihada hamma amalni bajaradiganlarda (`runs_everything`: tizim
    admini va boshliq).

    Boshliq ilgari bu yerdan o'tmasdi: loyihani ochar, sozlamasini
    o'zgartirar, ishni tekshira olar edi-yu, o'sha loyihaning suhbati unga
    403 berardi - interfeys esa yorliqni chizib turardi. Global menejer
    ataylab TASHQARIDA qoladi: u begona loyihada kuzatuvchi
    (`sees_all_projects` izohi), jamoaning yozishmasi esa kuzatiladigan
    ma'lumot emas.

    Shaxsiy yozishma bu qoidadan tashqarida - u loyihaga bog'liq emas.
    """
    from apps.projects.permissions import manages_all_projects, runs_everything

    if not user or not user.is_authenticated:
        return False
    if partner is not None:
        # Shaxsiy yozishma: har bir ro'yxatdan o'tgan xodim bilan yozishish mumkin,
        # lekin o'ziga o'zi emas.
        return partner.is_active and partner.pk != user.pk
    if runs_everything(user):
        return True
    if project is not None:
        # Loyihani boshqaradigan odam uning yozishmasida ham bo'ladi.
        # ISH MAYDONI yozishmasi (pastda) tegilmaydi: u maydon a'zolariniki
        # va loyiha boshqaruvi u yerga yetib bormaydi.
        return (manages_all_projects(user)
                or project.memberships.filter(user=user, is_active=True).exists())
    if workspace is not None:
        return workspace.memberships.filter(user=user).exists()
    return False


def _send(message, payload):
    """Xona guruhiga uzatadi. Redis yiqilsa ham asosiy amal buzilmaydi."""
    try:
        layer = get_channel_layer()
        if layer is None:
            return False
        async_to_sync(layer.group_send)(
            message.room, {"type": "fanout", "payload": payload})
        return True
    except Exception:
        logger.exception("Chat signalini tarqatib bo'lmadi: %s", message.pk)
        return False


def broadcast(message):
    """Yangi xabarni xonadagi barcha ochiq ulanishlarga uzatadi."""
    from .serializers import ChatMessageSerializer

    return _send(message, {"event": "chat.message",
                           "message": ChatMessageSerializer(message).data})


def broadcast_delete(message):
    """Xabar o'chirilganini xonaga bildiradi.

    Ilgari o'chirish faqat bazaga tegardi: boshqalarning ochiq turgan
    suhbat oynasida xabar sahifa yangilanmaguncha turaverardi.
    """
    return _send(message, {"event": "chat.deleted", "id": message.pk,
                           "room": message.room})
