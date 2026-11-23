import { Navigate, Route, Routes } from "react-router-dom";
import { Spin } from "antd";

import { useAuth } from "./auth/AuthContext";
import AppLayout from "./layouts/AppLayout";
import LoginPage from "./pages/LoginPage";
import PlaceholderPage from "./pages/PlaceholderPage";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Spin size="large" style={{ display: "block", marginTop: "40vh" }} />;
  }
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/live" element={<PlaceholderPage phase="Phase 1" />} />
        <Route path="/playback" element={<PlaceholderPage phase="Phase 2" />} />
        <Route path="/alerts" element={<PlaceholderPage phase="Phase 3" />} />
        <Route path="/devices" element={<PlaceholderPage phase="Phase 1" />} />
        <Route path="/users" element={<PlaceholderPage phase="Phase 1" />} />
        <Route path="*" element={<Navigate to="/live" replace />} />
      </Route>
    </Routes>
  );
}
