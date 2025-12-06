import React, { useState, useEffect } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { UserDashboard } from './components/UserDashboard';
import { Auth } from './components/Auth';
import { UserRole, User } from './types';
import api, { getCurrentUser } from './services/api';

const App: React.FC = () => {
  // --- State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // --- Effects ---
  useEffect(() => {
    // Check if user is already logged in (has valid token)
    const user = getCurrentUser();
    if (user) {
      setCurrentUser({
        id: user.id,
        username: user.email, // Use email as username for compatibility
        password: '', // Not needed
        role: user.role === 'admin' ? UserRole.ADMIN : UserRole.USER,
      });
    }
    setLoading(false);
  }, []);

  // --- Auth Handlers ---
  const handleAuthSuccess = () => {
    // After successful login/register, get user from token
    const user = getCurrentUser();
    if (user) {
      setCurrentUser({
        id: user.id,
        username: user.email,
        password: '',
        role: user.role === 'admin' ? UserRole.ADMIN : UserRole.USER,
      });
    }
  };

  const handleLogout = () => {
    api.auth.logout();
    setCurrentUser(null);
  };

  // --- Views ---

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  if (currentUser.role === UserRole.ADMIN) {
    return (
      <AdminDashboard
        user={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  if (currentUser.role === UserRole.USER) {
    return (
      <UserDashboard
        user={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  return null;
};

export default App;
