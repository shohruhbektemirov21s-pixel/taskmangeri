"""Media manzillari - proksi ortida ham brauzer ocha oladigan ko'rinishda.

MUAMMO. `request.build_absolute_uri()` manzilni `Host` headeridan yasaydi.
Interfeys backendga to'g'ridan-to'g'ri emas, Vite proksisi orqali murojaat
qiladi va u `changeOrigin: true` bilan `Host` ni target nomiga - `backend:8000`
ga - almashtiradi. Natijada javobda `http://backend:8000/media/...` ketadi.
Bu Docker tarmog'i ichidagi nom: brauzer uni umuman yecha olmaydi, shuning
uchun rasm ochilmaydi va yuklangan fayl havolasi ishlamaydi.

YECHIM. Nisbiy manzil qaytaramiz: `/media/tasks/22/rasm.png`. Brauzer uni o'zi
turgan manzilga nisbatan yechadi, `/media` esa dev-proksida ham, produksiyadagi
nginx da ham backendga uzatiladi. Shu bilan manzil qaysi host orqali kelishidan
mustaqil bo'ladi - `USE_X_FORWARDED_HOST` kabi sozlamalarga tayanish shart emas.
"""


def media_url(fieldfile):
    """FileField/ImageField uchun nisbiy manzil (yoki fayl yo'q bo'lsa None)."""
    if not fieldfile:
        return None
    try:
        return fieldfile.url
    except ValueError:
        # Fayl biriktirilmagan bo'lsa `.url` ValueError beradi.
        return None
