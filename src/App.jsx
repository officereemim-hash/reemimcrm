import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from '@/components/Layout';

// Pages
import Dashboard from '@/pages/Dashboard';
import Contacts from '@/pages/Contacts';
import ContactDetail from '@/pages/ContactDetail';
import LeadsPipeline from '@/pages/LeadsPipeline';
import ServiceRequests from '@/pages/ServiceRequests';
import Meetings from '@/pages/Meetings';
import Communications from '@/pages/Communications';
import Webinars from '@/pages/Webinars';
import ExcelImports from '@/pages/ExcelImports';
import Settings from '@/pages/Settings';
import MarketingHub from '@/pages/MarketingHub';
import BotContentPage from '@/pages/BotContentPage';
import ServiceContentPage from '@/pages/ServiceContentPage';
import BotSettingsPage from '@/pages/BotSettingsPage';
import BotChat from '@/pages/BotChat';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/:id" element={<ContactDetail />} />
        <Route path="/pipeline" element={<LeadsPipeline />} />
        <Route path="/service-requests" element={<ServiceRequests />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/communications" element={<Communications />} />
        <Route path="/webinars" element={<Webinars />} />
        <Route path="/excel-imports" element={<ExcelImports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/marketing" element={<MarketingHub />} />
        <Route path="/bot-content" element={<BotContentPage />} />
        <Route path="/service-content" element={<ServiceContentPage />} />
        <Route path="/bot-settings" element={<BotSettingsPage />} />
        <Route path="/bot-chat" element={<BotChat />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App;