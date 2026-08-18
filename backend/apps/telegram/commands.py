"""Botga kelgan buyruqlarga javob.

Bu yerda faqat O'QISH bor: bot vazifani o'zgartirmaydi, holatni
ko'chirmaydi, hech narsa o'chirmaydi. Sabab oddiy — Telegram akkaunti
username bo'yicha moslanadi, username esa egasi tomonidan almashtirilishi
mumkin. O'qish uchun bu yetarli, yozish uchun emas.

Har bir javob SO'RAGAN odam nomidan yig'iladi: ilovadagi ruxsat qoidalari
shu yerda ham takrorlanadi (`project__deleted_at__isnull=True`, faqat
o'ziga biriktirilgan ish, menejerga esa boshqaruvidagi loyihalar).
"""
import logging

from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from . import client
from .models import TelegramLink, normalize_username, user_lookup
from .services import app_url, esc

logger = logging.getLogger(__name__)

# Bir xabarga sig'adigan qatorlar - Telegram 4096 belgini cheklaydi va
# uzun ro'yxat baribir o'qilmaydi.
MAX_ROWS = 15

HELP = (
    "<b>TeamFlow boti</b>\n\n"
    "/vazifalarim — menga biriktirilgan ochiq ishlar\n"
    "/bugun — muddati bugun va kechikkanlar\n"
    "/tekshiruv — tekshiruvimni kutayotgan ishlar\n"
    "/uzish — Telegram bog'lanishini uzish\n"
    "/yordam — shu ro'yxat"
)


def _unfinished():
    from apps.tasks.models import TaskStatus

    return [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW,
            TaskStatus.CHANGES_REQUESTED, TaskStatus.BLOCKED]


def _my_tasks(user):
    """Odamga biriktirilgan, o'chirilmagan loyihalardagi ishlar."""
    from apps.tasks.models import Task, TaskAssignment

    mine = Exists(TaskAssignment.objects.filter(
        task=OuterRef("pk"), user=user, is_active=True))
    return (Task.objects.filter(mine, project__deleted_at__isnull=True)
            .select_related("project"))


def _row(task):
    code = "{}-{}".format(task.project.key, task.number)
    return "<code>{}</code> {} — {}".format(
        esc(code), esc(task.title), esc(task.get_status_display()))


def _listing(title, tasks, empty):
    rows = [_row(t) for t in tasks[:MAX_ROWS]]
    if not rows:
        return "<b>{}</b>\n\n{}".format(esc(title), esc(empty))
    text = "<b>{}</b>\n\n".format(esc(title)) + "\n".join(rows)
    total = tasks.count()
    if total > MAX_ROWS:
        text += "\n\n<i>… va yana {} ta. To'liq ro'yxat ilovada.</i>".format(total - MAX_ROWS)
    return text


# ------------------------------------------------------------------ buyruqlar

def cmd_start(link, _args):
    return (
        "<b>Salom, {}!</b>\n\nTelegram hisobingiz TeamFlow ga bog'landi — "
        "endi bildirishnomalar shu yerga ham keladi.\n\n{}"
    ).format(esc(link.user.full_name), HELP)


def cmd_help(_link, _args):
    return HELP


def cmd_my_tasks(link, _args):
    tasks = (_my_tasks(link.user).filter(status__in=_unfinished())
             .order_by("-priority", "due_date", "id"))
    return _listing("Mening ochiq ishlarim", tasks, "Ochiq ish yo'q.")


def cmd_today(link, _args):
    from datetime import datetime, time as dtime

    today = timezone.localdate()
    # Kun chegarasi Toshkent vaqtida, aniq lahza bilan - `dashboard` dagi
    # kabi: Db2 da sanani ustundan ajratib olish mintaqani hisobga olmaydi.
    day_end = timezone.make_aware(datetime.combine(today, dtime.min)) + timezone.timedelta(days=1)
    tasks = (_my_tasks(link.user)
             .filter(status__in=_unfinished(), due_date__lt=day_end)
             .order_by("due_date", "-priority", "id"))
    return _listing("Bugun bajarilishi kerak", tasks,
                    "Muddati bugungi yoki kechikkan ish yo'q.")


