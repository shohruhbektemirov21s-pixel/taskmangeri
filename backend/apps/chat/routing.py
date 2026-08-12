from django.urls import path

from .consumers import ChatConsumer

websocket_urlpatterns = [
    path("ws/chat/<str:scope>/<int:scope_id>/", ChatConsumer.as_asgi()),
]
