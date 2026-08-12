from rest_framework.routers import DefaultRouter

from .api import LabelViewSet, TaskViewSet

router = DefaultRouter()
router.register("tasks", TaskViewSet, basename="task")
router.register("labels", LabelViewSet, basename="label")

urlpatterns = router.urls
