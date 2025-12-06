import React, { useState, useEffect } from 'react';
import { ShieldCheckIcon, LogOutIcon, KeyIcon } from './Icons';
import { LicenseKey, KeyStatus, User } from '../types';
import api from '../services/api';

interface UserDashboardProps {
  user: User;
  onLogout: () => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({ user, onLogout }) => {
  const [userKeys, setUserKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserLicenses();
  }, []);

  const loadUserLicenses = async () => {
    try {
      setLoading(true);
      const response = await api.user.getLicenses();

      // Map API response to LicenseKey format
      const licenses: LicenseKey[] = response.items.map((item: any) => ({
        id: item.id.toString(),
        key: item.license_key,
        status: mapStatus(item.status),
        createdAt: new Date().toISOString(), // API doesn't return created_at yet
        expiresAt: item.expires_at,
        appCode: item.app_code,
        appName: item.app_name,
        maxDevices: item.max_devices,
      }));

      setUserKeys(licenses);
    } catch (error) {
      console.error('Failed to load licenses:', error);
      setUserKeys([]);
    } finally {
      setLoading(false);
    }
  };

  const mapStatus = (dbStatus: string): KeyStatus => {
    switch (dbStatus) {
      case 'active': return KeyStatus.ACTIVE;
      case 'revoked': return KeyStatus.REVOKED;
      case 'expired': return KeyStatus.EXPIRED;
      default: return KeyStatus.ACTIVE;
    }
  };

  const getStatusColor = (status: KeyStatus) => {
    switch (status) {
      case KeyStatus.VALID: return 'bg-blue-100 text-blue-700 border-blue-200';
      case KeyStatus.ACTIVE: return 'bg-green-100 text-green-700 border-green-200';
      case KeyStatus.EXPIRED: return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case KeyStatus.REVOKED: return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Lifetime';
    return new Date(dateStr).toLocaleDateString('vi-VN');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
       {/* Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
                <ShieldCheckIcon className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold text-gray-800">User Portal</span>
        </div>
        <div className="flex items-center space-x-4">
             <span className="text-sm text-gray-500">Welcome, {user.username}</span>
            <button onClick={onLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600 transition-colors">
                <LogOutIcon className="w-4 h-4 mr-2" />
                Logout
            </button>
        </div>
      </nav>

      <div className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full space-y-8">

        {/* My Licenses Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold text-gray-800 flex items-center">
                    <KeyIcon className="w-5 h-5 mr-2 text-indigo-600" />
                    License Keys của tôi
                </h3>
                <span className="text-sm text-gray-500">{userKeys.length} licenses</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-medium text-xs">
                        <tr>
                            <th className="px-6 py-3">License Key</th>
                            <th className="px-6 py-3">Ứng dụng</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Thời hạn</th>
                            <th className="px-6 py-3">Ngày tạo</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {userKeys.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-10 text-gray-400">
                                    Bạn chưa có license key nào.
                                </td>
                            </tr>
                        )}
                        {userKeys.map((key) => (
                            <tr key={key.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 font-mono text-xs text-gray-800 font-medium">
                                    {key.key}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm">
                                        <div className="font-medium text-gray-800">{key.appName}</div>
                                        <div className="text-xs text-gray-500">{key.appCode}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                     <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(key.status)}`}>
                                        {key.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500">
                                    {formatDate(key.expiresAt)}
                                </td>
                                <td className="px-6 py-4 text-gray-500">
                                    {formatDate(key.createdAt)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};
