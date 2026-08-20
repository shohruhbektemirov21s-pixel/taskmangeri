"""Jamoaga a'zo qo'shish - to'g'ridan-to'g'ri, tasdiqsiz.

Ilgari bu ish `apps.invites` orqali borardi: menejer taklif yuborar, odam
qabul qilgach a'zo bo'lardi. Endi menejer odamni tanlaydi va u **darrov**
a'zo bo'ladi - kutish, tasdiqlash va "javob kutilmoqda" ro'yxati yo'q.

Bitta modul ham loyihaga, ham ish maydoniga xizmat qiladi: ikkovida ham
oqim bir xil (kim qo'sha oladi, kimni qo'shsa bo'ladi, qanday rol bilan),
faqat a'zolik jadvali boshqacha.

Foydalanuvchining o'zi so'rab qo'shilishi (`projects.JoinRequest`) o'z
joyida qoladi - u boshqa yo'nalish: odam so'raydi, menejer hal qiladi.
"""
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from math import ceil

from apps.core.queries import int_param, object_or_404, task_search_q
from apps.accounts.serializers import UserBriefSerializer
from apps.activity.services import log
from apps.projects.services import add_to_project

User = get_user_model()


class AddMemberThrottle(ScopedRateThrottle):
    """Eski `invite` cheklovi (40/soat) shu yerda saqlanadi."""

    scope = "invite"


def _resolve_scope(request):
    """`?project=<id>` yoki `?workspace=<slug>` dan nishonni topadi.

    (project, workspace) qaytaradi - biri to'ldirilgan, ikkinchisi None.
    """
    from apps.projects.models import Project
    from apps.workspaces.models import Workspace

    src = request.query_params if request.method == "GET" else request.data
    project_id = src.get("project")
    workspace_key = src.get("workspace")

    if project_id:
        return object_or_404(
            Project.objects.select_related("workspace"), pk=project_id), None
    if workspace_key:
        return None, object_or_404(Workspace, slug=workspace_key)
    raise ValidationError({"detail": "project yoki workspace korsating."})


def _require_manage(user, project, workspace):
    from apps.projects.permissions import ProjectAccess

    allowed = (ProjectAccess(user, project).can_manage if project is not None
               else workspace.can_manage(user))
    if not allowed:
        raise PermissionDenied("Jamoaga a'zo qoshish huquqi yoq.")


@api_view(["GET"])
def candidates(request):
    """Qo'shish mumkin bo'lgan odamlar: hali a'zo bo'lmaganlar.

    `?project=<id>` yoki `?workspace=<slug>`; ixtiyoriy `?q=`, `?specialty=`.

    Uzun ochiluvchi ro'yxat emas, qidiruv: jamoa kattalashganda ro'yxat
    ishlamay qoladi, qidiruv esa ishlayveradi.
    """
    project, workspace = _resolve_scope(request)
    _require_manage(request.user, project, workspace)

    qs = User.objects.filter(is_active=True).exclude(pk=request.user.pk)
    if project is not None:
        qs = qs.exclude(project_memberships__project=project,
                        project_memberships__is_active=True)
    else:
        qs = qs.exclude(workspace_memberships__workspace=workspace)

    specialty = request.query_params.get("specialty")
    if specialty:
        qs = qs.filter(specialty=specialty)
    q = request.query_params.get("q")
    if q:
        qs = qs.filter(Q(full_name__icontains=q) | Q(email__icontains=q))

    return Response(UserBriefSerializer(qs.order_by("full_name")[:100], many=True).data)



