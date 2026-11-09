import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/layouts/AppLayout";
import { LoadingBlock } from "@/components/ui/misc";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import DoctorChat from "@/pages/DoctorChat";
import HealthProfile from "@/pages/HealthProfile";
import MedicalHistory from "@/pages/MedicalHistory";
import Symptoms from "@/pages/Symptoms";
import Measurements from "@/pages/Measurements";
import HealthRecords from "@/pages/HealthRecords";
import Medications from "@/pages/Medications";
import Appointments from "@/pages/Appointments";
import Analytics from "@/pages/Analytics";
import SettingsPage from "@/pages/Settings";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <LoadingBlock label="Loading Personal Doctor AI…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingBlock />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route element={<Protected><AppLayout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="ai-doctor" element={<DoctorChat />} />
        <Route path="ai-doctor/:conversationId" element={<DoctorChat />} />
        <Route path="health" element={<Navigate to="/health/profile" replace />} />
        <Route path="health/profile" element={<HealthProfile />} />
        <Route path="health/history" element={<MedicalHistory />} />
        <Route path="health/symptoms" element={<Symptoms />} />
        <Route path="health/measurements" element={<Measurements />} />
        <Route path="records" element={<HealthRecords />} />
        <Route path="medications" element={<Medications />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
