import logging

from datetime import datetime, time as dtime
from math import ceil

from django.db.models import Count, Exists, F, OuterRef, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError as DrfValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.activity.models import Activity
from apps.activity.serializers import ActivitySerializer
from apps.projects.models import (JoinRequest, Project, ProjectMember, ProjectRole,
                                  RequestStatus)
from apps.projects.permissions import managed_projects_q, runs_everything
from apps.core.periods import DUE_RANGES, PERIODS, _period_start, due_span
from apps.core.queries import int_param, task_search_q
from apps.projects.services import project_counters
from apps.projects.serializers import JoinRequestSerializer, ProjectSerializer
from apps.tasks.models import Task, TaskAssignment, TaskStatus
from apps.accounts.serializers import UserBriefSerializer
from apps.tasks.serializers import TaskSerializer

logger = logging.getLogger(__name__)

# Panel ro'yxatining bitta sahifasi. O'n beshta qator ekranga sig'adi va
# ostidagi sahifa raqamlari ko'rinib turadi - odam ro'yxat davom etishini
# skrollamasdan biladi.
PANEL_PAGE_SIZE = 15


def _tick_deadline_reminders():
    """Muddat eslatmalarini kuniga bir marta ishga tushiradi.

    Loyihada rejalashtiruvchi (Celery beat, cron) yo'q, qo'shish esa butun
    bir xizmat qo'shish demakdir. Buning o'rniga tekshiruv panel ochilganda
    bo'ladi, lekin kuniga BIR MARTA: qulf Redis keshida turadi, ya'ni bir
    nechta backend jarayoni bo'lsa ham eslatma takrorlanmaydi.

    Ikki qavatli himoya: bu yerdagi kalit ortiqcha ishni to'xtatadi,
    `ProjectDeadlineNotice` esa xabarning o'zi takrorlanmasligini kafolatlaydi.
    Panel sekinlashmasin uchun xato bo'lsa jim o'tib ketamiz.
    """
    from django.core.cache import cache

    from apps.projects.deadlines import send_due_reminders

    key = "deadline-reminders:{}".format(timezone.localdate())
    try:
        # `add` - kalit yo'q bo'lsagina qo'yadi, ya'ni kunning birinchi so'rovi.
        if not cache.add(key, 1, 60 * 60 * 26):
            return
        send_due_reminders()
    except Exception:
        logger.exception("Muddat eslatmalarini yuborib bo'lmadi")


# «Yopilmagan» - DONE dan boshqa hamma holat, TEKSHIRUVDAGISI HAM.
# Tekshiruvga topshirilgan ish ham muddati o'tsa kechikkan hisoblanadi:
# uni ro'yxatdan chiqarib tashlasak, panel «hammasi joyida» deb turardi.
def unfinished_statuses():
    return [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW,
            TaskStatus.CHANGES_REQUESTED, TaskStatus.BLOCKED]


def panel_metric_q(metric, start, now):
    """Panel katagining sharti.

    BITTA MANBA. Sanoq (`dashboard`) ham, ro'yxat (`panel_tasks`) ham shu
    funksiyadan oladi - aks holda katakda «5» turib, bosilganda 4 ta ish
    chiqishi mumkin edi va qaysi biri to'g'riligi noma'lum bo'lib qolardi.

    `start` faqat davr kataklariga kerak; muddat holati (pastki qator)
    butun tarix bo'yicha sanaladi.
    """
    open_now = Q(status__in=unfinished_statuses())

    if metric == "todo":            # shu davrda ochilgan, hamon yopilmagan
        return open_now & Q(created_at__gte=start)
    if metric == "overdue":         # muddati shu davrga tushgan va o'tgan
        return open_now & Q(due_date__gte=start, due_date__lt=now)
    if metric == "done":            # shu davrda yakunlangan
        return Q(status=TaskStatus.DONE, completed_at__gte=start)
    if metric == "period":
        # BUTUN TAXTA: uchala katakning birlashmasi. Davr nomi bosilganda
        # shu ochiladi - odam «yil boshidan nima bo'ldi» degan savolga
        # bitta ro'yxatda javob oladi, uchta katakni navbat bilan bosib
        # emas.
        #
        # `|` - birlashma, qo'shuv emas: bitta ish ham «nazoratda», ham
        # «muddati o'tgan» bo'lishi mumkin (ikkovi ham yopilmagan ishlar
        # haqida) va u ro'yxatda IKKI MARTA turmasligi kerak. Shart
        # `WHERE` da qo'shilgani uchun takror umuman paydo bo'lmaydi.
        return (panel_metric_q("todo", start, now)
                | panel_metric_q("overdue", start, now)
                | panel_metric_q("done", start, now))
    if metric == "late_done":       # yopilgan, lekin muddatdan keyin
        return Q(status=TaskStatus.DONE, due_date__isnull=False,
                 completed_at__gt=F("due_date"))
    if metric == "overdue_now":     # yopilmagan va muddati o'tgan
        return open_now & Q(due_date__lt=now)
    if metric == "waiting":         # yopilmagan, muddati hali kelmagan
        return open_now & (Q(due_date__gte=now) | Q(due_date__isnull=True))
    return None


