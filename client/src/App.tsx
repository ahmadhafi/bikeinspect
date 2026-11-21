import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminParametersPage } from './pages/AdminParametersPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminVehiclesPage } from './pages/AdminVehiclesPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { InspectionDetailPage } from './pages/InspectionDetailPage';
import { InspectionFormPage } from './pages/InspectionFormPage';
import { InspectionSavedPage } from './pages/InspectionSavedPage';
import { LoginPage } from './pages/LoginPage';
import { ReportsPage } from './pages/ReportsPage';
import { ScanPage } from './pages/ScanPage';
import { BASE_PATH } from './lib/api';
import type { UserRole } from './types';

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: UserRole[];
}) {
  const { user, loading, disableAuth } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center text-sm text-slate-500">
        Memuat sesi...
      </div>
    );
  }
  if (!user) return <Navigate to="/masuk" replace />;
  if (!disableAuth && roles && !roles.includes(user.peran)) {
    return (
      <AppLayout>
        <div className="card p-8 max-w-md mx-auto text-center space-y-2">
          <p className="font-bold text-danger-700">Akses Ditolak (403)</p>
          <p className="text-xs text-slate-600">Peran Anda ({user.peran}) tidak memiliki hak akses untuk halaman ini.</p>
        </div>
      </AppLayout>
    );
  }
  return <AppLayout>{children}</AppLayout>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={BASE_PATH || undefined}>
        <Routes>
          <Route
            path="/masuk"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scan"
            element={
              <ProtectedRoute roles={['Petugas', 'PIC']}>
                <ScanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspeksi/:id/edit"
            element={
              <ProtectedRoute roles={['Petugas', 'PIC']}>
                <InspectionFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspeksi/:id/tersimpan"
            element={
              <ProtectedRoute roles={['Petugas', 'PIC']}>
                <InspectionSavedPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inspeksi/:id"
            element={
              <ProtectedRoute>
                <InspectionDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/riwayat"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/laporan"
            element={
              <ProtectedRoute roles={['PIC']}>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pengguna"
            element={
              <ProtectedRoute roles={['Admin']}>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/kendaraan"
            element={
              <ProtectedRoute roles={['Admin']}>
                <AdminVehiclesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/parameter"
            element={
              <ProtectedRoute roles={['Admin']}>
                <AdminParametersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute roles={['Admin', 'PIC']}>
                <AuditLogPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
