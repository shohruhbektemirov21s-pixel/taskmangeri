"""Panel va hisobotlar — bir necha domen ustidan o'qiydigan ko'rinishlar.

NEGA ALOHIDA ILOVA. Bu kod ilgari `apps.core` ichida edi va `core` ni
buzib turardi: `core` eng pastki qatlam bo'lishi kerak (Db2 adapteri,
umumiy maydonlar, so'rov yordamchilari), lekin panel kodi `accounts`,
`activity`, `projects`, `tasks` va `workspaces` ga bog'langan edi. Ya'ni
poydevor o'zining ustidagi qavatlarga suyanib turardi.

Buning izi kodda ko'rinib turardi: `core` ichida o'n to'qqizta modul
darajasidagi domen importi va **qirq ikkita** funksiya ichiga yashirilgan
kechiktirilgan import bor edi — ular aynan halqani sindirish uchun
qo'yilgan. Halqa esa amalda ham zarar qilardi: `apps.projects` oddiy sana
hisobi uchun butun panel modulini import qilib olardi.

Endi yo'nalish bitta:

    panel  ->  projects, tasks, activity, accounts, workspaces  ->  core

`panel` da model yo'q va unga hech kim bog'lanmaydi — u eng ustki qavat.
Sof kalendar hisobi (`due_span`, `_period_start`) esa `core.periods` da
qoldi: unda domen yo'q va u loyihalar ro'yxatiga ham kerak.

Marshrutlar o'zgarmadi: `/api/dashboard/`, `/api/my-work/`, `/api/team/…`,
`/api/public/…` — hammasi o'z joyida.
"""

default_app_config = "apps.panel.apps.PanelConfig"