def cmd_review(link, _args):
    """Menejer tekshiruvini kutayotgan ishlar."""
    from apps.projects.models import ProjectMember, ProjectRole, Project
    from apps.tasks.models import Task, TaskStatus

    user = link.user
    if user.is_platform_admin:
        tasks = Task.objects.filter(status=TaskStatus.IN_REVIEW,
                                    project__deleted_at__isnull=True)
    else:
        managed = Project.objects.filter(
            Q(manager=user) | Exists(ProjectMember.objects.filter(
                project=OuterRef("pk"), user=user, is_active=True,
                role=ProjectRole.MANAGER)))
        if not managed.exists():
            return "Siz hech bir loyihani boshqarmaysiz — tekshiruv navbati yo'q."
        tasks = Task.objects.filter(status=TaskStatus.IN_REVIEW, project__in=managed)

    tasks = tasks.select_related("project").order_by("submitted_at")
    return _listing("Tekshiruvni kutmoqda", tasks, "Navbat bo'sh.")


def cmd_unlink(link, _args):
    link.delete()
    return ("Bog'lanish uzildi — Telegramga xabar kelmaydi.\n\n"
            "Qayta ulash uchun shu yerga /start bosing.")


COMMANDS = {
    "start": cmd_start,
    "yordam": cmd_help,
    "help": cmd_help,
    "vazifalarim": cmd_my_tasks,
    "bugun": cmd_today,
    "tekshiruv": cmd_review,
    "uzish": cmd_unlink,
}


# ------------------------------------------------------------------ kirish

def _bind(chat, username):
    """Kelgan xabarni hisobga moslaydi va bog'lanishni yozadi.

    Moslash PROFILDAGI Telegram maydoni bo'yicha (`accounts.User.telegram`)
    - odam u yerga o'z username'ini allaqachon yozgan. Topilmasa `None`
    qaytadi va odamga nima qilish kerakligi aytiladi.

    Bitta Telegram akkaunti - bitta hisob: shu `chat_id` boshqa odamga
    bog'langan bo'lsa, eskisi uziladi.
    """
    from django.contrib.auth import get_user_model

    name = normalize_username(username)
    chat_id = chat.get("id")
    if not name or not chat_id:
        return None

    User = get_user_model()
    user = User.objects.filter(user_lookup(name), is_active=True).first()
    if user is None:
        return None

    link = TelegramLink.objects.filter(user=user).first()
    if link is not None and link.chat_id == chat_id:
        return link

    # `chat_id` unikal: avval o'sha chatga bog'langan boshqa yozuvni olib
    # tashlaymiz, keyin shu odamnikini qayta yozamiz.
    TelegramLink.objects.filter(chat_id=chat_id).delete()
    TelegramLink.objects.filter(user=user).delete()
    return TelegramLink.objects.create(user=user, chat_id=chat_id)


def handle(update):
    """Bitta yangilikni qayta ishlaydi. Javob yuborilsa `True`."""
    message = (update or {}).get("message") or {}
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    text = (message.get("text") or "").strip()

    if not chat.get("id") or not text.startswith("/"):
        return False

    # `/vazifalarim@teamflow_bot` - guruhda bot nomi qo'shiladi.
    raw = text.split()[0][1:].split("@")[0].lower()
    args = text.split()[1:]

    link = _bind(chat, sender.get("username"))
    if link is None:
        who = sender.get("username")
        reply = (
            "Bu Telegram akkaunti hech qaysi TeamFlow hisobiga bog'lanmagan.\n\n"
            "Ilovaga kiring → <b>Profil</b> → <b>Tahrirlash</b> → Telegram "
            "maydoniga <code>{}</code> deb yozing va shu yerga qaytib /start bosing."
        ).format(esc(who or "username"))
        if not who:
            reply = ("Telegram akkauntingizda username yo'q. Telegram sozlamalaridan "
                     "username qo'ying, keyin ilovadagi profilingizga o'sha nomni "
                     "yozing va bu yerga qaytib /start bosing.")
        client.send_message(chat["id"], reply)
        return True

    handler = COMMANDS.get(raw)
    if handler is None:
        client.send_message(chat["id"], "Bunday buyruq yo'q.\n\n" + HELP)
        return True

    try:
        reply = handler(link, args)
    except Exception:
        logger.exception("Telegram buyrug'i bajarilmadi: /%s", raw)
        reply = "Buyruqni bajarib bo'lmadi. Keyinroq urinib ko'ring."

    buttons = None
    url = app_url("/panel")
    if url and raw in ("start", "vazifalarim", "bugun", "tekshiruv"):
        buttons = [[("Ilovani ochish", url)]]
    client.send_message(chat["id"], reply, buttons=buttons)
    return True
