from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.core.queries import int_param, object_or_404
from apps.activity.models import Activity
from apps.activity.services import log, log_field_changes
from apps.core.permissions import ProjectAccess, check_access, visible_projects_q
from apps.core.uploads import check_uploads
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many, send_to_users
from apps.projects.models import Project, ProjectRole

from .models import (BOARD_COLUMNS, Attachment, Label, Review, ReviewVerdict, Submission,
                     SubmissionEdit, Task, TaskAssignment, TaskStatus, WorkLog)
from .serializers import (AttachmentSerializer, BoardTaskSerializer, BulkTaskSerializer,
                          CommentSerializer, LabelSerializer, ReviewSerializer,
                          StatusChangeSerializer, SubmissionSerializer,
                          TaskDetailSerializer, TaskSerializer, WorkLogSerializer)

User = get_user_model()


def send_to_review(task, access):
    """Ish topshirilgach vazifani TEKSHIRUVGA olib boradi.

    Dasturchi TODO yoki "Tuzatish kerak" holatidan togridan-togri tekshiruvga
    ota olmaydi - avval "Jarayonda" bolishi kerak. Foydalanuvchi bu ichki
    qoidani bilishi shart emas: ishni topshirdi - demak tugatgan. Shuning uchun
    oraliq qadamni ozimiz bosib otamiz.

    True qaytsa - vazifa tekshiruvga otdi.
    """
    if task.status in (TaskStatus.IN_REVIEW, TaskStatus.DONE, TaskStatus.CANCELLED):
        return False

    if TaskStatus.IN_REVIEW not in task.allowed_transitions(access):
        if TaskStatus.IN_PROGRESS not in task.allowed_transitions(access):
            return False
        task.apply_status(TaskStatus.IN_PROGRESS)

    if TaskStatus.IN_REVIEW not in task.allowed_transitions(access):
        return False

    task.apply_status(TaskStatus.IN_REVIEW)
    task.review_round += 1
    task.save()
    return True


def move_status(task, new_status, access, actor, blocked_reason=""):
    """Vazifa holatini QOIDA bilan o'zgartiradi: ruxsat, vaqt belgilari, tarix, signal.

    Yagona yo'l: `/status/` ham, vazifani tahrirlash (`PATCH`) ham shu yerdan
    o'tadi. Ilgari tahrirlash `serializer.save()` bilan holatni to'g'ridan-to'g'ri
    yozardi - natijada «Bajarildi» ni qo'lda qo'yish taqiqi chetlab o'tilardi,
    `completed_at` bo'sh qolardi (hisobotlar buzilardi) va o'zgarish tarixda
    umuman ko'rinmasdi.

    Holat o'zgarmasa (bir xil status yuborilsa) hech narsa qilinmaydi va `False`
    qaytadi - doskada element o'z ustuniga qaytarilsa xato chiqmasin.
    """
    if new_status == task.status:
        return False

    if new_status not in task.allowed_transitions(access):
        if new_status == TaskStatus.DONE:
            # Vazifa qaysi bosqichda turganiga qarab odamga NIMA QILISH
            # kerakligini aytamiz. Ilgari ikki holatga bitta xabar chiqardi va
            # tekshiruvchi "nega men tasdiqlay olmayapman?" degan savolda
            # qolardi.
            if task.status == TaskStatus.IN_REVIEW:
                raise PermissionDenied(
                    "Bu vazifa tekshiruvda. Uni loyiha menejeri yoki admin "
                    "tasdiqlaydi.")
            raise PermissionDenied(
                "«Bajarildi» ni qolda qoyib bolmaydi: avval ijrochi ishni "
                "topshiradi, keyin menejer yoki admin tekshirib tasdiqlaydi.")
        raise PermissionDenied(
            "Siz bu vazifani '{}' holatiga ota olmaysiz.".format(TaskStatus(new_status).label))

    old_label = task.get_status_display()
    task.apply_status(new_status)
    if new_status == TaskStatus.BLOCKED:
        task.blocked_reason = (blocked_reason or "")[:250]
    if new_status == TaskStatus.IN_REVIEW:
        task.review_round += 1
    task.save()

    verb = "task.status"
    if new_status == TaskStatus.IN_REVIEW:
        verb = "task.submitted"
    elif new_status == TaskStatus.BLOCKED:
        verb = "task.blocked"
    log(actor=actor, verb=verb, task=task,
        summary="{}: {} -> {}".format(task.code, old_label, task.get_status_display()),
        detail=task.blocked_reason,
        meta={"from": old_label, "to": task.get_status_display()})
    live_task(task, "status", actor,
              status_display=task.get_status_display(), previous=old_label)
    return True


def apply_review(task, review, actor):
    """Tekshiruv yozuvi yaratilgandan keyingi hamma narsa: holat, tarix, xabar, signal.

    Ikki joydan chaqiriladi - tekshiruv formasi (`/review/`) va doskada
    kartani «Bajarildi» ustuniga tashlash (`/status/`). Shu tufayli ikkovi
    bir xil iz qoldiradi: `Review` yozuvi, `completed_at`, tarix va
    ijrochiga bildirishnoma.
    """
    if review.verdict == ReviewVerdict.APPROVED:
        task.apply_status(TaskStatus.DONE)
        verb = "task.approved"
    elif review.verdict == ReviewVerdict.CHANGES_REQUESTED:
        task.apply_status(TaskStatus.CHANGES_REQUESTED)
        verb = "task.changes_requested"
    else:
        task.apply_status(TaskStatus.CANCELLED)
        verb = "task.rejected"
    task.save()

    log(actor=actor, verb=verb, task=task,
        summary="{} - {} ({}-aylana)".format(task.code, review.get_verdict_display(),
                                             review.round_no),
        detail=review.comment[:1000],
        meta={"verdict": review.verdict, "round": review.round_no})

    # Natijani birinchi bo'lib ishni qilgan odam bilishi kerak.
    notify_many(task.assignee_list, NotificationKind.TASK_DECIDED,
                title="{} - {}".format(task.code, review.get_verdict_display()),
                body=(review.comment[:150] or task.title[:150]),
                url="/vazifa/{}".format(task.pk), actor=actor,
                meta={"task": task.pk, "verdict": review.verdict})
    live_task(task, "review", actor,
              verdict=review.verdict, status_display=task.get_status_display())
    return review


