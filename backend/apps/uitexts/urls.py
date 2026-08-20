from django.urls import path

from . import api

urlpatterns = [
    # Ochiq: kirish sahifasining so'zlari ham shu yerdan keladi.
    path("ui-texts/", api.ui_texts, name="ui_texts"),
]
