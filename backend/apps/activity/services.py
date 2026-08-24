"""Tarixni yozish uchun yagona kirish nuqtasi.

Barcha viewlar shu funksiyani chaqiradi - shunda tarix bir xil formatda,
tola va ishonchli boladi.
"""
import logging

from apps.core.text import clip

logger = logging.getLogger(__name__)


def log(actor=None, verb="", summary="", *, project=None, task=None, workspace=None,
        target=None, detail="", meta=None):
    from .models import Activity

    if task is not None and project is None:
        project = task.project
    if project is not None and workspace is None:
        workspace = project.workspace

    # Kesish BAYT bo'yicha - Db2 da `CharField` ning o'lchovi shunday
    # (`apps.core.text`). Ilgari bu yerda `summary[:300]` turardi, ya'ni
    # BELGI bo'yicha: o'zbekcha matndagi «ʻ» va «—» ikki-uch bayt bo'lgani
    # uchun 300 belgilik sarlavha 300 baytdan oshib ketardi va yozuv
    # `SQL0302N` bilan yiqilardi. Pastdagi `except` esa uni yutardi -
    # natijada eng uzun, ya'ni eng mazmunli audit yozuvlari jurnalga
    # umuman kirmasdi va buni hech kim sezmasdi.
    try:
        return Activity.objects.create(
            actor=actor if (actor and getattr(actor, "pk", None)) else None,
            verb=clip(verb, 50),
            summary=clip(summary, 300),
            detail=detail or "",
            meta=meta or {},
            project=project,
            task=task,
            workspace=workspace,
            target_label=clip(str(target), 200) if target is not None else "",
        )
    except Exception:  # tarix yozilmasa ham asosiy amal buzilmasin
        # DIQQAT: bu yerda yutilgan xato jimgina YO'QOLGAN audit yozuvi
        # degani. Log - yagona iz, shuning uchun u `exception` darajasida
        # va matnida `verb` bor: nima yozilmagani bilinsin.
        logger.exception("Tarixga yozib bolmadi: %s", verb)
        return None


def log_field_changes(actor, task, changes):
    """Task maydonlari ozgarganda birma-bir emas, bitta yozuvda saqlaymiz."""
    if not changes:
        return None
    parts = []
    for field, (old, new) in changes.items():
        parts.append("{}: {} -> {}".format(field, old or "-", new or "-"))
    return log(
        actor=actor, verb="task.updated", task=task,
        summary="{} yangilandi".format(task.code),
        detail="; ".join(parts),
        meta={"changes": {k: [str(v[0]), str(v[1])] for k, v in changes.items()}},
    )