def project_people(project, roles=None):
    """Loyihaning faol a'zolari (kerak bo'lsa faqat kerakli rollari)."""
    qs = project.memberships.filter(is_active=True).select_related("user")
    if roles:
        qs = qs.filter(role__in=roles)
    return [m.user for m in qs]


def task_watchers(task):
    """Vazifa taqdiri qiziqadigan odamlar: ijrochilar, tekshiruvchi va muallif."""
    people = list(task.assignee_list)
    if task.reviewer_id:
        people.append(task.reviewer)
    if task.created_by_id:
        people.append(task.created_by)
    return people


def live_task(task, action, actor=None, **extra):
    """Loyiha a'zolarining ochiq sahifalariga "vazifa o'zgardi" signali.

    Bildirishnomadan farqi: bazaga yozilmaydi, qo'ng'iroqni chalmaydi. Doska,
    vazifalar ro'yxati va vazifa sahifasi shu signalni eshitib o'zini
    jimgina yangilaydi - odam F5 bosib o'tirmaydi.
    """
    payload = {
        "event": "task.update",
        "action": action,
        "project": task.project_id,
        "task": task.pk,
        "code": task.code,
        "status": task.status,
        "actor": getattr(actor, "pk", None),
    }
    payload.update(extra)
    send_to_users(project_people(task.project), payload)


