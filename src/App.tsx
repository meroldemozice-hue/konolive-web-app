import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { VideoCallProvider } from '@/contexts/VideoCallContext';
import FloatingVideoCall from '@/components/video/FloatingVideoCall';
import { routes } from './routes';

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Router>
        <AuthProvider>
          {/* VideoCallProvider encapsule toute l'app : l'appel survit à la navigation */}
          <VideoCallProvider>
            <Routes>
              {routes.map((route, index) => (
                <Route key={index} path={route.path} element={route.element} />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            {/* Fenêtre flottante montée une seule fois — persistante entre toutes les pages */}
            <FloatingVideoCall />
            <Toaster richColors position="top-right" />
          </VideoCallProvider>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
};

export default App;
