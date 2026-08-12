from rest_framework.routers import DefaultRouter

from .api import MyJoinRequestViewSet, ProjectViewSet

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")
router.register("my-requests", MyJoinRequestViewSet, basename="my-request")

urlpatterns = router.urls