def sync_assignees(task, user_ids, actor):
    """Ijrochilar ro'yxatini yangilaydi va tarixga yozadi.

    Faqat LOYIHA A'ZOSINI biriktirib bo'ladi. Ilgari `user_ids` dagi har qanday
    id qabul qilinardi: loyihaga aloqasi yo'q odamga vazifa kodi va sarlavhasi
    bilan bildirishnoma ketar, vazifa esa uning "mening ishim" ro'yxatida
    paydo bo'lardi. `bulk` da bu qoida ilgaridan bor edi - endi ikkovi bir xil.

    Jamoada yo'q id lar jimgina tashlab yuborilmaydi: ular `skipped` bo'lib
    qaytadi, chaqiruvchi kerak bo'lsa foydalanuvchiga aytadi.
    """
    wanted = set(user_ids or [])
    members = set(task.project.memberships.filter(is_active=True)
                  .values_list("user_id", flat=True))
    skipped = sorted(wanted - members)
    wanted &= members
    current = {a.user_id: a for a in task.assignments.select_related("user")}
    added, removed = [], []

    for uid in wanted:
        a = current.get(uid)
        if a is None:
            user = User.objects.filter(pk=uid).first()
            if not user:
                continue
            TaskAssignment.objects.create(task=task, user=user, assigned_by=actor)
            added.append(user)
        elif not a.is_active:
            a.is_active = True
            a.unassigned_at = None
            a.assigned_by = actor
            a.save(update_fields=["is_active", "unassigned_at", "assigned_by"])
            added.append(a.user)

    from django.utils import timezone

    for uid, a in current.items():
        if uid not in wanted and a.is_active:
            a.is_active = False
            a.unassigned_at = timezone.now()
            a.save(update_fields=["is_active", "unassigned_at"])
            removed.append(a.user)

    if added:
        log(actor=actor, verb="task.assigned", task=task,
            summary="{}: {} biriktirildi".format(task.code,
                                                 ", ".join(u.full_name for u in added)))
        # Ish tekkanini odam darrov bilsin - navbatdagi kirishini kutmasin.
        notify_many(added, NotificationKind.TASK_ASSIGNED,
                    title="{} sizga biriktirildi".format(task.code),
                    body=task.title[:150],
                    url="/vazifa/{}".format(task.pk), actor=actor,
                    meta={"task": task.pk, "project": task.project_id})
    if removed:
        log(actor=actor, verb="task.unassigned", task=task,
            summary="{}: {} olib tashlandi".format(task.code,
                                                   ", ".join(u.full_name for u in removed)))
    return added, removed, skipped


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    search_fields = ["title", "description", "acceptance_criteria"]
    ordering_fields = ["priority", "due_date", "created_at", "updated_at", "position"]
    ordering = ["-priority", "due_date", "-id"]

    # ------------------------------------------------------------ queryset
    def get_queryset(self):
        user = self.request.user
        qs = (Task.objects.for_display()
              # O'chirilgan loyihaning vazifalari hech qayerda ko'rinmaydi
              # (yozuvlar bazada qoladi).
              .filter(project__deleted_at__isnull=True))

        if not user.is_platform_admin:
            # Ko'rish doirasi `ProjectAccess.can_view` bilan bir xil qoidadan
            # keladi: a'zo bo'lgan loyihalar + o'z ish maydonidagi ochiqlar.
            qs = qs.filter(visible_projects_q(user, "project__"))

        # Raqamli filtrlar `int_param` dan o'tadi: yaroqsiz qiymat ("abc")
        # so'rov bajarilayotganda ValueError bilan 500 bermasin - 400 qaytsin.
        p = self.request.query_params
        if p.get("project"):
            qs = qs.filter(project_id=int_param(p["project"], "project"))
        if p.get("status"):
            qs = qs.filter(status__in=p["status"].split(","))
        if p.get("task_type"):
            qs = qs.filter(task_type=p["task_type"])
        if p.get("priority"):
            qs = qs.filter(priority=int_param(p["priority"], "priority"))
        if p.get("assignee"):
            who = user.pk if p["assignee"] == "me" else int_param(p["assignee"], "assignee")
            qs = qs.filter(Exists(TaskAssignment.objects.filter(
                task=OuterRef("pk"), user_id=who, is_active=True)))
        if p.get("open") == "1":
            qs = qs.exclude(status__in=[TaskStatus.DONE, TaskStatus.CANCELLED])
        if p.get("overdue") == "1":
            from django.utils import timezone
            qs = qs.filter(due_date__lt=timezone.now()).exclude(
                status__in=[TaskStatus.DONE, TaskStatus.CANCELLED])
        return qs

    def get_serializer_class(self):
        if self.action in ("retrieve", "create", "update", "partial_update"):
            return TaskDetailSerializer
        return TaskSerializer

    # Vazifa sahifasi bir so'rovda izohlar, ish jurnali, tekshiruvlar, fayllar
    # va ostki vazifalarni qaytaradi. Ular oldindan yuklanmasa har bir yozuv
    # uchun muallif alohida so'roviga aylanardi (10 izoh + 10 worklog = +20).
    DETAIL_PREFETCH = ("assignments__user", "labels", "comments__author",
                       "worklogs__user", "reviews__reviewer",
                       "attachments__uploaded_by", "subtasks__project",
                       "subtasks__assignments__user")

    def get_object(self):
        task = object_or_404(
            Task.objects.select_related("project", "project__workspace",
                                        "created_by", "reviewer")
            .prefetch_related(*self.DETAIL_PREFETCH),
            pk=self.kwargs["pk"])
        need = "view" if self.request.method in ("GET", "HEAD", "OPTIONS") else "work"
        check_access(self.request.user, task.project, need)
        return task

    # ------------------------------------------------------------ yaratish
    def create(self, request, *args, **kwargs):
        project = object_or_404(Project, pk=request.data.get("project"))
        check_access(request.user, project, "task")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignee_ids = serializer.validated_data.pop("assignee_ids", [])
        label_ids = serializer.validated_data.pop("label_ids", [])
        reviewer_id = serializer.validated_data.pop("reviewer_id", None)
        # Ota vazifa boshqa loyihadan bo'lmasin: aks holda vazifa bir loyihada
        # turib, ikkinchisining ichki tuzilishini ochib qo'yardi.
        parent = serializer.validated_data.get("parent")
        if parent is not None and parent.project_id != project.pk:
            raise ValidationError({"parent": "Ota vazifa shu loyihadan bolishi kerak."})
        # «Bajarildi» - tekshiruvning natijasi, boshlang'ich holat emas.
        if serializer.validated_data.get("status") == TaskStatus.DONE:
            raise ValidationError({
                "status": "Yangi vazifa «Bajarildi» holatida yaratilmaydi - "
                          "ish topshirilib, tekshiruvdan otishi kerak."})

        task = serializer.save(project=project, created_by=request.user,
                               reviewer_id=reviewer_id)
        if label_ids:
            task.labels.set(Label.objects.filter(project=project, id__in=label_ids))
        _, _, skipped = sync_assignees(task, assignee_ids, request.user)

        log(actor=request.user, verb="task.created", task=task,
            summary="{} yaratildi: {}".format(task.code, task.title),
            detail=task.description[:500],
            meta={"priority": task.priority_label, "type": task.get_task_type_display(),
                  "specialty": task.required_specialty or None})
        live_task(task, "created", request.user, title=task.title[:120])
        payload = TaskDetailSerializer(task, context=self.get_serializer_context()).data
        # Jamoada yo'q odamlar biriktirilmadi - interfeys buni aytib qo'ysin.
        payload["skipped_assignees"] = skipped
        return Response(payload, status=201)

    def update(self, request, *args, **kwargs):
        task = self.get_object()
        access = ProjectAccess(request.user, task.project)
        # Vazifa mazmunini (sarlavha, tavsif, muddat, ijrochi) faqat menejer
        # va admin o'zgartiradi. Ijrochi ishni bajaradi: holatni suradi, izoh
        # yozadi, fayl biriktiradi va ishni topshiradi - lekin topshiriqning
        # o'zini qayta yozmaydi.
        if not access.can_create_task:
            raise PermissionDenied(
                "Vazifani faqat loyiha menejeri yoki admin ozgartira oladi.")

        tracked = ["title", "description", "acceptance_criteria", "priority", "due_date",
                   "task_type", "estimate_hours", "branch_name", "pr_url"]
        before = {f: getattr(task, f) for f in tracked}

        serializer = self.get_serializer(task, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        assignee_ids = serializer.validated_data.pop("assignee_ids", None)
        label_ids = serializer.validated_data.pop("label_ids", None)
        reviewer_id = serializer.validated_data.pop("reviewer_id", "skip")
        if reviewer_id != "skip":
            serializer.validated_data["reviewer_id"] = reviewer_id
        # Ota vazifa boshqa loyihadan bo'lmasin: aks holda vazifa bir loyihada
        # turib, ikkinchisining ichki tuzilishini ochib qo'yardi.
        parent = serializer.validated_data.get("parent")
        if parent is not None and parent.project_id != task.project_id:
            raise ValidationError({"parent": "Ota vazifa shu loyihadan bolishi kerak."})
        # Holat shu yerda yozilmaydi: u `move_status` dan o'tadi - aks holda
        # «Bajarildi» taqig'i, `completed_at` va tarix yozuvi chetlab o'tilardi.
        new_status = serializer.validated_data.pop("status", None)

        obj = serializer.save()
        if new_status:
            move_status(obj, new_status, access, request.user,
                        blocked_reason=request.data.get("blocked_reason", ""))
        if label_ids is not None:
            obj.labels.set(Label.objects.filter(project=obj.project, id__in=label_ids))
        skipped = []
        if assignee_ids is not None:
            _, _, skipped = sync_assignees(obj, assignee_ids, request.user)

        changes = {}
        for f in tracked:
            if before[f] != getattr(obj, f):
                changes[str(obj._meta.get_field(f).verbose_name)] = (before[f], getattr(obj, f))
        log_field_changes(request.user, obj, changes)
        live_task(obj, "updated", request.user, title=obj.title[:120])

        payload = TaskDetailSerializer(obj, context=self.get_serializer_context()).data
        payload["skipped_assignees"] = skipped
        return Response(payload)

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        check_access(request.user, task.project, "manage")
        log(actor=request.user, verb="task.deleted", project=task.project,
            summary="{} ochirildi: {}".format(task.code, task.title))
        live_task(task, "deleted", request.user)
        # Yumshoq o'chirish: yozuv bazada qoladi. Ilgari `delete()` edi va u
        # bilan birga izohlar, ish jurnali, tekshiruvlar va biriktirilgan
        # fayllar ham CASCADE bilan yo'q bo'lardi - bitta tugma butun
        # vazifaning tarixini o'chirib yuborardi.
        task.soft_delete(request.user)
        return Response(status=204)

    # ------------------------------------------------------------ ommaviy yaratish
    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk(self, request):
        project = object_or_404(Project, pk=request.data.get("project"))
        check_access(request.user, project, "task")

        s = BulkTaskSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        # Bitta vazifada bo'lgani kabi: «Bajarildi» - tekshiruvning natijasi.
        if d["status"] == TaskStatus.DONE:
            raise ValidationError({
                "status": "Vazifalar «Bajarildi» holatida yaratilmaydi."})

        members = list(project.memberships.filter(is_active=True).select_related("user"))
        member_ids = {m.user_id for m in members}
        assignees = [uid for uid in d["assignee_ids"] if uid in member_ids]

        required = (d.get("required_specialty") or "").strip()
        skipped = []
        if required and d.get("match_by_specialty"):
            spec_ok = {m.user_id for m in members if m.user.specialty == required}
            skipped = [uid for uid in assignees if uid not in spec_ok]
            assignees = [uid for uid in assignees if uid in spec_ok]
            if not assignees:
                # hech kim tanlanmagan bolsa loyihadagi mos mutaxassislarga beramiz
                assignees = list(spec_ok)

        created = []
        # Kimga qaysi vazifa tekkani - xabarni odam boshiga bir marta yuborish uchun.
        given = {}
        # Yuzta vazifa - yoki hammasi, yoki hech biri. O'rtada uzilsa yarim
        # ro'yxat qolib, foydalanuvchi qolganini qo'lda qidirib yurardi.
        # Bildirishnoma va tarix ataylab tashqarida: ular yozuvlar bazaga
        # tushgandan keyin ketadi.
        with transaction.atomic():
            for idx, title in enumerate(d["titles"]):
                task = Task(project=project, title=title[:250], created_by=request.user,
                            priority=d["priority"], task_type=d["task_type"],
                            status=d["status"], due_date=d.get("due_date"),
                            required_specialty=required,
                            acceptance_criteria=d.get("acceptance_criteria", ""))
                task.save()
                if assignees:
                    targets = ([assignees[idx % len(assignees)]] if d["distribute"]
                               else assignees)
                    for uid in targets:
                        TaskAssignment.objects.create(task=task, user_id=uid,
                                                      assigned_by=request.user)
                        given.setdefault(uid, []).append(task.code)
                created.append(task)

        log(actor=request.user, verb="task.created", project=project,
            summary="{} ta task yaratildi".format(len(created)),
            detail="\n".join("{} - {}".format(t.code, t.title) for t in created[:50]),
            meta={"count": len(created), "codes": [t.code for t in created[:50]]})

        # 20 ta vazifa 20 ta qo'ng'iroq bo'lmasin: har kimga bitta yig'ma xabar.
        by_id = {m.user_id: m.user for m in members}
        for uid, codes in given.items():
            notify(by_id.get(uid), NotificationKind.TASK_ASSIGNED,
                   title="{} ta yangi vazifa biriktirildi".format(len(codes)),
                   body="{} - {}".format(project.name, ", ".join(codes[:10])),
                   url="/mening-ishim", actor=request.user,
                   meta={"project": project.pk, "codes": codes[:20]})
        if created:
            live_task(created[0], "created", request.user, count=len(created))
        return Response({
            "created": len(created),
            "skipped_assignees": skipped,
            "tasks": TaskSerializer(created, many=True,
                                    context=self.get_serializer_context()).data,
        }, status=201)

    # ------------------------------------------------------------ doska
    @action(detail=False, methods=["get"])
    def board(self, request):
        project_id = request.query_params.get("project")
        if not project_id:
            raise ValidationError({"project": "Loyiha ID kerak."})
        project = object_or_404(Project, pk=project_id)
        access = check_access(request.user, project, "view")

        qs = self.filter_queryset(self.get_queryset()).filter(project=project)
        # Ruxsat butun doska uchun bitta - kartalarga kontekst orqali beriladi.
        ctx = self.get_serializer_context()
        ctx["board_access"] = access
        columns = []
        for status in BOARD_COLUMNS:
            items = BoardTaskSerializer(
                qs.filter(status=status).order_by("position", "-priority", "id"),
                many=True, context=ctx).data
            columns.append({
                "status": status,
                "label": TaskStatus(status).label,
                # Sanoq serializatsiya qilingan ro'yxatdan olinadi: har ustun
                # uchun alohida `COUNT` yuborish shart emas (oltita so'rov).
                "count": len(items),
                "tasks": items,
            })
        return Response({"columns": columns, "access": access.as_dict()})

    # ------------------------------------------------------------ holat
    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        task = self.get_object()
        access = check_access(request.user, task.project, "work")

        s = StatusChangeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        new_status = s.validated_data["status"]

        # Doskada kartani «Bajarildi» ustuniga tashlash - tekshiruvchi uchun
        # TASDIQLASH degani. Ilgari bu har doim rad etilardi: doskada ustun
        # ko'rinib turar, lekin unga tashlab bo'lmasdi - hatto menejer ham
        # xato xabarini olardi va tasdiqlash uchun boshqa sahifaga o'tishi
        # kerak edi. Qoida buzilmaydi: ish avval topshirilgan bo'lishi
        # (`IN_REVIEW`) va odamning tekshirish huquqi bo'lishi shart.
        if (new_status == TaskStatus.DONE and task.status == TaskStatus.IN_REVIEW
                and access.can_review):
            review = Review.objects.create(
                task=task, reviewer=request.user, verdict=ReviewVerdict.APPROVED,
                comment=s.validated_data.get("blocked_reason", "")[:1000],
                round_no=max(task.review_round, 1))
            apply_review(task, review, request.user)
        else:
            move_status(task, new_status, access, request.user,
                        blocked_reason=s.validated_data.get("blocked_reason", ""))

        return Response(TaskDetailSerializer(task,
                                             context=self.get_serializer_context()).data)

    # ------------------------------------------------------------ boshqa odamga otkazish
    @action(detail=True, methods=["post"], url_path="reassign")
    def reassign(self, request, pk=None):
        """Vazifani BOSHQA odamga otkazish.

        Ijrochini vazifa formasidan ham ozgartirsa boladi, lekin u yerda
        butun topshiriq qaytadan ochiladi va royxatdan belgi olib tashlanadi -
        odam ketib qolgan yoki ish boshqasiga oshgan paytda bu uzoq yol.
        Bu yerda esa bitta amal: kimga va nega. Ish BITTA odamga otadi -
        "otkazish" degani shu, shuning uchun qolgan ijrochilar olib
        tashlanadi (yozuvlari ochmaydi, faqat nofaol boladi - kim qachon
        ishlagani tarixda qolsin).

        Ruxsat vazifani tahrirlash bilan bir xil: loyiha menejeri, loyiha
        admini va tizim admini. Ijrochining ozi ishni boshqaga otkaza olmaydi.
        """
        from django.utils import timezone

        task = self.get_object()
        access = ProjectAccess(request.user, task.project)
        if not access.can_create_task:
            raise PermissionDenied(
                "Vazifani boshqa odamga faqat loyiha menejeri yoki admin otkaza oladi.")
        # Tugagan ishni otkazishning ma'nosi yoq: yangi odam uchun bu ish emas,
        # eskisining tarixi esa buziladi.
        if task.status in (TaskStatus.DONE, TaskStatus.CANCELLED):
            raise ValidationError(
                {"detail": "Yakunlangan yoki bekor qilingan vazifani otkazib bolmaydi."})

        user_id = int_param(request.data.get("user_id"), "user_id")
        note = (request.data.get("note") or "").strip()[:250]

        # Faqat loyiha a'zosiga - `sync_assignees` dagi qoida bilan bir xil.
        member = (task.project.memberships.filter(is_active=True, user_id=user_id)
                  .select_related("user").first())
        if member is None:
            raise ValidationError({"user_id": "Vazifani faqat loyiha a'zosiga otkazish mumkin."})
        target = member.user

        active = list(task.assignments.filter(is_active=True).select_related("user"))
        if [a.user_id for a in active] == [target.id]:
            raise ValidationError({"user_id": "Vazifa allaqachon shu odamda."})

        now = timezone.now()
        for a in active:
            if a.user_id == target.id:
                continue
            a.is_active = False
            a.unassigned_at = now
            a.save(update_fields=["is_active", "unassigned_at"])

        # Odam ilgari shu vazifada bolgan bolsa yangi qator ochilmaydi -
        # eskisi qayta faollashadi (bir odam bir vazifada ikki marta turmasin).
        current = task.assignments.filter(user=target).first()
        if current is None:
            TaskAssignment.objects.create(task=task, user=target, assigned_by=request.user)
        else:
            current.is_active = True
            current.unassigned_at = None
            current.assigned_by = request.user
            current.save(update_fields=["is_active", "unassigned_at", "assigned_by"])

        gone = [a.user for a in active if a.user_id != target.id]
        detail = []
        if gone:
            detail.append("Oldingi ijrochi: " + ", ".join(u.full_name for u in gone))
        if note:
            detail.append("Sabab: " + note)
        log(actor=request.user, verb="task.reassigned", task=task,
            summary="{}: {} ga otkazildi".format(task.code, target.full_name),
            detail=" · ".join(detail),
            meta={"task": task.pk, "to": target.pk, "from": [u.pk for u in gone]})

        # Yangi ijrochi uchun bu - yangi ish, shuning uchun odatdagi
        # "biriktirildi" turi: ish royxatlari va filtrlar ozgarmaydi.
        notify_many([target], NotificationKind.TASK_ASSIGNED,
                    title="{} sizga otkazildi".format(task.code),
                    body=(note or task.title)[:150],
                    url="/vazifa/{}".format(task.pk), actor=request.user,
                    meta={"task": task.pk, "project": task.project_id})
        # Ishdan chiqqan odam ham bilsin - aks holda u eski topshiriq ustida
        # ishlab yuraveradi.
        if gone:
            notify_many(gone, NotificationKind.TASK_REASSIGNED,
                        title="{} boshqa ijrochiga otkazildi".format(task.code),
                        body="Endi ustida {} ishlaydi".format(target.full_name),
                        url="/vazifa/{}".format(task.pk), actor=request.user,
                        meta={"task": task.pk, "project": task.project_id})

        live_task(task, "updated", request.user, title=task.title[:120])
        task.refresh_from_db()
        return Response(TaskDetailSerializer(
            task, context=self.get_serializer_context()).data)

    # ------------------------------------------------------------ izoh / ish jurnali
    @action(detail=True, methods=["post"], url_path="comments")
    def add_comment(self, request, pk=None):
        task = self.get_object()
        s = CommentSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        comment = s.save(task=task, author=request.user)
        log(actor=request.user, verb="task.commented", task=task,
            summary="{} ga izoh qoldirdi".format(task.code), detail=comment.body[:500])
        # `collapse=True`: ketma-ket izohlar bitta qo'ng'iroqqa yig'iladi.
        notify_many(task_watchers(task), NotificationKind.TASK_COMMENT,
                    title="{} ga yangi izoh".format(task.code),
                    body="{}: {}".format(request.user.full_name, comment.body[:120]),
                    url="/vazifa/{}".format(task.pk), actor=request.user,
                    meta={"task": task.pk}, collapse=True)
        live_task(task, "comment", request.user)
        return Response(CommentSerializer(comment, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"], url_path="worklogs")
    def add_worklog(self, request, pk=None):
        task = self.get_object()
        check_access(request.user, task.project, "work")
        s = WorkLogSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        wl = s.save(task=task, user=request.user)
        log(actor=request.user, verb="task.worklog", task=task,
            summary="{}: {} soat ish qayd etildi".format(task.code, wl.hours),
            detail=wl.note[:500], meta={"hours": str(wl.hours)})
        return Response(WorkLogSerializer(wl, context={"request": request}).data, status=201)

    # ------------------------------------------------------------ ish topshirish
    @action(detail=True, methods=["get", "post"], url_path="submissions",
            parser_classes=[MultiPartParser, FormParser, JSONParser])
    def submissions(self, request, pk=None):
        """Dasturchi ishni yakunlab hisobot topshiradi.

        GET  - topshiriqlar (tahrir tarixi bilan);
        POST - yangi topshiriq: matn + ixtiyoriy fayllar. Odatiy holda vazifa
               darrov TEKSHIRUVGA otadi va menejer tasdiqlamaguncha shunday
               turadi (`submit_for_review=0` bolsa - otmaydi).
        """
        task = self.get_object()

        if request.method == "GET":
            check_access(request.user, task.project, "view")
            qs = (task.submissions.select_related("author")
                  .prefetch_related("files", "edits__editor"))
            return Response(SubmissionSerializer(qs, many=True,
                                                 context=self.get_serializer_context()).data)

        access = check_access(request.user, task.project, "work")

        ser = SubmissionSerializer(data={"text": request.data.get("text", "")},
                                   context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        submission = ser.save(task=task, author=request.user,
                              round_no=max(task.review_round, 1))

        uploads = check_uploads(
            request.FILES.getlist("file") or request.FILES.getlist("files"))
        for f in uploads:
            fs = AttachmentSerializer(data={"file": f, "description": "Ish topshirigi"},
                                      context={"request": request})
            fs.is_valid(raise_exception=True)
            fs.save(task=task, submission=submission, uploaded_by=request.user,
                    content_type=(getattr(f, "content_type", "") or "")[:120])

        moved = False
        old_label = task.get_status_display()
        wants_review = str(request.data.get("submit_for_review", "1")).lower() not in ("0", "false")
        if wants_review:
            moved = send_to_review(task, access)
            if moved:
                submission.round_no = task.review_round
                submission.save(update_fields=["round_no"])
                log(actor=request.user, verb="task.submitted", task=task,
                    summary="{}: {} -> {}".format(task.code, old_label,
                                                  task.get_status_display()),
                    meta={"from": old_label, "to": task.get_status_display()})

        log(actor=request.user, verb="task.handover", task=task,
            summary="{}: ish topshirildi ({}-aylana)".format(task.code, submission.round_no),
            detail=submission.text[:1000],
            meta={"files": len(uploads), "moved_to_review": moved})

        # Tekshiruvchilarga xabar: kimdir ishni topshirdi
        reviewers = [m.user for m in task.project.memberships.filter(
            is_active=True, role__in=[ProjectRole.MANAGER, ProjectRole.ADMIN])
            .select_related("user")]
        notify_many(reviewers, NotificationKind.TASK_REVIEW,
                    title="{} tekshiruvga topshirildi".format(task.code),
                    body="{}: {}".format(request.user.full_name, task.title[:100]),
                    url="/vazifa/{}".format(task.pk), actor=request.user)

        live_task(task, "submitted", request.user)

        payload = SubmissionSerializer(
            submission, context=self.get_serializer_context()).data
        # Interfeys rostini aytsin: vazifa tekshiruvga otdimi yoki yoq.
        payload["moved_to_review"] = moved
        payload["task_status"] = task.status
        payload["task_status_display"] = task.get_status_display()
        return Response(payload, status=201)

    @action(detail=True, methods=["patch", "delete"],
            url_path="submissions/(?P<submission_id>[^/.]+)")
    def submission_detail(self, request, pk=None, submission_id=None):
        """Topshiriqni tahrirlash yoki ochirish.

        Tahrirlanganda eski matn `SubmissionEdit` da qoladi - tarix yoqolmaydi.
        """
        task = self.get_object()
        submission = object_or_404(Submission, pk=submission_id, task=task)
        access = ProjectAccess(request.user, task.project)
        mine = submission.author_id == request.user.pk
        if not (mine or access.can_manage):
            raise PermissionDenied("Faqat topshirgan odam yoki menejer ozgartira oladi.")

        if request.method == "DELETE":
            # Fayl topshiriq bilan birga yoq bolib ketmasin. `Attachment.submission`
            # CASCADE - shuning uchun oldin bogni uzamiz: fayllar vazifada qoladi
            # va "Fayllar" bolimidan ochilaveradi. Skrinshot, log, patch - bular
            # qilingan ishning isboti, matn ochirilgani bilan ular kerak boladi.
            kept = list(submission.files.values_list("original_name", flat=True))
            log(actor=request.user, verb="task.handover_deleted", task=task,
                summary="{}: ish topshirigi ochirildi".format(task.code),
                detail="{}{}".format(
                    submission.text[:500],
                    "\n\nFayllar vazifada qoldirildi: " + ", ".join(kept) if kept else ""))
            # Yumshoq o'chirish. Fayllarni topshiriqdan uzish ham endi shart
            # emas: CASCADE ishlamaydi, ya'ni ular joyida qoladi va topshiriq
            # tiklansa butun holicha qaytadi.
            submission.soft_delete(request.user)
            return Response(status=204)

        new_text = (request.data.get("text") or "").strip()
        if len(new_text) < 3:
            raise ValidationError({"text": "Qilingan ishni qisqacha bolsa ham yozing."})

        old_text = submission.text
        if new_text != old_text:
            SubmissionEdit.objects.create(submission=submission, editor=request.user,
                                          old_text=old_text, new_text=new_text)
            submission.text = new_text
            submission.edited_count += 1
            submission.save(update_fields=["text", "edited_count", "updated_at"])
            # Tahrirda fayllarga tegilmaydi - eskisi joyida qoladi. Tarixda
            # ham korinib tursin: ish qaysi fayl bilan topshirilgani muhim.
            names = list(submission.files.values_list("original_name", flat=True))
            log(actor=request.user, verb="task.handover_edited", task=task,
                summary="{}: ish topshirigi tahrirlandi".format(task.code),
                detail="Eski: {}\nYangi: {}{}".format(
                    old_text[:400], new_text[:400],
                    "\nFayllar (ozgarmadi): " + ", ".join(names) if names else ""))

        submission.refresh_from_db()
        return Response(SubmissionSerializer(
            submission, context=self.get_serializer_context()).data)

    # ------------------------------------------------------------ fayllar
    @action(detail=True, methods=["get", "post"], url_path="attachments",
            parser_classes=[MultiPartParser, FormParser, JSONParser])
    def attachments(self, request, pk=None):
        """GET - fayllar royxati; POST - fayl biriktirish (multipart/form-data)."""
        task = self.get_object()

        if request.method == "GET":
            qs = task.attachments.select_related("uploaded_by")
            return Response(AttachmentSerializer(qs, many=True,
                                                 context={"request": request}).data)

        check_access(request.user, task.project, "work")
        files = request.FILES.getlist("file") or request.FILES.getlist("files")
        if not files:
            raise ValidationError({"file": "Fayl tanlanmagan."})
        check_uploads(files)

        created = []
        for f in files:
            s = AttachmentSerializer(
                data={"file": f, "description": request.data.get("description", "")},
                context={"request": request})
            s.is_valid(raise_exception=True)
            created.append(s.save(task=task, uploaded_by=request.user,
                                  content_type=(getattr(f, "content_type", "") or "")[:120]))

        log(actor=request.user, verb="task.attachment", task=task,
            summary="{}: {} ta fayl biriktirildi".format(task.code, len(created)),
            detail=", ".join(a.original_name for a in created),
            meta={"files": [{"name": a.original_name, "size": a.size} for a in created]})

        return Response(AttachmentSerializer(created, many=True,
                                             context={"request": request}).data, status=201)

    @action(detail=True, methods=["delete"], url_path="attachments/(?P<attachment_id>[^/.]+)")
    def delete_attachment(self, request, pk=None, attachment_id=None):
        task = self.get_object()
        att = object_or_404(Attachment, pk=attachment_id, task=task)
        access = ProjectAccess(request.user, task.project)
        if not (access.can_manage or att.uploaded_by_id == request.user.id):
            raise PermissionDenied("Faylni faqat yuklagan odam yoki menejer ochira oladi.")
        name = att.original_name
        # Fayl diskdan ham, bazadan ham yo'q qilinmaydi: yozuv `deleted_at`
        # bilan belgilanadi va admin panelidan qaytarib bo'ladi. Ilgari
        # baytlar ham o'chirilardi - xato bosilgan tugmani tiklab bo'lmasdi.
        att.soft_delete(request.user)
        log(actor=request.user, verb="task.attachment_deleted", task=task,
            summary="{}: fayl ochirildi ({})".format(task.code, name))
        return Response(status=204)

    # ------------------------------------------------------------ tekshiruv
    @action(detail=False, methods=["get"], url_path="review-queue")
    def review_queue(self, request):
        user = request.user
        qs = Task.objects.filter(status=TaskStatus.IN_REVIEW,
                                 project__deleted_at__isnull=True)
        if not user.is_platform_admin:
            from apps.projects.models import ProjectMember
            managed = Project.objects.filter(
                Q(manager=user) | Exists(ProjectMember.objects.filter(
                    project=OuterRef("pk"), user=user, is_active=True,
                    role__in=[ProjectRole.MANAGER, ProjectRole.ADMIN])))
            qs = qs.filter(project__in=managed)
        qs = (qs.select_related("project", "created_by")
              .prefetch_related("assignments__user", "labels").order_by("submitted_at"))
        return Response(TaskSerializer(qs, many=True,
                                       context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="review")
    def review(self, request, pk=None):
        task = self.get_object()
        check_access(request.user, task.project, "review")

        s = ReviewSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        review = s.save(task=task, reviewer=request.user,
                        round_no=max(task.review_round, 1))
        apply_review(task, review, request.user)

        return Response(TaskDetailSerializer(task,
                                             context=self.get_serializer_context()).data)

    @action(detail=False, methods=["get"], url_path="suggest-assignees")
    def suggest_assignees(self, request):
        """?project=<id>&specialty=<code> - vazifaga mos azolarni tavsiya qiladi."""
        from apps.accounts.serializers import UserBriefSerializer

        project = object_or_404(Project, pk=request.query_params.get("project"))
        check_access(request.user, project, "view")
        specialty = request.query_params.get("specialty") or ""

        members = project.memberships.filter(is_active=True).select_related("user")
        # Ochiq vazifalar soni HAMMA a'zo uchun bitta guruhlangan so'rovda
        # olinadi. Ilgari tsikl ichida `count()` chaqirilardi va so'rovlar soni
        # jamoa kattaligiga ko'payib ketardi (14 a'zo -> 18 so'rov).
        open_counts = dict(
            TaskAssignment.objects
            .filter(task__project=project, is_active=True,
                    task__status__in=[TaskStatus.TODO, TaskStatus.IN_PROGRESS,
                                      TaskStatus.CHANGES_REQUESTED])
            .values_list("user_id").annotate(n=Count("id")))
        rows = []
        for m in members:
            if specialty and m.user.specialty != specialty:
                continue
            open_count = open_counts.get(m.user_id, 0)
            rows.append({
                "user": UserBriefSerializer(m.user, context={"request": request}).data,
                "role": m.role,
                "open_tasks": open_count,
                "matches": (not specialty) or m.user.specialty == specialty,
            })
        rows.sort(key=lambda r: (not r["matches"], r["open_tasks"]))
        return Response(rows)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        from apps.activity.serializers import ActivitySerializer

        task = self.get_object()
        qs = Activity.objects.filter(task=task).select_related("actor").order_by("-created_at")
        return Response(ActivitySerializer(qs, many=True, context={"request": request}).data)


class LabelViewSet(viewsets.ModelViewSet):
    """Loyiha teglari.

    Teg loyihaga tegishli, ya'ni uni ko'rish ham, o'zgartirish ham loyiha
    ruxsatiga bog'lanadi. Ilgari tekshiruv faqat YARATISHDA bor edi: ro'yxat
    har qanday `?project=<id>` uchun ochiq qaytar, tahrirlash va o'chirish esa
    loyihaga aloqasi yo'q odamga ham ishlar edi.
    """

    serializer_class = LabelSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Label.objects.select_related("project").filter(
            project__deleted_at__isnull=True)
        # Ko'rish doirasi vazifalar bilan bir xil: admin hammasini, qolganlar
        # o'zi a'zo bo'lgan loyihalarni.
        if not user.is_platform_admin:
            from apps.projects.models import ProjectMember

            qs = qs.filter(Exists(ProjectMember.objects.filter(
                project=OuterRef("project_id"), user=user, is_active=True)))
        project = self.request.query_params.get("project")
        if project:
            # Yaroqsiz qiymat 500 emas, 400 bersin.
            qs = qs.filter(project_id=int_param(project, "project"))
        return qs

    def get_object(self):
        """Teg jamoaga ko'rinadi, lekin uni faqat boshqaruvchi o'zgartiradi."""
        label = object_or_404(self.get_queryset(), pk=self.kwargs["pk"])
        need = "view" if self.request.method in ("GET", "HEAD", "OPTIONS") else "manage"
        check_access(self.request.user, label.project, need)
        return label

    def perform_create(self, serializer):
        project = object_or_404(Project, pk=self.request.data.get("project"))
        check_access(self.request.user, project, "manage")
        serializer.save(project=project)
