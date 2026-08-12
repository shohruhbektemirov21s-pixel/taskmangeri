from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(mixins.ListModelMixin,
                          mixins.DestroyModelMixin,
                          viewsets.GenericViewSet):
    """Faqat o'z bildirishnomalari. Yaratish - server tomonidan (services.notify)."""

    serializer_class = NotificationSerializer

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user).select_related("actor")
        if self.request.query_params.get("unread") in ("1", "true"):
            qs = qs.filter(is_read=False)
        kind = self.request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        return qs

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        n = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({"unread": n})

    @action(detail=True, methods=["post"], url_path="read")
    def read(self, request, pk=None):
        obj = self.get_object()
        obj.mark_read()
        return Response(self.get_serializer(obj).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        n = Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({"updated": n})

    @action(detail=False, methods=["post"], url_path="clear")
    def clear(self, request):
        """O'qilganlarini tozalash."""
        n, _ = Notification.objects.filter(recipient=request.user, is_read=True).delete()
        return Response({"deleted": n})
