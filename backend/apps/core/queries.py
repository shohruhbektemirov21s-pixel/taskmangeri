"""So'rov yordamchilari - bazadan mustaqil sanoq.

MUAMMO. `qs.annotate(n=Count("bogliqlik"))` Django ni tashqi so'rovga
`GROUP BY` qo'shishga majbur qiladi, unga esa tanlangan barcha ustunlar
tushadi. IBM Db2 `GROUP BY` (va `DISTINCT`) ichida CLOB ustunini qo'llamaydi,
loyihada esa `TextField` ko'p - `User.bio`, `Project.description` va h.k.
Natijada:

    SQL0134N  Improper use of a string column ... "BIO".  SQLSTATE=42907

YECHIM. Sanoqni `GROUP BY` bilan emas, alohida ichki so'rov (`Subquery`)
bilan olamiz: tashqi so'rovga `GROUP BY` qo'shilmaydi, ya'ni CLOB muammosi
umuman paydo bo'lmaydi.

Yon foyda: bir nechta bog'lanish bo'yicha sanaganda `JOIN` lar ko'payib
qatorlar ko'payib ketmaydi (Django buni `distinct=True` bilan tuzatib
turardi) - so'rov ham tozaroq, ham tezroq.
"""
from django.db.models import Count, IntegerField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce


def related_count(model, outer_ref="pk", *, group_by, **filters):
    """Bog'liq jadvaldagi qatorlar sonini `Subquery` orqali sanaydi.

        Project.objects.annotate(
            member_count=related_count(ProjectMember, group_by="project",
                                       is_active=True),
        )

    `group_by` - ichki jadvaldagi tashqi kalit nomi (`project`, `workspace`...).
    Qolgan nomli argumentlar ichki so'rovga filtr bo'lib qo'shiladi.
    """
    sub = (model.objects
           .filter(**{group_by: OuterRef(outer_ref)}, **filters)
           .order_by()                       # standart tartib GROUP BY ni buzadi
           .values(group_by)
           .annotate(n=Count("*"))
           .values("n")[:1])
    # Bog'liq qator bo'lmasa `Subquery` NULL qaytaradi - 0 ga aylantiramiz.
    return Coalesce(Subquery(sub, output_field=IntegerField()), Value(0))