@api_view(["POST"])
@throttle_classes([AddMemberThrottle])
@transaction.atomic
def add_member(request):
    """Odamni jamoaga darrov qo'shadi.

    Tanasi: `{project|workspace, user_id, role}`.
    """
    from apps.workspaces.models import WorkspaceMember, WorkspaceRole

    project, workspace = _resolve_scope(request)
    _require_manage(request.user, project, workspace)

    target = object_or_404(User, pk=request.data.get("user_id"), is_active=True)
    if target.pk == request.user.pk:
        raise ValidationError({"user_id": "Ozingizni qosha olmaysiz."})

    if project is not None:
        member = add_to_project(request.user, project, target, request.data.get("role"))

        from apps.projects.serializers import ProjectMemberSerializer

        return Response(ProjectMemberSerializer(member, context={"request": request}).data,
                        status=201)

    role = request.data.get("role") or WorkspaceRole.MEMBER
    # Egalik qoshish orqali berilmaydi - u faqat maydon egasida.
    if role not in [r for r in WorkspaceRole.values if r != WorkspaceRole.OWNER]:
        raise ValidationError({"role": "Notogri rol."})
    if workspace.memberships.filter(user=target).exists():
        raise ValidationError({"user_id": "Bu odam allaqachon maydonda."})

    member = WorkspaceMember.objects.create(workspace=workspace, user=target, role=role)
    log(actor=request.user, verb="member.added", target=target,
        summary="{} ish maydoniga qoshildi: {}".format(target.full_name, workspace.name),
        detail="Rol: {} | Qoshdi: {}".format(member.get_role_display(),
                                             request.user.full_name))

    from apps.workspaces.serializers import WorkspaceMemberSerializer

    return Response(WorkspaceMemberSerializer(member, context={"request": request}).data,
                    status=201)


# Ro'yxatning bitta sahifasi. Qator baland (ism, loyihalar, sanoqlar va
# foiz chiziqchasi), shuning uchun paneldagidan kamroq: o'ntasi bitta
# ekranga sig'adi va sahifa raqamlari ko'rinib turadi.
WORKLOAD_PAGE_SIZE = 10


def _empty_stats():
    """Bitta ijrochining sanoq kataklari - hammasi noldan boshlanadi.

    Kalitlar `TaskStatus` qiymatlari bilan bir xil: guruhlangan so'rov
    natijasini to'g'ridan-to'g'ri shu yerga yozib ketish uchun.
    """
    from apps.tasks.models import TaskStatus

    cells = {status: 0 for status in TaskStatus.values}
    cells["overdue"] = 0
    return cells


def _summary(cells):
    """Sanoq kataklaridan interfeys ko'rsatadigan xulosa.

    FOIZ MAXRAJI - bekor qilinganidan tashqari hamma ish. Bekor qilingan
    ish na bajarilgan, na kutilyapti: uni maxrajga qo'shsak, ishini
    bajargan odam ham «100% emas» bo'lib turardi.

    Maxraj nol bo'lsa foiz ham nol - «ish yo'q» degani «0% bajarilgan»
    degani emas, lekin interfeys bunday qatorda chiziqchani umuman
    chizmaydi (`total` ni ham beramiz, qaror o'sha yerda).
    """
    from apps.tasks.models import TaskStatus

    total = sum(n for status, n in cells.items()
                if status in TaskStatus.values and status != TaskStatus.CANCELLED)
    done = cells.get(TaskStatus.DONE, 0)
    return {
        "total": total,
        "done": done,
        "todo": cells.get(TaskStatus.TODO, 0),
        "in_progress": cells.get(TaskStatus.IN_PROGRESS, 0),
        "review": cells.get(TaskStatus.IN_REVIEW, 0),
        "changes_requested": cells.get(TaskStatus.CHANGES_REQUESTED, 0),
        "blocked": cells.get(TaskStatus.BLOCKED, 0),
        "cancelled": cells.get(TaskStatus.CANCELLED, 0),
        "overdue": cells.get("overdue", 0),
        "done_percent": round(done * 100 / total) if total else 0,
    }


