import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import { Loading } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import MyWork from "@/pages/MyWork";
import Projects from "@/pages/Projects";
import Discover from "@/pages/Discover";
import ProjectForm from "@/pages/ProjectForm";
import ProjectDetail from "@/pages/ProjectDetail";
import TaskDetail from "@/pages/TaskDetail";
import TaskForm from "@/pages/TaskForm";
import TaskBulkForm from "@/pages/TaskBulkForm";
import ReviewQueue from "@/pages/ReviewQueue";
import Feed from "@/pages/Feed";
import DeveloperReport from "@/pages/DeveloperReport";
import People from "@/pages/People";
import Workspaces from "@/pages/Workspaces";
import WorkspaceForm from "@/pages/WorkspaceForm";
import WorkspaceDetail from "@/pages/WorkspaceDetail";
import Profile from "@/pages/Profile";
import JoinProject from "@/pages/JoinProject";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading text="Yuklanmoqda..." />;
  if (!user) return <Navigate to="/kirish" replace />;
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
    <Routes>
      <Route path="/" element={<GuestOnly><Landing /></GuestOnly>} />
      <Route path="/kirish" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/royxatdan-otish" element={<GuestOnly><Register /></GuestOnly>} />

      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/panel" element={<Dashboard />} />
        <Route path="/mening-ishim" element={<MyWork />} />
        <Route path="/loyihalar" element={<Projects />} />
        <Route path="/qoshilish" element={<Discover />} />
        <Route path="/loyiha/yangi" element={<ProjectForm />} />
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
        <Route path="/jamoa" element={<People />} />
        <Route path="/ish-maydonlari" element={<Workspaces />} />
        <Route path="/ish-maydoni/yangi" element={<WorkspaceForm />} />
        <Route path="/ish-maydoni/:slug" element={<WorkspaceDetail />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/profil/:userId" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
  );
}