def panel_queryset(user):
    """Panel qaysi ishlarni sanashi - rolga qarab. `(queryset, qamrov)`.

    admin    - tirik loyihalardagi hamma ish;
    boshliq  - shuningdek hamma ish: u butun tashkilotni boshqaradi;
    menejer  - boshqaradigan loyihalari + o'ziga biriktirilgani;
    dasturchi- faqat o'ziga biriktirilgani.
    """
    from apps.tasks.models import TaskAssignment

    live = Task.objects.filter(project__deleted_at__isnull=True)
    mine = Exists(TaskAssignment.objects.filter(
        task=OuterRef("pk"), user=user, is_active=True))

    if runs_everything(user):
        return live, "all"

    managed = Project.objects.filter(
        Q(manager=user) | Exists(ProjectMember.objects.filter(
            project=OuterRef("pk"), user=user, is_active=True,
            role=ProjectRole.MANAGER)))
    if managed.exists():
        return live.filter(Q(project__in=managed) | Q(mine)), "managed"
    return live.filter(mine), "mine"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    """Fokus paneli: har bir rol faqat o'zining ishini ko'radi."""
    user = request.user
    now = timezone.now()
    ctx = {"request": request}

    _tick_deadline_reminders()

    # `Exists()` - `.distinct()` o'rniga. Db2 DISTINCT da CLOB ustunini
    # qo'llamaydi (`description` kabi matn maydonlari), shuning uchun takrorni
    # tozalash emas, umuman paydo qilmaslik to'g'riroq.
    mine = Exists(TaskAssignment.objects.filter(
        task=OuterRef("pk"), user=user, is_active=True))

    # O'chirilgan loyihaning vazifalari panelga ham chiqmaydi.
    # `for_display()` - RO'YXAT uchun tayyor queryset (`tasks/models.py`).
    #
    # Ilgari bu yerda select/prefetch qo'lda yozilgan edi va uchta narsa
    # tushib qolgandi: `labels` prefetch, `logged_hours_sum` va
    # `attachments_total` annotatsiyalari. Ular yo'q bo'lsa `TaskSerializer`
    # har vazifa uchun bazaga ALOHIDA boradi - yorliqlar uchun bittadan,
    # sarflangan soat uchun `SUM`, fayllar uchun `COUNT`. Ya'ni panelda
    # ko'rsatiladigan har bir ish uchun uchta qo'shimcha so'rov.
    #
    # Panel bir necha ro'yxatni birga chizadi (fokus navbati, qaytarilgan,
    # to'xtagan, tekshiruvdagi - jami 60 tagacha yozuv), demak bu 180 ta
    # so'rovgacha yetishi mumkin edi. Kichik bazada bilinmasdi.
    my_tasks = Task.objects.for_display().filter(
        mine, project__deleted_at__isnull=True)

    focus_queue = my_tasks.filter(
        status__in=[TaskStatus.TODO, TaskStatus.IN_PROGRESS]
    ).order_by("-priority", "due_date", "id")

    next_task = focus_queue.first()
    returned = my_tasks.filter(status=TaskStatus.CHANGES_REQUESTED)
    blocked = my_tasks.filter(status=TaskStatus.BLOCKED)
    waiting_review = my_tasks.filter(status=TaskStatus.IN_REVIEW)
    overdue = focus_queue.filter(due_date__lt=now)

    # ------------------------------------------------------------ bugun
    # Kun chegarasi TOSHKENT vaqtida hisoblanadi va aniq lahzalar bilan
    # solishtiriladi (`__date` emas): Db2 da sanani ustundan ajratib olish
    # mintaqani hisobga olmaydi va tunda son noto'g'ri chiqardi.
    today = timezone.localdate()
    day_start = timezone.make_aware(datetime.combine(today, dtime.min))
    day_end = day_start + timezone.timedelta(days=1)

    # ----------------------------------------- SHAXSIY RAQAMLAR: BITTA SO'ROV
    #
    # Bu yerda to'qqizta alohida `.count()` turardi - oltitasi `stats` uchun
    # (ochiq, tekshiruvda, tuzatishda, to'xtagan, kechikkan, haftada
    # bajarilgan), uchtasi «bugun» katagi uchun. Hammasi AYNI BIR jadvalni,
    # ayni bir shart bilan (`mine` + tirik loyiha) o'qir, faqat holat
    # filtri boshqacha edi - ya'ni Db2 ga to'qqizta borib-kelish, har
    # safar o'sha ichki `EXISTS` qayta hisoblanib.
    #
    # Endi bittasi: shartli `Count(filter=...)`. Bu texnika shu faylda
    # allaqachon ishlatiladi (pastdagi `periods` va `deadlines`) - o'sha
    # yerdagi izoh sababini ham aytadi: `GROUP BY` yo'q, ya'ni Db2 ning
    # CLOB cheklovi qo'zg'almaydi.
    #
    # Ro'yxatlarning o'zi (`focus_queue`, `returned`, ...) o'z joyida
    # qoladi - ular seriyalizatsiya uchun kerak va kesib olinadi.
    open_today = [TaskStatus.TODO, TaskStatus.IN_PROGRESS,
                  TaskStatus.CHANGES_REQUESTED, TaskStatus.BLOCKED]
    active = [TaskStatus.TODO, TaskStatus.IN_PROGRESS]
    week_ago = now - timezone.timedelta(days=7)

    n = my_tasks.aggregate(
        open=Count("id", filter=Q(status__in=active)),
        review=Count("id", filter=Q(status=TaskStatus.IN_REVIEW)),
        returned=Count("id", filter=Q(status=TaskStatus.CHANGES_REQUESTED)),
        # Ro'yxat kesilgani uchun son alohida kerak.
        blocked=Count("id", filter=Q(status=TaskStatus.BLOCKED)),
        overdue=Count("id", filter=Q(status__in=active, due_date__lt=now)),
        done_week=Count("id", filter=Q(status=TaskStatus.DONE,
                                       completed_at__gte=week_ago)),
        # "Bugun bajarish kerak": muddati bugun yoki allaqachon o'tgan, hali
        # yopilmagan ishlar - kechikkani ham bugungi ish hisoblanadi.
        today_todo=Count("id", filter=Q(status__in=open_today, due_date__lt=day_end)),
        today_done=Count("id", filter=Q(status=TaskStatus.DONE,
                                        completed_at__gte=day_start,
                                        completed_at__lt=day_end)),
        # Bugun topshirilgan va hamon javob kutayotgan ishlar.
        today_review=Count("id", filter=Q(status=TaskStatus.IN_REVIEW,
                                          submitted_at__gte=day_start,
                                          submitted_at__lt=day_end)),
    )


    member_of = Exists(ProjectMember.objects.filter(
        project=OuterRef("pk"), user=user, is_active=True))

    # `specialties` va `memberships` seriyalizatorda har loyiha uchun
    # o'qiladi - oldindan yuklanmasa har biri alohida so'rov bo'lardi.
    # RO'YXATLAR CHEKLANADI. Panel javobi bitta so'rovda o'nlab ro'yxatni
    # olib keladi va ularning har biri to'liq seriyalizatordan o'tadi
    # (`ProjectSerializer` da jamoa tarkibi, yetishmayotgan yo'nalishlar va
    # ruxsatlar ham bor). Chegara qo'yilmagan joyda javobning hajmi
    # foydalanuvchining loyihalari soniga qarab o'sib ketardi: ellik
    # loyihali menejerda panel eng og'ir sahifaga aylanardi.
    #
    # Sanoqlar bundan zarar ko'rmaydi - ular ALOHIDA `count()` bilan
    # olinadi (`stats`, `team`), ya'ni raqamlar to'liq qoladi va faqat
    # ko'rsatiladigan ro'yxat qisqaradi.
    PANEL_LIST = 20

    my_projects = (Project.objects.filter(member_of)
                   .select_related("workspace", "manager", "created_by")
                   .prefetch_related("specialties", "memberships__user")
                   .annotate(**project_counters(user))
                   .order_by("-updated_at")[:PANEL_LIST])

    # Boshliq ham admin bilan bir shoxda: uning tekshiruv navbati, qo'shilish
    # so'rovlari va tarix lentasi butun tizim bo'yicha bo'ladi - u hamma
    # loyihada amal qila oladi (`managed_projects_q`), demak navbati ham
    # o'shancha bo'lishi kerak.
    if runs_everything(user):
        managed = Project.objects.select_related("manager").order_by("-updated_at")
        review_qs = Task.objects.filter(status=TaskStatus.IN_REVIEW,
                                        project__deleted_at__isnull=True)
        join_qs = JoinRequest.objects.filter(status=RequestStatus.PENDING,
                                             project__deleted_at__isnull=True)
        feed = Activity.objects.timeline()[:20]
    else:
        managed = Project.objects.filter(
            Q(manager=user) | Exists(ProjectMember.objects.filter(
                project=OuterRef("pk"), user=user, is_active=True,
                role=ProjectRole.MANAGER)))
        review_qs = Task.objects.filter(status=TaskStatus.IN_REVIEW, project__in=managed)
        join_qs = JoinRequest.objects.filter(status=RequestStatus.PENDING, project__in=managed)
        feed = (Activity.objects.filter(
            Q(actor=user) | Exists(ProjectMember.objects.filter(
                project=OuterRef("project_id"), user=user, is_active=True)))
            .select_related("actor", "project", "task")
            .order_by("-created_at")[:20])

    # Sanoq KESISHDAN OLDIN olinadi. Ilgari `[:10]` dan keyin `.count()`
    # chaqirilardi va Django limitni hisobga olib doim 10 dan oshmagan son
    # qaytarardi: bazada 12 ta tekshiruv bo'lsa ham panelda "10" turardi.
    review_total = review_qs.count()
    join_total = join_qs.count()
    managed_total = managed.count()

    # ------------------------------------------------------- panel raqamlari
    # QAYSI ISHLAR SANALADI. Ilgari faqat odamning O'ZIGA biriktirilgan
    # ishlari sanalardi. Menejer va admin uchun bu noto'g'ri javob berardi:
    # loyihasida ikkita ochiq ish tursa ham panel «0» deb ko'rsatardi,
    # chunki ular boshqaruvchi, ijrochi emas. Endi qamrov ROLGA qarab:
    #
    #   admin    - tirik loyihalardagi hamma ish;
    #   menejer  - boshqaradigan loyihalari + o'ziga biriktirilgani;
    #   dasturchi- faqat o'ziga biriktirilgani.
    #
    # Qoida yangi emas - `managed` yuqorida aynan shu tamoyil bo'yicha
    # yig'ilgan, panel endi undan foydalanadi.
    panel_tasks, panel_scope = panel_queryset(user)

    # ---------------------------------------------------------- davrlar
    # Panelning uchta taxtasi: yil, oy va hafta boshidan. Har birida bir xil
    # uch raqam, lekin har biri O'Z sanasi bo'yicha sanaladi:
    #   Nazoratda      - shu davrda OCHILGAN va hamon yopilmagan ishlar;
    #   Muddati o'tgan - muddati shu davrga tushgan va o'tib ketgan ishlar;
    #   Bajarilganlar  - shu davrda yakunlangan ishlar.
    #
    # Hamma sonlar BITTA so'rovda olinadi. Har biriga alohida `.count()`
    # yozilsa panel bazaga o'n ikki marta borardi; shartli `Count(filter=...)`
    # da esa GROUP BY yo'q, ya'ni Db2 ning CLOB cheklovi ham qo'zg'almaydi.
    #
    # «Yopilmagan» - DONE dan boshqa hamma holat, TEKSHIRUVDAGISI HAM.
    # Tekshiruvga topshirilgan ish ham muddati o'tsa kechikkan hisoblanadi:
    # uni ro'yxatdan chiqarib tashlasak, panel «hammasi joyida» deb turardi.
    period_starts = {key: _period_start(key) for key in PERIODS}
    counters = {}
    for key, start in period_starts.items():
        for metric in ("todo", "overdue", "done"):
            counters["{}_{}".format(key, metric)] = Count(
                "id", filter=panel_metric_q(metric, start, now))

    # ------------------------------------------------------- muddat holati
    # Panelning pastki qatori. Uchovi butun tarix bo'yicha va bir-birini
    # takrorlamaydi: yopilmagan ish yo kechikkan, yo hali kutilmoqda.
    #   Muddati buzib bajarilgan - yopilgan, lekin muddatdan KEYIN;
    #   Muddati o'tgan          - yopilmagan va muddati o'tib ketgan;
    #   Kutilmoqda              - yopilmagan, muddati hali kelmagan
    #                             (yoki umuman qo'yilmagan).
    for metric in ("late_done", "overdue_now", "waiting"):
        counters[metric] = Count("id", filter=panel_metric_q(metric, None, now))

    nums = panel_tasks.aggregate(**counters)
    periods = [{
        "key": key,
        "since": period_starts[key],
        "todo": nums[key + "_todo"],
        "overdue": nums[key + "_overdue"],
        "done": nums[key + "_done"],
    } for key in PERIODS]
    deadlines = {
        "late_done": nums["late_done"],
        "overdue": nums["overdue_now"],
        "waiting": nums["waiting"],
    }
    # Tekshiruv navbati ham `TaskSerializer` dan o'tadi - unga ham o'sha
    # annotatsiyalar kerak (yuqoridagi izohga qarang).
    review_qs = (review_qs.for_display().order_by("submitted_at")[:10])
    join_qs = join_qs.select_related("user", "project").order_by("created_at")[:10]

    # `managed` yuqorida ichki so'rov sifatida ham ishlatiladi (`project__in`),
    # shuning uchun uni o'zgartirmaymiz - ko'rsatiladigan sahifa alohida
    # olinadi va faqat unga prefetch bilan annotatsiya qo'shiladi.
    managed_page = (managed
                    .select_related("workspace", "manager", "created_by")
                    .prefetch_related("specialties", "memberships__user")
                    .annotate(**project_counters(user))
                    .order_by("-updated_at")[:8])

    # ---------------------------------------------------------- menejer kesimi
    # Menejerga o'z jamoasi bir ekranda kerak: nechta loyiha boshqaryapti,
    # unda nechta ishchi odam bor, kim qaysi loyihaga biriktirilgan va
    # kimning ishi hozir uning tekshiruvini kutyapti.
    #
    # Sanoqlar ikkita so'rovda olinadi (a'zolar va vazifa sanog'i), keyin
    # Python da birlashtiriladi - odam boshiga alohida so'rov ketmasin.
    team_rows = []
    dev_roles = (ProjectRole.DEVELOPER, ProjectRole.QA)
    memberships = (ProjectMember.objects
                   .filter(project__in=managed, is_active=True, role__in=dev_roles)
                   .exclude(user=user)
                   .select_related("user", "project"))
    load = {}
    for row in (TaskAssignment.objects
                .filter(is_active=True, task__project__in=managed,
                        task__project__deleted_at__isnull=True)
                .values("user_id", "task__status")
                .annotate(n=Count("id"))):
        cell = load.setdefault(row["user_id"], {"open": 0, "review": 0, "done": 0})
        status = row["task__status"]
        if status in (TaskStatus.TODO, TaskStatus.IN_PROGRESS,
                      TaskStatus.CHANGES_REQUESTED, TaskStatus.BLOCKED):
            cell["open"] += row["n"]
        elif status == TaskStatus.IN_REVIEW:
            cell["review"] += row["n"]
        elif status == TaskStatus.DONE:
            cell["done"] += row["n"]

    people = {}
    for m in memberships:
        item = people.setdefault(m.user_id, {
            "user": UserBriefSerializer(m.user, context=ctx).data,
            "role_label": m.get_role_display(),
            "projects": [],
        })
        item["projects"].append({"id": m.project_id, "name": m.project.name,
                                 "key": m.project.key, "color": m.project.color})
    for uid, item in people.items():
        cell = load.get(uid, {})
        item["open_tasks"] = cell.get("open", 0)
        item["review_tasks"] = cell.get("review", 0)
        item["done_tasks"] = cell.get("done", 0)
        team_rows.append(item)
    # Tekshiruv kutayotgani tepada, keyin ish ko'pi - menejer avval nima
    # qilishi kerakligi ko'rinib tursin.
    team_rows.sort(key=lambda r: (-r["review_tasks"], -r["open_tasks"],
                                  r["user"]["full_name"]))

    return Response({
        # Oltovi ham yuqoridagi BITTA `aggregate` dan keladi.
        "stats": {
            "open": n["open"],
            "review": n["review"],
            "returned": n["returned"],
            "blocked": n["blocked"],
            "overdue": n["overdue"],
            "done_week": n["done_week"],
            "pending_reviews": review_total,
            "pending_joins": join_total,
        },
        # Panelning uchta taxtasi: yil, oy va hafta boshidan.
        "periods": periods,
        # Pastki qator: muddat holati (butun tarix bo'yicha).
        "deadlines": deadlines,
        # Raqamlar KIMNIKI - panel buni yozib qo'ysin, aks holda menejer
        # «bu mening ishimmi yoki jamoanikimi» deb taxmin qilishi kerak edi.
        "scope": panel_scope,
        # Bugungi kesim - panelning yuqorisidagi uchta katak.
        "today": {
            "date": today,
            "todo": n["today_todo"],
            "done": n["today_done"],
            "review": n["today_review"],
        },
        "next_task": TaskSerializer(next_task, context=ctx).data if next_task else None,
        "focus_queue": TaskSerializer(focus_queue[:8], many=True, context=ctx).data,
        # Uchovi ham kesiladi - sonlari yuqorida `stats` da to'liq turadi.
        "returned": TaskSerializer(returned[:PANEL_LIST], many=True, context=ctx).data,
        "blocked": TaskSerializer(blocked[:PANEL_LIST], many=True, context=ctx).data,
        "waiting_review": TaskSerializer(waiting_review[:PANEL_LIST], many=True,
                                         context=ctx).data,
        "my_projects": ProjectSerializer(my_projects, many=True, context=ctx).data,
        "managed_projects": ProjectSerializer(managed_page, many=True, context=ctx).data,
        "review_queue": TaskSerializer(review_qs, many=True, context=ctx).data,
        "team": {
            "projects": managed_total,
            "developers": len(team_rows),
            "pending_reviews": review_total,
            "people": team_rows,
        },
        "join_queue": JoinRequestSerializer(join_qs, many=True, context=ctx).data,
        "feed": ActivitySerializer(feed, many=True, context=ctx).data,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def panel_tasks(request):
    """Panel katagi bosilganda ochiladigan ro'yxat.

    Katakni tanlash:
        `?period=year|month|week&metric=todo|overdue|done`
        `?period=year|month|week&metric=period`  (uchala katak birgalikda -
            davr nomi bosilganda)
        `?metric=late_done|overdue_now|waiting`  (davr kerak emas)

    Ro'yxat ichida qidirish va saralash (hammasi ixtiyoriy):
        `?search=`    kod, sarlavha yoki tavsif bo'yicha
        `?due=`       today|yesterday|tomorrow|week|month|year - MUDDAT
        `?status=`    vazifa holati (vergul bilan bir nechtasi)
        `?project=`   loyiha id
        `?page=`      sahifa raqami (bittasida 15 ta qator)

    SANOQ BILAN BIR XIL SHART. Ro'yxat ham, katakdagi son ham
    `panel_metric_q` dan oladi - aks holda katakda «5» turib, bosilganda
    to'rtta ish chiqishi mumkin edi va qaysi biri to'g'riligi noma'lum
    bo'lib qolardi. Qidiruv esa shu shartning USTIGA qo'yiladi: katak
    qamrovidan tashqariga chiqmaydi.
    """
    from apps.tasks.serializers import TaskSerializer

    p = request.query_params
    metric = p.get("metric") or ""
    period = p.get("period") or ""

    needs_period = metric in ("todo", "overdue", "done", "period")
    if needs_period and period not in PERIODS:
        raise DrfValidationError({"period": "Faqat year, month yoki week."})

    start = _period_start(period) if needs_period else None
    condition = panel_metric_q(metric, start, timezone.now())
    if condition is None:
        raise DrfValidationError({"metric": "Bunday ko'rsatkich yo'q."})

    qs, scope = panel_queryset(request.user)
    base = qs.filter(condition)

    # ------------------------------------------------------------ tanlagichlar
    #
    # Loyiha ro'yxati SHU katakdagi ishlardan yig'iladi - `base` dan,
    # qidiruvdan OLDIN. Aks holda loyihani tanlagan odam qolgan loyihalarni
    # tanlagichdan yo'qotib qo'yardi va tanlovini ortga qaytara olmasdi.
    # Holat va muddat tanlovlari esa qat'iy ro'yxat, ular frontendda.
    #
    # IJROCHI TANLAGICHI OLIB TASHLANDI. Panel ro'yxati odamning O'Z
    # kesimida ochiladi va ijrochida u doim bitta ismdan iborat bo'lardi -
    # o'zinikidan. Menejerga esa "kim nima qilyapti" uchun alohida sahifa
    # bor («Vazifalar», `/team/workload/`) va u shu ish uchun ancha qulay:
    # odamlar ro'yxati, ish yuki va kechikkanlari bilan. Facet bilan birga
    # bitta qo'shimcha so'rov ham ketdi.
    #
    # Faqat ikki ustun olinadi: Db2 DISTINCT matn (CLOB) ustunini
    # ko'tarmaydi, `values_list` esa uni so'rovga qo'shmaydi.
    facets = {
        "projects": [
            {"id": pk, "name": name}
            for pk, name in base.values_list("project_id", "project__name")
                                .order_by("project__name").distinct()
        ],
    }

    # ------------------------------------------------------------ saralash
    tasks = base

    search = (p.get("search") or "").strip()
    if search:
        # Matn ham, kod ham («HIR-75», «75») - shart `queries.task_search_q`
        # da, «Vazifalar» sahifasi ham o'shani ishlatadi.
        tasks = tasks.filter(task_search_q(search))

    due = p.get("due") or ""
    if due:
        span = _due_range(due)
        if span is None:
            raise DrfValidationError(
                {"due": "Faqat {}.".format(", ".join(DUE_RANGES))})
        # Muddati QO'YILMAGAN ish oraliqqa tushmaydi - `due_date` bo'sh
        # bo'lsa ikkala solishtiruv ham NULL beradi va yozuv chetda qoladi.
        tasks = tasks.filter(due_date__gte=span[0], due_date__lt=span[1])

    if p.get("status"):
        tasks = tasks.filter(status__in=p["status"].split(","))
    if p.get("project"):
        tasks = tasks.filter(project_id=int_param(p["project"], "project"))

    tasks = (tasks.for_display()
             .order_by("-priority", "due_date", "-id"))

    # ------------------------------------------------------------ sahifalash
    #
    # MUAMMO. Ro'yxat yuztada qirqilardi va oxirida «450 tadan 100 tasi
    # ko'rsatildi» degan yozuv turardi. Yillik katakni bosgan odam uchun bu
    # javob emas edi: qolgan 350 tasiga yetadigan yo'l yo'q, bor-yo'g'i
    # "filtr bilan toraytiring" degan maslahat bor edi.
    #
    # Sanoq KESISHDAN OLDIN olinadi - aks holda Django limitni hisobga olib
    # doim sahifa hajmidan oshmagan son qaytarardi va sahifalar soni ham
    # noto'g'ri chiqardi.
    total = tasks.count()
    pages = max(1, ceil(total / PANEL_PAGE_SIZE))
    # Yaroqsiz yoki chegaradan chiqqan raqam xato emas: eng yaqin haqiqiy
    # sahifa ochiladi. Filtr o'zgarganda sahifalar soni kamayib ketishi
    # mumkin va o'sha paytda odam bo'sh ekranga urilardi.
    page = min(max(1, int_param(p.get("page") or 1, "page")), pages)
    start = (page - 1) * PANEL_PAGE_SIZE

    return Response({
        "metric": metric,
        "period": period or None,
        "scope": scope,
        "count": total,
        "page": page,
        "pages": pages,
        "page_size": PANEL_PAGE_SIZE,
        "facets": facets,
        "results": TaskSerializer(tasks[start:start + PANEL_PAGE_SIZE], many=True,
                                  context={"request": request}).data,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sidebar_counts(request):
    """Yon paneldagi uchta raqam - boshqa hech narsa.

    Ilgari buning uchun `/dashboard/` chaqirilardi: u o'nlab vazifa, loyiha va
    tasmani seriyalizatsiya qiladi, ustiga muddat eslatmalarini ham tekshiradi.
    Yon panelga esa faqat uchta son kerak edi va u har sahifa almashganda
    so'ralardi - ya'ni har navigatsiyada butun panel bekorga yig'ilardi.

    Bu yerda faqat `COUNT` bor. Ruxsat qoidasi navbatning O'ZI bilan bir
    xil bo'lishi shart: tekshiruv va qo'shilish odam BOSHQARADIGAN
    loyihalar bo'yicha, ya'ni loyiha menejeri, loyiha admini va platforma
    admini uchun (`managed_projects_q`).

    ILGARI qanday edi. Bu yerda faqat `ProjectRole.MANAGER` sanalardi,
    ro'yxatning o'zi esa (`/tasks/review-queue/`) loyiha adminini ham
    qo'shardi. Natijada loyiha admini yon panelda «0» ko'rardi, ro'yxatni
    ochsa esa ishlar turardi - raqam bilan ro'yxat bir-biriga zid edi.
    """
    user = request.user

    mine = Exists(TaskAssignment.objects.filter(
        task=OuterRef("pk"), user=user, is_active=True))
    open_count = Task.objects.filter(
        mine, project__deleted_at__isnull=True,
        status__in=[TaskStatus.TODO, TaskStatus.IN_PROGRESS]).count()

    # `Project.objects` o'chirilgan loyihalarni allaqachon yashiradi -
    # `project__in=managed` bilan ular sanoqqa ham tushmaydi.
    managed = Project.objects.filter(managed_projects_q(user))
    review_qs = Task.objects.filter(status=TaskStatus.IN_REVIEW, project__in=managed)
    join_qs = JoinRequest.objects.filter(status=RequestStatus.PENDING,
                                         project__in=managed)

    return Response({
        "open": open_count,
        "reviews": review_qs.count(),
        "joins": join_qs.count(),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_work(request):
    """Menga biriktirilgan barcha vazifalar - status bo'yicha guruhlangan."""
    user = request.user
    ctx = {"request": request}
    qs = (Task.objects.for_display().filter(Exists(TaskAssignment.objects.filter(
              task=OuterRef("pk"), user=user, is_active=True)),
              project__deleted_at__isnull=True))

    project_id = request.query_params.get("project")
    if project_id:
        # Yaroqsiz qiymat 500 emas, 400 (sababi `int_param` da).
        qs = qs.filter(project_id=int_param(project_id, "project"))

    # Qidiruv va muddat kesimi - «Vazifalar» sahifasidagi bilan BIR XIL
    # qoidadan: odam bir ro'yxatda «75» deb topgan ishini ikkinchisida ham
    # topsin, «shu hafta» ikkovida bir xil hafta bo'lsin.
    search = (request.query_params.get("search") or "").strip()
    if search:
        qs = qs.filter(task_search_q(search))

    span = due_span(request.query_params.get("due"), request.query_params.get("period"))
    if span:
        qs = qs.filter(due_date__gte=span[0], due_date__lt=span[1])

    groups = []
    for status in [TaskStatus.CHANGES_REQUESTED, TaskStatus.BLOCKED, TaskStatus.IN_PROGRESS,
                   TaskStatus.TODO, TaskStatus.IN_REVIEW, TaskStatus.DONE]:
        items = qs.filter(status=status).order_by("-priority", "due_date")[:100]
        if items:
            groups.append({
                "status": status,
                "label": TaskStatus(status).label,
                "count": len(items),
                "tasks": TaskSerializer(items, many=True, context=ctx).data,
            })

    projects = (Project.objects.filter(Exists(ProjectMember.objects.filter(
                    project=OuterRef("pk"), user=user, is_active=True)))
                .order_by("name"))
    return Response({
        "groups": groups,
        "projects": [{"id": p.id, "name": p.name, "key": p.key, "color": p.color}
                     for p in projects],
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def meta(request):
    """Frontend uchun barcha ro'yxatlar (status, prioritet, rol) - bir joydan."""
    from apps.accounts.models import GlobalRole
    from apps.activity.models import category_choices
    from apps.accounts.specialties import Seniority, specialty_catalog
    from apps.projects.models import ProjectStatus
    from apps.workspaces.models import WorkspaceRole
    from apps.tasks.models import BOARD_COLUMNS, TaskPriority, TaskType
    from apps.tasks.models import ReviewVerdict

    def pack(choices):
        return [{"value": v, "label": l} for v, l in choices]

    return Response({
        "task_status": pack(TaskStatus.choices),
        "board_columns": [{"value": s, "label": TaskStatus(s).label} for s in BOARD_COLUMNS],
        "task_priority": pack(TaskPriority.choices),
        "task_type": pack(TaskType.choices),
        "review_verdict": pack(ReviewVerdict.choices),
        "project_role": pack(ProjectRole.choices),
        "project_status": pack(ProjectStatus.choices),
        "workspace_role": pack(WorkspaceRole.choices),
        "global_role": pack(GlobalRole.choices),
        "specialties": specialty_catalog(),
        "seniority": pack(Seniority.choices),
        # Tarix filtri - ro'yxat `VERB_META` dan chiqadi, frontendda
        # qattiq yozilmaydi (aks holda yangi turkum filtrga tushmay qolardi).
        "activity_category": category_choices(),
    })
