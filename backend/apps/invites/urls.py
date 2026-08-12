from rest_framework.routers import DefaultRouter

from .api import InvitationViewSet

router = DefaultRouter()
router.register("invitations", InvitationViewSet, basename="invitation")

urlpatterns = router.urls
