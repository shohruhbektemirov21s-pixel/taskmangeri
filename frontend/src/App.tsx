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
      <Route path="/ochiq-loyiha/:id" element={<PublicProject />} />

      <Route path="/kirish" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/royxatdan-otish" element={<GuestOnly><Register /></GuestOnly>} />

      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/panel" element={<Dashboard />} />
        <Route path="/mening-ishim" element={<MyWork />} />
        <Route path="/loyihalar" element={<Projects />} />
        <Route path="/qoshilish" element={<Discover />} />
        <Route path="/loyiha/yangi" element={<ManagerOnly><ProjectForm /></ManagerOnly>} />
        <Route path="/loyiha/:id/tahrir" element={<ProjectForm />} />
        <Route path="/loyiha/:id/qoshilish" element={<JoinProject />} />
        <Route path="/loyiha/:id/vazifa-yaratish" element={<TaskForm />} />
        <Route path="/loyiha/:id/koplab-vazifa" element={<TaskBulkForm />} />
        <Route path="/loyiha/:id/dasturchi/:userId" element={<DeveloperReport />} />
        <Route path="/loyiha/:id/:tab?" element={<ProjectDetail />} />
        <Route path="/vazifa/:taskId" element={<TaskDetail />} />
        <Route path="/vazifa/:taskId/tahrir" element={<TaskForm />} />
        <Route path="/tekshiruv" element={<ReviewQueue />} />
        <Route path="/tarix" element={<Feed />} />
        <Route path="/taqvim" element={<CalendarPage />} />
        <Route path="/jamoa" element={<People />} />
        <Route path="/ish-maydonlari" element={<Workspaces />} />
        <Route path="/ish-maydoni/yangi" element={<ManagerOnly><WorkspaceForm /></ManagerOnly>} />
        <Route path="/ish-maydoni/:slug/chat" element={<WorkspaceChat />} />
        <Route path="/ish-maydoni/:slug" element={<WorkspaceDetail />} />
        <Route path="/xabarlar" element={<Messages />} />
        <Route path="/xabarlar/:userId" element={<Messages />} />
        <Route path="/bildirishnomalar" element={<Notifications />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/profil/:userId" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
    </Suspense>
  );
}
