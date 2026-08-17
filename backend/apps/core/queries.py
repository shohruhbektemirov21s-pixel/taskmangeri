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
from django.db.models import (Count, DecimalField, IntegerField, OuterRef, Subquery,
                              Sum, Value)
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


def related_sum(model, field, outer_ref="pk", *, group_by, **filters):
    """`related_count` ning yig'indi varianti - masalan sarflangan soatlar.

    Sabab ham o'sha: `annotate(Sum(...))` tashqi so'rovga GROUP BY qo'shadi,
    Db2 esa unda CLOB ustunini (`Task.description`) qo'llamaydi.
    """
    sub = (model.objects
           .filter(**{group_by: OuterRef(outer_ref)}, **filters)
           .order_by()
           .values(group_by)
           .annotate(s=Sum(field))
           .values("s")[:1])
    return Coalesce(Subquery(sub, output_field=DecimalField(max_digits=10, decimal_places=1)),
                    Value(0, output_field=DecimalField(max_digits=10, decimal_places=1)))


def object_or_404(source, **filters):
    """`get_object_or_404`, lekin yaroqsiz identifikator 500 emas, 404 beradi.

    MUAMMO. Manzildagi `pk` istalgan matn bo'lishi mumkin - marshrut shabloni
    `[^/.]+` hamma narsani o'tkazadi. `get_object_or_404(Task, pk="abc")`
    esa `Http404` emas, `ValueError: Field 'id' expected a number` beradi va
    foydalanuvchi 404 o'rniga 500 ko'radi (DEBUG yoqilgan bo'lsa - traceback
    bilan birga).

    Shuning uchun identifikator bilan bog'liq hamma qidiruv shu yerdan
    o'tadi: yaroqsiz qiymat oddiy "topilmadi" ga aylanadi.
    """
    from django.core.exceptions import ValidationError
    from django.http import Http404
    from django.shortcuts import get_object_or_404

    try:
        return get_object_or_404(source, **filters)
    except (ValueError, TypeError, ValidationError):
        raise Http404("Topilmadi.")


def int_param(value, name):
    """Query paramdagi butun son. Yaroqsiz qiymat 500 emas, 400 beradi.

    `object_or_404` faqat yo'l parametrlarini qamrab olgan edi. Filtrga esa
    qiymat tekshirilmasdan tushardi: `/api/tasks/?project=abc` so'rov
    bajarilganda `ValueError` bilan yiqilib, foydalanuvchi 500 ko'rardi
    (DEBUG yoqilgan bo'lsa - traceback bilan birga).
    """
    from rest_framework.exceptions import ValidationError as DrfValidationError

    try:
        return int(value)
    except (TypeError, ValueError):
        raise DrfValidationError({name: "Butun son kutilgan edi."})
