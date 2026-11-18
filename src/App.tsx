import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastProvider";
import { DiagnosticsButton, Spinner, Toaster } from "./components/ui";
import { homeFor } from "./lib/home";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PsychologistsPage } from "./pages/admin/PsychologistsPage";
import { StudentsPage } from "./pages/StudentsPage";
import { GroupsPage } from "./pages/GroupsPage";
import { TestsPage } from "./pages/TestsPage";
import { LibraryPage } from "./pages/LibraryPage";
import { TestBuilderPage } from "./pages/TestBuilderPage";
import { ImportPage } from "./pages/ImportPage";
import { ImportReviewPage } from "./pages/ImportReviewPage";
import { TestPreviewPage } from "./pages/TestPreviewPage";
import { AssignmentsPage } from "./pages/AssignmentsPage";
import { ResultsPage } from "./pages/ResultsPage";
import { ResultDetailPage } from "./pages/ResultDetailPage";
import { MyTestsPage } from "./pages/student/MyTestsPage";
import { TakeTestPage } from "./pages/student/TakeTestPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { Role } from "./types";

function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-cream">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-forest-800 text-white">
          <span className="font-display text-lg">P</span>
        </div>
        <Spinner label="Yuklanmoqda..." />
      </div>
    </div>
  );
}

function RoleGate({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  const { profile } = useAuth();
  if (!profile) return null;
  if (!roles.includes(profile.role))
    return <Navigate to={homeFor(profile.role)} replace />;
  return <>{children}</>;
}

function Protected() {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!session)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!profile) return <NoProfile />;
  if (profile.is_blocked) return <BlockedPage />;
  return (
    <AppLayout>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route
          path="dashboard"
          element={<Navigate to={homeFor(profile.role)} replace />}
        />
        <Route
          path="psychologists"
          element={
            <RoleGate roles={["admin"]}>
              <PsychologistsPage />
            </RoleGate>
          }
        />
        <Route
          path="students"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <StudentsPage />
            </RoleGate>
          }
        />
        <Route
          path="groups"
          element={
            <RoleGate roles={["psychologist"]}>
              <GroupsPage />
            </RoleGate>
          }
        />
        <Route
          path="tests"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <TestsPage />
            </RoleGate>
          }
        />
        <Route
          path="tests/new"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <TestBuilderPage />
            </RoleGate>
          }
        />
        <Route
          path="tests/import"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <ImportPage />
            </RoleGate>
          }
        />
        <Route
          path="tests/import/review"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <ImportReviewPage />
            </RoleGate>
          }
        />
        <Route
          path="tests/:id/edit"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <TestBuilderPage />
            </RoleGate>
          }
        />
        <Route
          path="tests/:id"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <TestPreviewPage />
            </RoleGate>
          }
        />
        <Route
          path="library"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <LibraryPage />
            </RoleGate>
          }
        />
        <Route
          path="assignments"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <AssignmentsPage />
            </RoleGate>
          }
        />
        <Route
          path="results"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <ResultsPage />
            </RoleGate>
          }
        />
        <Route
          path="results/:id"
          element={
            <RoleGate roles={["admin", "psychologist"]}>
              <ResultDetailPage />
            </RoleGate>
          }
        />
        <Route
          path="my-tests"
          element={
            <RoleGate roles={["student"]}>
              <MyTestsPage />
            </RoleGate>
          }
        />
        <Route
          path="take/:assignmentId"
          element={
            <RoleGate roles={["student"]}>
              <TakeTestPage />
            </RoleGate>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AppLayout>
  );
}

function NoProfile() {
  const { signOut } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-cream px-5">
      <div className="card max-w-md p-8 text-center">
        <h2 className="font-display text-2xl text-forest-950">
          Profil topilmadi
        </h2>
        <p className="mt-2 text-sm text-ink/55">
          Sizning akkauntingiz uchun profil yaratilmagan yoki akkaunt
          o‘chirilgan. Administrator bilan bog‘laning.
        </p>
        <button className="btn-primary mt-6" onClick={signOut}>
          Chiqish
        </button>
      </div>
    </div>
  );
}

function BlockedPage() {
  const { signOut, profile } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-cream px-5">
      <div className="card max-w-md p-8 text-center">
        <h2 className="font-display text-2xl text-forest-950">
          Akkaunt bloklangan
        </h2>
        <p className="mt-2 text-sm text-ink/55">
          {profile?.full_name || "Akkauntingiz"} vaqtincha bloklangan. Kirish
          uchun administrator bilan bog‘laning.
        </p>
        <button className="btn-primary mt-6" onClick={signOut}>
          Chiqish
        </button>
      </div>
    </div>
  );
}

function Root() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile || profile.is_blocked) return <Protected />;
  return <Navigate to="/app" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/login" element={<LoginRedirect />} />
            <Route path="/app/*" element={<Protected />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <DiagnosticsButton />
          <Toaster />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function LoginRedirect() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (session) return <Navigate to="/app" replace />;
  return <LoginPage />;
}
