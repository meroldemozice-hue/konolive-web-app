import React, { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { RouteGuard } from '@/components/common/RouteGuard';

// ── Chargement différé de toutes les pages (code splitting par route) ─────────
// Réduit le bundle initial de ~70% — seule la page active est chargée

// Auth (gardées en eager — point d'entrée critique)
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

// Applicant
const ApplicantDashboard        = lazy(() => import('@/pages/applicant/ApplicantDashboard'));
const NewRequestPage            = lazy(() => import('@/pages/applicant/NewRequestPage'));
const RequestHistoryPage        = lazy(() => import('@/pages/applicant/RequestHistoryPage'));
const RequestDetailPage         = lazy(() => import('@/pages/applicant/RequestDetailPage'));
const ApplicantMessagesPage     = lazy(() => import('@/pages/applicant/ApplicantMessagesPage'));
const NotificationsPage         = lazy(() => import('@/pages/applicant/NotificationsPage'));

// Agent
const AgentDashboard            = lazy(() => import('@/pages/agent/AgentDashboard'));
const ProcessRequestPage        = lazy(() => import('@/pages/agent/ProcessRequestPage'));
const AgentMessagesPage         = lazy(() => import('@/pages/agent/AgentMessagesPage'));
const AgentHistoryPage          = lazy(() => import('@/pages/agent/AgentHistoryPage'));
const AgentMonthlyTrackingPage  = lazy(() => import('@/pages/agent/AgentMonthlyTrackingPage'));
const AgentDailyEvolutionPage   = lazy(() => import('@/pages/agent/AgentDailyEvolutionPage'));
const AgentSettingsPage         = lazy(() => import('@/pages/agent/AgentSettingsPage'));

// Supervisor
const SupervisorDashboard       = lazy(() => import('@/pages/supervisor/SupervisorDashboard'));
const SupervisorAgentStatsPage  = lazy(() => import('@/pages/supervisor/SupervisorAgentStatsPage'));
const SupervisorRequestsPage    = lazy(() => import('@/pages/supervisor/SupervisorRequestsPage'));
const SupervisorReportsPage     = lazy(() => import('@/pages/supervisor/SupervisorReportsPage'));
const SupervisorProcessingTimePage = lazy(() => import('@/pages/supervisor/SupervisorProcessingTimePage'));
const AgentStatusPage           = lazy(() => import('@/pages/supervisor/AgentStatusPage'));
const SupervisorSettingsPage    = lazy(() => import('@/pages/supervisor/SupervisorSettingsPage'));
const SupervisorHistoryPage     = lazy(() => import('@/pages/supervisor/SupervisorHistoryPage'));
const PublicSupervisorDashboard = lazy(() => import('@/pages/supervisor/PublicSupervisorDashboard'));

// Discussion
const DiscussionPage            = lazy(() => import('@/pages/discussion/DiscussionPage'));

// Admin
const AdminDashboard            = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminUsersPage            = lazy(() => import('@/pages/admin/AdminUsersPage'));
const AdminRequestsPage         = lazy(() => import('@/pages/admin/AdminRequestsPage'));
const AdminLogsPage             = lazy(() => import('@/pages/admin/AdminLogsPage'));
const AdminStatsPage            = lazy(() => import('@/pages/admin/AdminStatsPage'));
const AdminConfigPage           = lazy(() => import('@/pages/admin/AdminConfigPage'));
const AdminHistoryPage          = lazy(() => import('@/pages/admin/AdminHistoryPage'));
const AdminAccountPage          = lazy(() => import('@/pages/admin/AdminAccountPage'));

// ── Fallback spinner ──────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Helper pour envelopper chaque page lazy dans Suspense ────────────────────
function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export interface RouteConfig {
  path: string;
  element: React.ReactNode;
}

export const routes: RouteConfig[] = [
  // Public
  { path: '/login',    element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },

  // Applicant
  { path: '/dashboard',                element: <RouteGuard allowedRoles={['applicant']}><S><ApplicantDashboard /></S></RouteGuard> },
  { path: '/dashboard/new-request',    element: <RouteGuard allowedRoles={['applicant']}><S><NewRequestPage /></S></RouteGuard> },
  { path: '/dashboard/requests',       element: <RouteGuard allowedRoles={['applicant']}><S><RequestHistoryPage /></S></RouteGuard> },
  { path: '/dashboard/requests/:id',   element: <RouteGuard allowedRoles={['applicant']}><S><RequestDetailPage /></S></RouteGuard> },
  { path: '/dashboard/messages',       element: <RouteGuard allowedRoles={['applicant']}><S><ApplicantMessagesPage /></S></RouteGuard> },
  { path: '/dashboard/notifications',  element: <RouteGuard allowedRoles={['applicant']}><S><NotificationsPage /></S></RouteGuard> },

  // Agent
  { path: '/agent',              element: <RouteGuard allowedRoles={['agent']}><S><AgentDashboard /></S></RouteGuard> },
  { path: '/agent/process/:id',  element: <RouteGuard allowedRoles={['agent']}><S><ProcessRequestPage /></S></RouteGuard> },
  { path: '/agent/messages',     element: <RouteGuard allowedRoles={['agent']}><S><AgentMessagesPage /></S></RouteGuard> },
  { path: '/agent/history',      element: <RouteGuard allowedRoles={['agent']}><S><AgentHistoryPage /></S></RouteGuard> },
  { path: '/agent/monthly-tracking', element: <RouteGuard allowedRoles={['agent']}><S><AgentMonthlyTrackingPage /></S></RouteGuard> },
  { path: '/agent/daily-evolution', element: <RouteGuard allowedRoles={['agent']}><S><AgentDailyEvolutionPage /></S></RouteGuard> },
  { path: '/agent/settings',     element: <RouteGuard allowedRoles={['agent']}><S><AgentSettingsPage /></S></RouteGuard> },
  { path: '/agent/notifications',element: <RouteGuard allowedRoles={['agent']}><S><NotificationsPage /></S></RouteGuard> },

  // Discussion
  { path: '/discussion', element: <RouteGuard allowedRoles={['agent','supervisor','admin']}><S><DiscussionPage /></S></RouteGuard> },

  // Supervisor
  { path: '/supervisor',                    element: <RouteGuard allowedRoles={['supervisor','admin']}><S><SupervisorDashboard /></S></RouteGuard> },
  { path: '/supervisor/stats',              element: <RouteGuard allowedRoles={['supervisor','admin']}><S><SupervisorDashboard /></S></RouteGuard> },
  { path: '/supervisor/agents',             element: <RouteGuard allowedRoles={['supervisor','admin']}><S><SupervisorAgentStatsPage /></S></RouteGuard> },
  { path: '/supervisor/agents-status',      element: <RouteGuard allowedRoles={['supervisor','admin']}><S><AgentStatusPage /></S></RouteGuard> },
  { path: '/supervisor/requests',           element: <RouteGuard allowedRoles={['supervisor','admin']}><S><SupervisorRequestsPage /></S></RouteGuard> },
  { path: '/supervisor/processing-time',    element: <RouteGuard allowedRoles={['supervisor','admin']}><S><SupervisorProcessingTimePage /></S></RouteGuard> },
  { path: '/supervisor/history',            element: <RouteGuard allowedRoles={['supervisor','admin']}><S><SupervisorHistoryPage /></S></RouteGuard> },
  { path: '/supervisor/reports',            element: <RouteGuard allowedRoles={['supervisor','admin']}><S><SupervisorReportsPage /></S></RouteGuard> },
  { path: '/supervisor/settings',           element: <RouteGuard allowedRoles={['supervisor','admin']}><S><SupervisorSettingsPage /></S></RouteGuard> },

  // Public Supervisor Dashboard
  { path: '/public/dashboard/:token',       element: <S><PublicSupervisorDashboard /></S> },

  // Admin
  { path: '/admin',          element: <RouteGuard allowedRoles={['admin']}><S><AdminDashboard /></S></RouteGuard> },
  { path: '/admin/users',    element: <RouteGuard allowedRoles={['admin']}><S><AdminUsersPage /></S></RouteGuard> },
  { path: '/admin/requests', element: <RouteGuard allowedRoles={['admin']}><S><AdminRequestsPage /></S></RouteGuard> },
  { path: '/admin/stats',    element: <RouteGuard allowedRoles={['admin']}><S><AdminStatsPage /></S></RouteGuard> },
  { path: '/admin/logs',     element: <RouteGuard allowedRoles={['admin']}><S><AdminLogsPage /></S></RouteGuard> },
  { path: '/admin/config',   element: <RouteGuard allowedRoles={['admin']}><S><AdminConfigPage /></S></RouteGuard> },
  { path: '/admin/history',  element: <RouteGuard allowedRoles={['admin']}><S><AdminHistoryPage /></S></RouteGuard> },
  { path: '/admin/account',  element: <RouteGuard allowedRoles={['admin']}><S><AdminAccountPage /></S></RouteGuard> },

  // Redirect root → login
  { path: '/', element: <Navigate to="/login" replace /> },
];
// HMR trigger
