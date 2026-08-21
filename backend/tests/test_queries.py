"""So'rovlar soni ma'lumot hajmiga bog'liq bo'lmasligi kerak (N+1 qulfi).

Ilgari ro'yxatlar har qator uchun qo'shimcha so'rov yuborardi: panel uchun
67 ta, loyihalar ro'yxati uchun 33 ta - bor-yo'g'i uchta loyiha va beshta
vazifada. Bu testlar aynan shuni ushlaydi: qatorlar ko'paysa ham so'rovlar
soni o'zgarmasligi shart.
"""

from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskAssignment

from .base import ApiTestCase


class QueryCountTest(ApiTestCase):

    def make_projects(self, n):
        for i in range(n):
            p = Project.objects.create(
                workspace=self.workspace, name="Qo'shimcha %d" % i,
                manager=self.manager, created_by=self.manager)
            ProjectMember.objects.create(project=p, user=self.manager,
                                         role=ProjectRole.MANAGER)
            ProjectMember.objects.create(project=p, user=self.dev,
                                         role=ProjectRole.DEVELOPER)

    def make_tasks(self, n):
        for i in range(n):
            t = Task.objects.create(project=self.project, title="Ish %d" % i,
                                    created_by=self.manager)
            TaskAssignment.objects.create(task=t, user=self.dev)

    def count_for(self, url):
        from django.db import connection, reset_queries

        reset_queries()
        r = self.api.get(url)
        self.assertEqual(r.status_code, 200, url)
        return len(connection.queries)

    def assert_flat(self, url, grow):
        """`grow(n)` qator qo'shadi; so'rovlar soni o'zgarmasligi kerak.

        Bo'sh ro'yxatdan boshlab bo'lmaydi: seriyalizator umuman
        chaqirilmaydi va o'lchov noto'g'ri chiqadi. Shuning uchun avval
        bir nechta qator yasaladi, keyin ular ko'paytiriladi.
        """
        with self.settings(DEBUG=True):
            grow(3)
            # Isitish: kunlik eslatma "tick" i kabi kuniga bir marta
            # bajariladigan ishlar birinchi o'lchovga tushib qolmasin -
            # ular so'rov sonini bir martagina o'zgartirib, testni
            # ma'lumot hajmiga aloqasiz sabab bilan yiqitardi.
            self.api.get(url)
            base = self.count_for(url)
            grow(9)
            after = self.count_for(url)
        self.assertEqual(
            after, base,
            "%s: qator ko'paygach so'rov %d dan %d ga chiqdi (N+1)" % (url, base, after))

    def make_workspaces(self, n):
        from apps.workspaces.models import Workspace, WorkspaceMember

        for i in range(n):
            ws = Workspace.objects.create(name="Maydon %d" % i, owner=self.admin,
                                          is_open=True)
            WorkspaceMember.objects.create(workspace=ws, user=self.manager)

    def test_loyihalar_royxati(self):
        self.assert_flat("/api/projects/?page_size=100", self.make_projects)

    def test_vazifalar_royxati(self):
        self.assert_flat("/api/tasks/?page_size=100", self.make_tasks)

    def test_panel(self):
        self.assert_flat("/api/dashboard/", self.make_projects)

    def test_mening_ishim(self):
        self.assert_flat("/api/my-work/", self.make_tasks)

    def test_ish_maydonlari_royxati(self):
        """`my_role` va `can_manage` har qator uchun bazaga bormasin.

        Ikkovi ham a'zolikni so'raydi va ilgari ikkovi ham alohida so'rov
        yuborardi - ya'ni o'nta maydon yigirmata qo'shimcha so'rov edi.
        """
        self.assert_flat("/api/workspaces/?page_size=100", self.make_workspaces)

    def test_tarix(self):
        def grow(n):
            from apps.activity.models import Activity
            for i in range(n):
                Activity.objects.create(actor=self.manager, project=self.project,
                                        verb="task.created", summary="Yozuv %d" % i)
        self.assert_flat("/api/activity/?page_size=100", grow)
