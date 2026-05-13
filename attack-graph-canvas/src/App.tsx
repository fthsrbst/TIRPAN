import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/lib/SessionContext";
import { ThemeInit } from "@/lib/ThemeInit";
import Overview from "./pages/Overview";
import Missions from "./pages/Missions";
import AttackGraphPage from "./pages/AttackGraphPage";
import ExpertLogPage from "./pages/ExpertLogPage";
import Agents from "./pages/Agents";
import Hosts from "./pages/Hosts";
import Findings from "./pages/Findings";
import Credentials from "./pages/Credentials";
import Reports from "./pages/Reports";
import Pipelines from "./pages/Pipelines";
import TerminalPage from "./pages/TerminalPage";
import Exploits from "./pages/Exploits";
import SettingsPage from "./pages/SettingsPage";
import NewMission from "./pages/NewMission";
import V3IntelPage from "./pages/V3Intel";
import NotFound from "./pages/NotFound.tsx";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import InvitePage from "./pages/InvitePage";
import TeamPage from "./pages/TeamPage";
import DemoEntry from "./pages/DemoEntry";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SessionProvider>
        <ThemeInit />
        <Toaster />
        <Sonner position="bottom-right" richColors />
        <BrowserRouter basename="/normal">
          <Routes>
            <Route path="/demo" element={<DemoEntry />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute minRole="admin"><TeamPage /></ProtectedRoute>} />
            <Route path="/missions" element={<ProtectedRoute><Missions /></ProtectedRoute>} />
<Route path="/attack-graph" element={<ProtectedRoute><AttackGraphPage /></ProtectedRoute>} />
<Route path="/expert-log" element={<ProtectedRoute><ExpertLogPage /></ProtectedRoute>} />
<Route path="/agents" element={<ProtectedRoute><Agents /></ProtectedRoute>} />
            <Route path="/hosts" element={<ProtectedRoute><Hosts /></ProtectedRoute>} />
            <Route path="/findings" element={<ProtectedRoute><Findings /></ProtectedRoute>} />
            <Route path="/credentials" element={<ProtectedRoute><Credentials /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/pipelines" element={<ProtectedRoute><Pipelines /></ProtectedRoute>} />
            <Route path="/terminal" element={<ProtectedRoute minRole="analyst"><TerminalPage /></ProtectedRoute>} />
            <Route path="/exploits" element={<ProtectedRoute><Exploits /></ProtectedRoute>} />
            <Route path="/v3-intel" element={<ProtectedRoute><V3IntelPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/missions/new" element={<ProtectedRoute minRole="analyst"><NewMission /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
