from rest_framework.routers import DefaultRouter

from .api import WorkspaceViewSet

router = DefaultRouter()
router.register("workspaces", WorkspaceViewSet, basename="workspace")

urlpatterns = router.urls
