/**
 * Marshrutlarda IDENTIFIKATOR YO'Q: `/loyiha/6` emas, `/loyiha`.
 *
 * Qaysi loyiha (yoki vazifa, odam, ish maydoni) ochilayotgani sahifa
 * holatida uzatiladi - `src/nav/index.ts` ga qarang. Shu sabab bu yerda
 * `:id` ham, `:taskId` ham, `:slug` ham yo'q.
 */
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import { Loading } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";

/**
 * Qolgan sahifalar talab bo'yicha yuklanadi.
 *
 * Ilgari hammasi bitta bog'lamda edi: kirish sahifasiga kelgan odam ham
 * taqvim, doska, chat va hisobot kodini yuklab olardi. Endi har sahifa
 * o'z bo'lagida - birinchi ochilish yengil, qolgani bosilganda keladi.
 */
const MyWork = lazy(() => import("@/pages/MyWork"));
const Projects = lazy(() => import("@/pages/Projects"));
const Discover = lazy(() => import("@/pages/Discover"));
const ProjectForm = lazy(() => import("@/pages/ProjectForm"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const TaskDetail = lazy(() => import("@/pages/TaskDetail"));
const TaskForm = lazy(() => import("@/pages/TaskForm"));
const TaskBulkForm = lazy(() => import("@/pages/TaskBulkForm"));
const ReviewQueue = lazy(() => import("@/pages/ReviewQueue"));
const Feed = lazy(() => import("@/pages/Feed"));
const CalendarPage = lazy(() => import("@/pages/Calendar"));
const DeveloperReport = lazy(() => import("@/pages/DeveloperReport"));
const People = lazy(() => import("@/pages/People"));
const Workspaces = lazy(() => import("@/pages/Workspaces"));
const WorkspaceForm = lazy(() => import("@/pages/WorkspaceForm"));
const WorkspaceDetail = lazy(() => import("@/pages/WorkspaceDetail"));
const Profile = lazy(() => import("@/pages/Profile"));
const JoinProject = lazy(() => import("@/pages/JoinProject"));
const Search = lazy(() => import("@/pages/Search"));
const PublicProject = lazy(() => import("@/pages/PublicProject"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Messages = lazy(() => import("@/pages/Messages"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminGate = lazy(() => import("@/pages/AdminGate"));
const WorkspaceChat = lazy(() => import("@/pages/WorkspaceChat"));

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading text="Yuklanmoqda..." />;
  if (!user) return <Navigate to="/kirish" replace />;
  return <>{children}</>;
}

/** Loyiha va ish maydoni ochish sahifalari - faqat menejer va admin uchun. */
function ManagerOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user?.can_create_project) return <Navigate to="/loyihalar" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/panel" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    // Sahifa bo'lagi yuklanayotganda - odatdagi "Yuklanmoqda".
    <Suspense fallback={<Loading text="Yuklanmoqda..." />}>
    <Routes>
      <Route path="/" element={<GuestOnly><Landing /></GuestOnly>} />
      {/* Ochiq sahifalar: kirmagan odam ham ko'radi */}
      <Route path="/qidiruv" element={<Search />} />
      <Route path="/ochiq-loyiha" element={<PublicProject />} />

      <Route path="/kirish" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/royxatdan-otish" element={<GuestOnly><Register /></GuestOnly>} />

      {/* Admin panel ALOHIDA shoxda: `Protected` ichida bo'lsa, kirmagan
          odam `/admin` deb yozganda kirish sahifasiga otib yuborilardi va
          «admin bo'lib kirish» degan yo'l umuman qolmasdi. Qorovul o'zi
          kirish oynasini ko'rsatadi, huquq bo'lsa esa panel odatdagi
          qobiq ichida ochiladi. */}
      <Route element={<AdminGate />}>
        <Route element={<Layout />}>
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Route>

      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/panel" element={<Dashboard />} />
        <Route path="/mening-ishim" element={<MyWork />} />
        <Route path="/loyihalar" element={<Projects />} />
        <Route path="/qoshilish" element={<Discover />} />
        {/* Aniq nomli marshrutlar `:tab` dan OLDIN turishi shart emas -
            React Router qat'iy bo'lakni har doim o'zgaruvchidan ustun
            qo'yadi - lekin o'qiganda tartib tushunarli bo'lsin. */}
        <Route path="/loyiha/yangi" element={<ManagerOnly><ProjectForm /></ManagerOnly>} />
        <Route path="/loyiha/tahrir" element={<ProjectForm />} />
        <Route path="/loyiha/qoshilish" element={<JoinProject />} />
        <Route path="/loyiha/vazifa-yaratish" element={<TaskForm />} />
        <Route path="/loyiha/koplab-vazifa" element={<TaskBulkForm />} />
        <Route path="/loyiha/dasturchi" element={<DeveloperReport />} />
        <Route path="/loyiha/:tab?" element={<ProjectDetail />} />
        <Route path="/vazifa/tahrir" element={<TaskForm />} />
        <Route path="/vazifa" element={<TaskDetail />} />
        <Route path="/tekshiruv" element={<ReviewQueue />} />
        <Route path="/tarix" element={<Feed />} />
        <Route path="/taqvim" element={<CalendarPage />} />
        <Route path="/jamoa" element={<People />} />
        <Route path="/ish-maydonlari" element={<Workspaces />} />
        <Route path="/ish-maydoni/yangi" element={<ManagerOnly><WorkspaceForm /></ManagerOnly>} />
        <Route path="/ish-maydoni/chat" element={<WorkspaceChat />} />
        <Route path="/ish-maydoni" element={<WorkspaceDetail />} />
        <Route path="/xabarlar" element={<Messages />} />
        <Route path="/bildirishnomalar" element={<Notifications />} />
        <Route path="/profil" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
    </Suspense>
  );
}
