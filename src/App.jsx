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

import Webinars from '@/pages/Webinars';
import Settings from '@/pages/Settings';
import MarketingHub from '@/pages/MarketingHub';
import BotContentPage from '@/pages/BotContentPage';
import ServiceContentPage from '@/pages/ServiceContentPage';


import ServiceRequestDetail from '@/pages/ServiceRequestDetail';
import ScheduleMeeting from '@/pages/ScheduleMeeting';
import SignDocument from '@/pages/SignDocument';
import WebinarLanding from '@/pages/WebinarLanding';
import LandingPagesAdmin from '@/pages/LandingPagesAdmin';


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
        <Route path="/service-requests/:id" element={<ServiceRequestDetail />} />
        <Route path="/meetings" element={<Meetings />} />

        <Route path="/webinars" element={<Webinars />} />
        <Route path="/landing-pages" element={<LandingPagesAdmin />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/marketing" element={<MarketingHub />} />
        <Route path="/bot-content" element={<BotContentPage />} />
        <Route path="/service-content" element={<ServiceContentPage />} />

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
          <Routes>
            {/* Public routes — no auth required */}
            <Route path="/schedule" element={<ScheduleMeeting />} />
            <Route path="/sign" element={<SignDocument />} />
            <Route path="/webinar/:slug" element={<WebinarLanding />} />
            <Route path="*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App;