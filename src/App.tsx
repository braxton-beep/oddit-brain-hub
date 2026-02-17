import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import AuditBrain from "./pages/AuditBrain";
import Reports from "./pages/Reports";
import DevPipeline from "./pages/DevPipeline";
import SlackAgent from "./pages/SlackAgent";
import Integrations from "./pages/Integrations";
import Vision from "./pages/Vision";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { WelcomeTour } from "./components/WelcomeTour";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <WelcomeTour />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Index />} />
          <Route path="/oddit-brain" element={<AuditBrain />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/dev-pipeline" element={<DevPipeline />} />
          <Route path="/slack-agent" element={<SlackAgent />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/vision" element={<Vision />} />
          <Route path="/auth" element={<Auth />} />

          {/* Protected: only Settings requires login */}
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
