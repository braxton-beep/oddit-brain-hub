import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AuditBrain from "./pages/AuditBrain";
import Reports from "./pages/Reports";
import DevPipeline from "./pages/DevPipeline";
import SlackAgent from "./pages/SlackAgent";
import Integrations from "./pages/Integrations";
import Vision from "./pages/Vision";
import SettingsPage from "./pages/Settings";
import CompetitiveIntel from "./pages/CompetitiveIntel";
import BenchmarkExplorer from "./pages/BenchmarkExplorer";
import ClientPortal from "./pages/ClientPortal";
import Clients from "./pages/Clients";
import TwitterPage from "./pages/TwitterPage";
import ReportSetup from "./pages/ReportSetup";
import OrderIntake from "./pages/OrderIntake";
import OrderSuccess from "./pages/OrderSuccess";
import CroAgent from "./pages/CroAgent";
import ShopifyConnect from "./pages/ShopifyConnect";
import Wireframes from "./pages/Wireframes";
import LeadGen from "./pages/LeadGen";
import Demo from "./pages/Demo";
import NotFound from "./pages/NotFound";
import { WelcomeTour } from "./components/WelcomeTour";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <WelcomeTour />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/oddit-brain" element={<AuditBrain />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/dev-pipeline" element={<DevPipeline />} />
          <Route path="/slack-agent" element={<SlackAgent />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/vision" element={<Vision />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/competitive-intel" element={<CompetitiveIntel />} />
          <Route path="/benchmarks" element={<BenchmarkExplorer />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/twitter" element={<TwitterPage />} />
          <Route path="/report-setup" element={<ReportSetup />} />
          <Route path="/order" element={<OrderIntake />} />
          <Route path="/order-success" element={<OrderSuccess />} />
          <Route path="/cro-agent" element={<CroAgent />} />
          <Route path="/shopify-connect" element={<ShopifyConnect />} />
          <Route path="/wireframes" element={<Wireframes />} />
          <Route path="/lead-gen" element={<LeadGen />} />
          <Route path="/portal/:token" element={<ClientPortal />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;


