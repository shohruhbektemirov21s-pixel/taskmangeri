from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.accounts.serializers import UserBriefSerializer
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many

from .models import ChatMessage
from .serializers import ChatMessageSerializer
from .services import broadcast, can_read, members_of

User = get_user_model()


def resolve_room(params):
    """`?project=<id>`, `?workspace=<slug>` yoki `?direct=<user_id>` dan xonani aniqlaydi."""
    from apps.projects.models import Project
    from apps.workspaces.models import Workspace

    if params.get("direct"):
        partner = User.objects.filter(pk=params["direct"], is_active=True).first()
        if not partner:
            raise ValidationError({"direct": "Foydalanuvchi topilmadi."})
        return {"project": None, "workspace": None, "partner": partner}
    if params.get("project"):
        project = Project.objects.filter(pk=params["project"]).first()
        if not project:
            raise ValidationError({"project": "Loyiha topilmadi."})
        return {"project": project, "workspace": None, "partner": None}
    if params.get("workspace"):
        workspace = Workspace.objects.filter(slug=params["workspace"]).first()
        if not workspace:
            raise ValidationError({"workspace": "Ish maydoni topilmadi."})
        return {"project": None, "workspace": workspace, "partner": None}
    raise ValidationError({"detail": "project, workspace yoki direct ko'rsating."})


class ChatMessageViewSet(mixins.ListModelMixin,
                         mixins.CreateModelMixin,
                         mixins.DestroyModelMixin,
                         viewsets.GenericViewSet):
    """Xona tarixi va yangi xabar.

    Yuborish REST orqali (ruxsat va tekshiruvlar shu yerda), yetkazish esa
    WebSocket orqali - shunda xabar hammaga bir zumda ko'rinadi.
    """

    serializer_class = ChatMessageSerializer
    throttle_scope = "chat"

    def get_throttles(self):
        # Odam qidirish alohida, yumshoqroq cheklovda.
        if self.action == "people":
            self.throttle_scope = "search"
        else:
            self.throttle_scope = "chat"
        return super().get_throttles()

    def get_queryset(self):
        me = self.request.user

        # O'chirishda xona parametri kelmaydi - va kelishi ham shart emas.
        # Odam faqat o'z xabarini o'chira oladi, admin esa hammasini.
        if self.action in ("destroy", "retrieve"):
            qs = ChatMessage.objects.select_related("author", "recipient")
            if getattr(me, "is_platform_admin", False):
                return qs
            return qs.filter(author=me)

        room = resolve_room(self.request.query_params)
        if not can_read(me, **room):
            raise PermissionDenied("Bu suhbatni ko'rish huquqi yo'q.")

        qs = ChatMessage.objects.select_related("author", "recipient")
        if room["partner"] is not None:
            partner = room["partner"]
            qs = qs.filter(Q(author=me, recipient=partner) | Q(author=partner, recipient=me))
        elif room["project"] is not None:
            qs = qs.filter(project=room["project"], recipient__isnull=True)
        else:
            qs = qs.filter(workspace=room["workspace"], recipient__isnull=True)
        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        me = self.request.user
        project = serializer.validated_data.get("project")
        workspace = serializer.validated_data.get("workspace")
        recipient_id = serializer.validated_data.pop("recipient_id", None)

        partner = None
        if recipient_id:
            partner = User.objects.filter(pk=recipient_id, is_active=True).first()
            if not partner:
                raise ValidationError({"recipient_id": "Foydalanuvchi topilmadi."})
            if partner.pk == me.pk:
                raise ValidationError({"recipient_id": "O'zingizga yoza olmaysiz."})

        if not can_read(me, project=project, workspace=workspace, partner=partner):
            raise PermissionDenied("Bu suhbatga yozish huquqi yo'q.")

        message = serializer.save(author=me, recipient=partner)
        broadcast(message)

        if partner is not None:
            notify(partner, NotificationKind.CHAT_DIRECT,
                   title="{} sizga yozdi".format(me.full_name),
                   body=message.text[:160],
                   url="/xabarlar/{}".format(me.pk), actor=me, collapse=True)
            return

        target = project or workspace
        url = ("/loyiha/{}/chat".format(project.pk) if project
               else "/ish-maydoni/{}/chat".format(workspace.slug))
        # collapse=True: bir xonadan kelgan o'nlab xabar bitta qo'ng'iroq bo'lib turadi.
        notify_many(
            [u for u in members_of(project=project, workspace=workspace) if u.pk != me.pk],
            NotificationKind.CHAT_MESSAGE,
            title="{} suhbatida yangi xabar".format(getattr(target, "name", "")),
            body="{}: {}".format(me.full_name, message.text[:120]),
            url=url, actor=me, collapse=True,
        )

    def perform_destroy(self, instance):
        is_admin = getattr(self.request.user, "is_platform_admin", False)
        if instance.author_id != self.request.user.pk and not is_admin:
            raise PermissionDenied("Faqat o'z xabaringizni o'chira olasiz.")
        instance.delete()

    # ------------------------------------------------------------ shaxsiy
    @action(detail=False, methods=["get"])
    def conversations(self, request):
        """Shaxsiy yozishmalar ro'yxati: suhbatdosh + oxirgi xabar."""
        me = request.user
        recent = (ChatMessage.objects
                  .filter(recipient__isnull=False)
                  .filter(Q(author=me) | Q(recipient=me))
                  .select_related("author", "recipient")
                  .order_by("-created_at")[:400])

        out = []
        seen = set()
        for m in recent:
            partner = m.partner_for(me)
            if not partner or partner.pk in seen:
                continue
            seen.add(partner.pk)
            out.append({
                "partner": UserBriefSerializer(partner).data,
                "last_message": m.text[:160],
                "last_at": m.created_at,
                "outgoing": m.author_id == me.pk,
            })
        return Response(out)

    @action(detail=False, methods=["get"], url_path="people")
    def people(self, request):
        """Kimga yozish mumkin - email yoki ism bo'yicha qidiruv.

        `?q=` bo'sh bo'lsa oxirgi qo'shilganlardan bir nechtasi qaytadi,
        shunda foydalanuvchi bo'sh ekranga qaramaydi.
        """
        q = (request.query_params.get("q") or "").strip()
        qs = User.objects.filter(is_active=True).exclude(pk=request.user.pk)
        if q:
            qs = qs.filter(Q(full_name__icontains=q) | Q(email__icontains=q))
        qs = qs.order_by("full_name")[:25]
        return Response(UserBriefSerializer(qs, many=True).data)
