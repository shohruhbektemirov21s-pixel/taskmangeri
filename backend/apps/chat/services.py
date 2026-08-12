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
    if not user or not user.is_authenticated:
        return False
    if partner is not None:
        # Shaxsiy yozishma: har bir ro'yxatdan o'tgan xodim bilan yozishish mumkin,
        # lekin o'ziga o'zi emas.
        return partner.is_active and partner.pk != user.pk
    if getattr(user, "is_platform_admin", False):
        return True
    if project is not None:
        return project.memberships.filter(user=user, is_active=True).exists()
    if workspace is not None:
        return workspace.memberships.filter(user=user).exists()
    return False


def broadcast(message):
    """Xabarni xona guruhiga uzatadi. Redis yiqilsa ham xabar bazada qoladi."""
    from .serializers import ChatMessageSerializer

    try:
        layer = get_channel_layer()
        if layer is None:
            return False
        async_to_sync(layer.group_send)(
            message.room,
            {"type": "fanout", "payload": {"event": "chat.message",
                                           "message": ChatMessageSerializer(message).data}},
        )
        return True
    except Exception:
        logger.exception("Chat xabarini tarqatib bo'lmadi: %s", message.pk)
        return False
