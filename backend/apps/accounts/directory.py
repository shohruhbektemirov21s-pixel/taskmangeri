"""Kim kimni KATALOGDA ko'radi.

MUAMMO. `GET /api/users/` va `GET /api/chat/messages/people/` tizimdagi
HAMMA hisobni qaytarardi va javobda `email` ham bor edi
(`UserBriefSerializer`). Yagona shart - tokenning o'zi. Ro'yxatdan o'tish
esa hammaga ochiq (`RegisterView` - `AllowAny`), ya'ni butun
tashkilotning pochta katalogini yig'ib olish uchun bitta hisob ochish
kifoya edi: qidiruv `email` bo'yicha ham ishlaydi, sahifalash esa
qolganini beradi.

QOIDA. Odam O'ZI BILAN ISHLAYDIGAN odamlarni ko'radi:

  * bir ish maydonidagilar (maydon egasi ham a'zo hisoblanadi);
  * bir loyihadagi faol a'zolar;
  * o'zi.

Hamma loyihani ko'radiganlar (admin, boshliq, global menejer) uchun
chegara yo'q - ular butun tashkilotni boshqaradi va odamlar ro'yxati
ularning ish quroli (`sees_all_projects`).

NEGA MAYDON EMAS, SHART. Chegarani serializerdagi `email` maydonini
yashirish bilan qilish mumkin edi, lekin u noto'g'ri joy: ism, lavozim
va mutaxassislik ham katalog ma'lumoti. Muammo qaysi USTUN
qaytayotganida emas, kimning QATORI qaytayotganida.

NEGA `Exists` EMAS, ID TO'PLAMI. Shart bitta so'rovda ikkita ichki
so'rovga aylanardi va u har bir qator uchun qayta hisoblanardi. Bu yerda
ro'yxat kichik (odamning hamkasblari) va u so'rov boshida bir marta
olinadi: ikkita `values_list`, keyin `pk__in`.
"""
from django.db.models import Q


def coworker_ids(user):
    """Foydalanuvchi bilan bir maydonda yoki bir loyihada bo'lgan odamlar."""
    from apps.projects.models import ProjectMember
    from apps.workspaces.models import Workspace, WorkspaceMember

    my_workspaces = set(
        WorkspaceMember.objects.filter(user=user).values_list("workspace_id", flat=True)
    )
    # Maydon egasi a'zolik jadvalida bo'lmasligi mumkin - u ham hisoblanadi.
    my_workspaces |= set(
        Workspace.objects.filter(owner=user).values_list("pk", flat=True)
    )
    my_projects = set(
        ProjectMember.objects.filter(user=user, is_active=True)
        .values_list("project_id", flat=True)
    )

    ids = {user.pk}
    if my_workspaces:
        ids |= set(
            WorkspaceMember.objects.filter(workspace_id__in=my_workspaces)
            .values_list("user_id", flat=True)
        )
        ids |= set(
            Workspace.objects.filter(pk__in=my_workspaces)
            .values_list("owner_id", flat=True)
        )
    if my_projects:
        ids |= set(
            ProjectMember.objects.filter(project_id__in=my_projects, is_active=True)
            .values_list("user_id", flat=True)
        )
    ids.discard(None)
    return ids


def visible_people_q(user):
    """Katalogda ko'rinadigan odamlar sharti - `User` queryset uchun.

    Hamma loyihani ko'radiganlar uchun bo'sh `Q()` qaytadi, ya'ni so'rovga
    umuman filtr qo'shilmaydi. Shartni `if not user.is_platform_admin:`
    bilan TAKRORLAMANG - `visible_projects_q` dagi bilan bir xil sabab:
    takror qoldirilgan joyda ro'yxatlar bir-biridan uzoqlashadi.
    """
    from apps.projects.permissions import sees_all_projects

    if not user or not user.is_authenticated:
        return Q(pk__in=[])
    if sees_all_projects(user):
        return Q()
    return Q(pk__in=coworker_ids(user))