@api_view(["GET"])
def workload(request):
    """Boshqaruvdagi loyihalarda KIM NIMA QILYAPTI - ijrochilar va ish yuki.

    `?project=<id>` `?search=` `?status=` `?due=<YYYY-MM-DD>` `?period=today|week|month|year`
    `?specialty=` `?page=` (bitta sahifada 10 kishi)

    HAR BIR QATORDA XULOSA (`stats`): nechtasi nazoratda, nechtasining
    muddati o'tgan, nechtasi bajarilgan va bajarilish foizi. U ro'yxatdan
    EMAS, alohida guruhlangan sanoqdan olinadi - ro'yxat standart holatda
    bajarilganini yashiradi, xulosaning ma'nosi esa aynan o'sha raqamda.
    Qolgan kesimlar (loyiha, davr, qidiruv) xulosaga ham tegishli: foiz
    ko'rinib turgan kesimni tasvirlaydi.

    QIDIRUV UCHTA NARSANI qamrab oladi: VAZIFA (nomi, tavsifi, kodi),
    LOYIHA nomi (`task_search_q`) va ODAMNING ismi/familiyasi. Ya'ni
    "«login» degan vazifa kimda?", "«Haftalik rejasi» da kimda nima bor?"
    va "Ergashevda nima bor?" - uchalasi ham bitta maydondan so'raladi.

    Odam ismi ilgari qidirilmasdi va bu xato edi: jamoa o'ttiz kishiga
    yetganda kerakli odamni ro'yxatdan ko'z bilan qidirishga to'g'ri
    kelardi. Ism bo'yicha topilgan odamning HAMMA ishi ko'rsatiladi -
    uning ismi vazifa sarlavhasida uchramaydi, ya'ni vazifa sharti bilan
    kesib tashlasak natija doim bo'sh bo'lardi.

    Ishi topilmagan odam ro'yxatdan tushib qoladi - lekin ISMI mos
    kelgan odam qoladi, ishi bo'lmasa ham: "unda ish yo'q ekan" ham
    javob, aynan o'sha odam so'ralgan bo'lsa.

    NEGA ALOHIDA. Loyiha kartasi faqat raqam beradi ("45 ta ochiq vazifa"),
    menejerga esa odam kerak: kim band, kimda ish yo'q, kimnikida muddat
    o'tib ketgan. Loyiha ichidagi «Jamoa» bo'limi buni BITTA loyiha uchun
    ko'rsatadi, bu yerda esa boshqaruvdagi hammasi bir ro'yxatda.

    KIMGA KO'RINADI. Faqat boshqaradigan loyihalari bo'yicha - shart
    `managed_projects_q` da, ya'ni loyiha sozlamalarini kim o'zgartira
    olsa, jamoasining ish yukini ham o'sha ko'radi. Boshqaruvida loyiha
    bo'lmagan odamga ro'yxat bo'sh qaytadi (xato emas: sahifa buni
    "hali loyiha yo'q" deb ko'rsatadi).
    """
    from apps.projects.permissions import managed_projects_q
    from apps.projects.models import Project, ProjectMember, ProjectRole
    from apps.tasks.models import TaskAssignment, TaskStatus

    user = request.user
    managed = Project.objects.filter(managed_projects_q(user)).order_by("name")
    # Filtr ro'yxati BUTUN boshqaruvdan tuziladi: bitta loyiha tanlanganda
    # ham qolganlari ro'yxatda turadi, aks holda tanlovni ortga qaytarib
    # bo'lmasdi.
    options = [{"id": p.pk, "name": p.name, "key": p.key, "color": p.color}
               for p in managed]

    scope_ids = [o["id"] for o in options]
    project_id = request.query_params.get("project")
    if project_id:
        wanted = int_param(project_id, "project")
        scope_ids = [pk for pk in scope_ids if pk == wanted]

    status = (request.query_params.get("status") or "").strip()
    if status and status not in TaskStatus.values:
        raise ValidationError({"status": "Notogri holat."})

    # Muddat kesimi: aniq sana yoki tayyor davr. Hisob `core.periods.due_span`
    # da - «Vazifalarim» ro'yxati ham o'shani ishlatadi, ya'ni «shu hafta»
    # ikkala sahifada bir xil hafta bo'ladi.
    from apps.core.periods import due_span

    span = due_span(request.query_params.get("due"), request.query_params.get("period"))

    if not scope_ids:
        # Javob shakli har doim bir xil bo'lsin - interfeys `pages` ni
        # tekshiradi va uning yo'qligi «undefined» xatosiga aylanardi.
        return Response({"projects": options, "count": 0, "page": 1, "pages": 1,
                         "page_size": WORKLOAD_PAGE_SIZE, "developers": []})

    # ---- Ijrochilar. Menejer va kuzatuvchi bu ro'yxatda emas: bo'lim
    # "kim ishni bajaryapti" haqida (`ProjectAccess.is_developer` bilan
    # bir xil bo'linish).
    members = (ProjectMember.objects
               .filter(project_id__in=scope_ids, is_active=True, user__is_active=True,
                       role__in=[ProjectRole.DEVELOPER, ProjectRole.QA])
               .select_related("user", "project"))

    specialty = (request.query_params.get("specialty") or "").strip()
    if specialty:
        members = members.filter(user__specialty=specialty)

    people, projects_of = {}, {}
    for m in members:
        people.setdefault(m.user_id, m.user)
        # Bitta odam bir nechta loyihada bo'lishi mumkin - hammasi ko'rinsin.
        projects_of.setdefault(m.user_id, []).append(
            {"id": m.project_id, "name": m.project.name, "key": m.project.key,
             "color": m.project.color, "role": m.get_role_display()})

    # ---- Vazifalar. Bitta so'rov: biriktirish yozuvidan vazifaga va
    # loyihasiga o'tiladi, ya'ni odam boshiga qo'shimcha so'rov yo'q.
    search = (request.query_params.get("search") or "").strip()

    # Ismi qidiruvga mos kelgan odamlar: ularning HAMMA ishi ko'rsatiladi
    # (ism vazifa sarlavhasida uchramaydi - vazifa sharti bilan kesib
    # tashlasak natija doim bo'sh bo'lardi).
    named = set()
    if search and people:
        named = {uid for uid, person in people.items()
                 if search.lower() in (person.full_name or "").lower()}

    tasks_of, stats_of = {}, {}
    if people:
        base = (TaskAssignment.objects
                .filter(is_active=True, user_id__in=list(people),
                        task__project_id__in=scope_ids,
                        task__deleted_at__isnull=True))
        if search:
            # Ish YOKI odam: shart ikkalasini birlashtiradi.
            base = base.filter(task_search_q(search, path="task__")
                               | Q(user_id__in=named))
        if span:
            base = base.filter(task__due_date__gte=span[0], task__due_date__lt=span[1])

        # ---- SANOQLAR: holat filtridan TASHQARI hamma kesim bilan.
        #
        # NEGA ALOHIDA. Ro'yxat standart holatda bajarilganini yashiradi
        # (pastda), ya'ni sanoqni o'sha ro'yxatdan olsak «Bajarilgan» doim
        # nol bo'lardi - aynan ko'rsatilishi kerak bo'lgan raqam. Qolgan
        # kesimlar (loyiha, davr, qidiruv) esa saqlanadi: foiz KO'RINIB
        # TURGAN kesimni tasvirlasin, "umuman hamma vaqtni" emas.
        #
        # Ikkita yengil so'rov: `values(...).annotate(Count)` - guruhlangan
        # sanoq. Db2 CLOB muammosi yo'q, chunki `values()` tanlanadigan
        # ustunlarni ikkitaga qisqartiradi va GROUP BY ga `description`
        # tushmaydi.
        for row in base.values("user_id", "task__status").annotate(n=Count("id")):
            cell = stats_of.setdefault(row["user_id"], _empty_stats())
            cell[row["task__status"]] = row["n"]

        # Muddati o'tgan - `Task.is_overdue` bilan bir xil shart: muddati
        # bor, hali yopilmagan va o'tib ketgan.
        overdue = (base.filter(task__due_date__lt=timezone.now())
                   .exclude(task__status__in=[TaskStatus.DONE, TaskStatus.CANCELLED])
                   .values("user_id").annotate(n=Count("id")))
        for row in overdue:
            stats_of.setdefault(row["user_id"], _empty_stats())["overdue"] = row["n"]

        # ---- KO'RSATILADIGAN ro'yxat: ustiga holat filtri qo'yiladi.
        links = base.select_related("task", "task__project")
        if status:
            links = links.filter(task__status=status)
        else:
            # Standart ko'rinish - QILINAYOTGAN ish: bajarilgani ham, bekor
            # qilingani ham ro'yxatni uzaytirib, manzarani buzardi.
            links = links.exclude(task__status__in=[TaskStatus.DONE, TaskStatus.CANCELLED])

        for link in links:
            task = link.task
            tasks_of.setdefault(link.user_id, []).append({
                "id": task.pk,
                "code": task.code,
                "title": task.title,
                "status": task.status,
                "status_display": task.get_status_display(),
                "priority": task.priority,
                "priority_label": task.priority_label,
                "due_date": task.due_date,
                "is_overdue": task.is_overdue,
                "project": {"id": task.project_id, "name": task.project.name,
                            "key": task.project.key, "color": task.project.color},
            })

    ctx = {"request": request}
    rows = []
    for uid, person in people.items():
        items = tasks_of.get(uid, [])
        # Qidiruvda javob ISH bo'ladi - ishi topilmagan odam ro'yxatda
        # turishining ma'nosi yo'q. Qolgan kesimlarda esa aksincha: "kimda
        # bugunga ish yo'q" ham menejerga kerak bo'ladigan javob.
        #
        # ISMI so'ralgan odam esa ishi bo'lmasa ham qoladi: uni ataylab
        # qidirgan odamga "topilmadi" deb javob berish noto'g'ri bo'lardi.
        if search and not items and uid not in named:
            continue
        # Muhimi tepada, keyin muddati yaqini. Muddati yo'qlari oxirida -
        # aks holda ular "eng shoshilinch" bo'lib ko'rinardi.
        items.sort(key=lambda t: (-t["priority"], t["due_date"] is None, t["due_date"]
                                  or "", t["code"]))
        rows.append({
            "user": UserBriefSerializer(person, context=ctx).data,
            "projects": projects_of.get(uid, []),
            "task_count": len(items),
            "overdue_count": sum(1 for t in items if t["is_overdue"]),
            # Xulosa RO'YXATDAN emas, alohida sanoqdan: ro'yxat standart
            # holatda bajarilganini ko'rsatmaydi, xulosaning butun ma'nosi
            # esa aynan «nechtasi bajarildi, nechtasi yo'q» degan javobda.
            "stats": _summary(stats_of.get(uid, _empty_stats())),
            "tasks": items[:50],
        })

    # Bandi tepada: menejer avval kimga ish qo'shib bo'lmasligini ko'radi.
    rows.sort(key=lambda r: (-r["task_count"], r["user"]["full_name"]))

    # ------------------------------------------------------------ sahifalash
    #
    # O'ttiz kishilik jamoada ro'yxat bir necha ekran pastga cho'zilib
    # ketardi va oxiridagi odam hech qachon ko'rilmasdi. Endi o'ntadan.
    #
    # Kesish SARALASHDAN KEYIN: birinchi sahifada eng bandlar tursin.
    # Sanoq ham to'liq ro'yxatniki - sarlavhadagi «32 kishi» o'zgarmaydi,
    # u jamoaning kattaligini aytadi, sahifaning emas.
    total = len(rows)
    pages = max(1, ceil(total / WORKLOAD_PAGE_SIZE))
    # Filtr ro'yxatni qisqartirsa joriy sahifa chegaradan chiqib ketishi
    # mumkin - odam bo'sh ekranga urilmasin.
    page = min(max(1, int_param(request.query_params.get("page") or 1, "page")), pages)
    start = (page - 1) * WORKLOAD_PAGE_SIZE

    return Response({
        "projects": options,
        "count": total,
        "page": page,
        "pages": pages,
        "page_size": WORKLOAD_PAGE_SIZE,
        "developers": rows[start:start + WORKLOAD_PAGE_SIZE],
    })
