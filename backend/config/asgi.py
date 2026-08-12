import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Django ilovasi Channels marshrutlaridan OLDIN yuklanishi shart:
# quyidagi importlar model va sozlamalarga tegadi.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from apps.chat.routing import websocket_urlpatterns as chat_ws  # noqa: E402
from apps.notifications.routing import websocket_urlpatterns as notification_ws  # noqa: E402
from config.ws_auth import JWTAuthMiddleware  # noqa: E402

# Ikki qatlamli himoya:
#  1) AllowedHostsOriginValidator - begona saytdan kelgan ulanishni rad etadi
#     (Origin ALLOWED_HOSTS bilan solishtiriladi);
#  2) JWTAuthMiddleware - tokensiz yoki yaroqsiz token bilan ulanib bo'lmaydi.
application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        JWTAuthMiddleware(URLRouter(notification_ws + chat_ws))
    ),
})
