import React, { useState, useEffect } from 'react';
import { LicenseKey, KeyStatus, User, App } from '../types';
import { generateKeyInsights } from '../services/geminiService';
import { KeyIcon, RefreshCwIcon, SparklesIcon, LogOutIcon } from './Icons';
import api from '../services/api';

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [insight, setInsight] = useState<string>('');
  const [loadingInsight, setLoadingInsight] = useState(false);

  // License form state
  const [selectedApp, setSelectedApp] = useState<number>(0);
  const [selectedUser, setSelectedUser] = useState<number>(0);
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const [maxDevices, setMaxDevices] = useState<number>(1);

  // App form state
  const [newAppCode, setNewAppCode] = useState<string>('');
  const [newAppName, setNewAppName] = useState<string>('');
  const [creatingApp, setCreatingApp] = useState(false);
  const [showAppForm, setShowAppForm] = useState(false);

  // Data
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Filter, Sort, Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'created' | 'expires'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Device removal popup state
  const [devicePopup, setDevicePopup] = useState<{
    licenseId: string;
    devices: any[];
    selectedDevices: string[];
  } | null>(null);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [appsRes, usersRes, licensesRes] = await Promise.all([
        api.admin.getApps(),
        api.admin.getUsers(),
        api.admin.getLicenses(),
      ]);

      setApps(appsRes.items || []);
      setUsers(usersRes.items || []);

      // Transform licenses data
      const transformedKeys = (licensesRes.items || []).map((lic: any) => ({
        id: lic.id.toString(),
        key: lic.license_key,
        status: lic.status === 'active' ? KeyStatus.ACTIVE :
                lic.status === 'revoked' ? KeyStatus.REVOKED :
                lic.status === 'expired' ? KeyStatus.EXPIRED : KeyStatus.VALID,
        createdAt: lic.created_at,
        expiresAt: lic.expires_at,
        owner: lic.email,
        appCode: lic.app_code,
        appName: lic.app_name,
        maxDevices: lic.max_devices,
        activeDevices: lic.active_devices || 0, // Add active devices count
      }));

      setKeys(transformedKeys);

      // Set default selections
      if (appsRes.items?.length > 0) setSelectedApp(appsRes.items[0].id);
      if (usersRes.items?.length > 0) setSelectedUser(usersRes.items[0].id);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Không thể tải dữ liệu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApp = async () => {
    if (!newAppCode || !newAppName) {
      alert('Vui lòng nhập đầy đủ App Code và App Name!');
      return;
    }

    try {
      setCreatingApp(true);
      await api.admin.createApp({ code: newAppCode, name: newAppName });
      alert('Ứng dụng đã được tạo thành công!');
      setNewAppCode('');
      setNewAppName('');
      setShowAppForm(false);
      await loadData();
    } catch (error: any) {
      console.error('Failed to create app:', error);
      alert(`Không thể tạo ứng dụng: ${error.message}`);
    } finally {
      setCreatingApp(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!selectedApp || !selectedUser) {
      alert('Vui lòng chọn ứng dụng và user!');
      return;
    }

    try {
      setCreating(true);

      // Calculate expires_at
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + selectedDuration);

      console.log('Creating license with data:', {
        user_id: selectedUser,
        app_id: selectedApp,
        max_devices: maxDevices,
        expires_at: expiresAt.toISOString(),
        status: 'active',
      });

      const result = await api.admin.createLicense({
        user_id: selectedUser,
        app_id: selectedApp,
        max_devices: maxDevices,
        expires_at: expiresAt.toISOString(),
        status: 'active',
      });

      console.log('License created result:', result);
      alert(`License key đã được tạo thành công!\n\nKey: ${result.license_key}`);

      // Reload data
      await loadData();
    } catch (error: any) {
      console.error('Failed to create license:', error);
      const errorMsg = error.message || 'Unknown error';
      alert(`Không thể tạo license key!\n\nLỗi: ${errorMsg}\n\nVui lòng kiểm tra console để biết thêm chi tiết.`);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa license key này?')) return;

    try {
      await api.admin.deleteLicense(Number(id));
      alert('Đã xóa license key thành công!');
      await loadData();
    } catch (error: any) {
      alert(`Không thể xóa: ${error.message}`);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn vô hiệu hóa license key này?')) return;

    try {
      await api.admin.revokeLicense(Number(id));
      alert('Đã vô hiệu hóa license key thành công!');
      await loadData();
    } catch (error: any) {
      alert(`Không thể vô hiệu hóa: ${error.message}`);
    }
  };

  const handleExtendKey = async (id: string) => {
    const months = prompt('Nhập số tháng muốn gia hạn (1-12):');
    if (!months) return;

    const additionalMonths = parseInt(months);
    if (isNaN(additionalMonths) || additionalMonths < 1 || additionalMonths > 12) {
      alert('Số tháng không hợp lệ!');
      return;
    }

    try {
      await api.admin.extendLicense(Number(id), additionalMonths);
      alert(`Đã gia hạn thêm ${additionalMonths} tháng thành công!`);
      await loadData();
    } catch (error: any) {
      alert(`Không thể gia hạn: ${error.message}`);
    }
  };

  const handleTransferKey = async (id: string) => {
    const newUserId = prompt('Nhập User ID mới:');
    if (!newUserId) return;

    try {
      await api.admin.transferLicense(Number(id), Number(newUserId));
      alert('Đã chuyển license key sang user mới thành công!');
      await loadData();
    } catch (error: any) {
      alert(`Không thể chuyển: ${error.message}`);
    }
  };

  const handleRemoveDevice = async (licenseId: string) => {
    // Get license details to show devices
    try {
      const details = await api.admin.getLicenseDetails(Number(licenseId));
      if (!details.activations || details.activations.length === 0) {
        alert('License này chưa có device nào được kích hoạt!');
        return;
      }

      // Open popup with device list
      setDevicePopup({
        licenseId,
        devices: details.activations,
        selectedDevices: [],
      });
    } catch (error: any) {
      alert(`Không thể tải danh sách devices: ${error.message}`);
    }
  };

  const handleConfirmRemoveDevices = async () => {
    if (!devicePopup || devicePopup.selectedDevices.length === 0) {
      alert('Vui lòng chọn ít nhất 1 device để gỡ!');
      return;
    }

    try {
      // Remove devices one by one
      for (const deviceHash of devicePopup.selectedDevices) {
        await api.admin.removeDevice(Number(devicePopup.licenseId), deviceHash);
      }

      alert(`Đã gỡ ${devicePopup.selectedDevices.length} device thành công!`);
      setDevicePopup(null);
      await loadData();
    } catch (error: any) {
      alert(`Không thể gỡ device: ${error.message}`);
    }
  };

  const toggleDeviceSelection = (deviceHash: string) => {
    if (!devicePopup) return;

    const isSelected = devicePopup.selectedDevices.includes(deviceHash);
    setDevicePopup({
      ...devicePopup,
      selectedDevices: isSelected
        ? devicePopup.selectedDevices.filter(h => h !== deviceHash)
        : [...devicePopup.selectedDevices, deviceHash],
    });
  };

  const handleGenerateInsight = async () => {
    setLoadingInsight(true);
    const result = await generateKeyInsights(keys);
    setInsight(result);
    setLoadingInsight(false);
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
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('vi-VN');
  };

  // Filter, sort, and search logic
  const getFilteredAndSortedKeys = () => {
    let filtered = [...keys];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(key =>
        key.key.toLowerCase().includes(query) ||
        (key.owner && key.owner.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(key => key.status.toLowerCase() === statusFilter.toLowerCase());
    }

    // Sort
    filtered.sort((a, b) => {
      let compareA: any, compareB: any;

      if (sortBy === 'created') {
        compareA = new Date(a.createdAt).getTime();
        compareB = new Date(b.createdAt).getTime();
      } else if (sortBy === 'expires') {
        compareA = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
        compareB = b.expiresAt ? new Date(b.expiresAt).getTime() : 0;
      }

      if (sortOrder === 'asc') {
        return compareA - compareB;
      } else {
        return compareB - compareA;
      }
    });

    return filtered;
  };

  const filteredKeys = getFilteredAndSortedKeys();

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
                <KeyIcon className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold text-gray-800">KeyMaster Admin</span>
        </div>
        <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">Admin: {user.username}</span>
            <button onClick={onLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600 transition-colors">
                <LogOutIcon className="w-4 h-4 mr-2" />
                Logout
            </button>
        </div>
      </nav>

      <div className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-8">

        {/* Top Actions & Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Create App Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800">Quản lý Ứng dụng</h3>
                    <button
                        onClick={() => setShowAppForm(!showAppForm)}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        {showAppForm ? 'Đóng' : '+ Tạo mới'}
                    </button>
                </div>

                {showAppForm ? (
                    <>
                        <div className="flex flex-col space-y-2">
                            <label className="text-sm text-gray-500 font-medium">App Code</label>
                            <input
                                type="text"
                                value={newAppCode}
                                onChange={(e) => setNewAppCode(e.target.value)}
                                placeholder="my-app"
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>

                        <div className="flex flex-col space-y-2">
                            <label className="text-sm text-gray-500 font-medium">App Name</label>
                            <input
                                type="text"
                                value={newAppName}
                                onChange={(e) => setNewAppName(e.target.value)}
                                placeholder="My Application"
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>

                        <button
                            onClick={handleCreateApp}
                            disabled={creatingApp}
                            className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {creatingApp ? 'Đang tạo...' : 'Tạo Ứng dụng'}
                        </button>
                    </>
                ) : (
                    <div className="text-sm text-gray-600">
                        <p className="mb-2">Danh sách ứng dụng ({apps.length}):</p>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                            {apps.map(app => (
                                <div key={app.id} className="p-2 bg-gray-50 rounded text-xs">
                                    <div className="font-medium">{app.name}</div>
                                    <div className="text-gray-500">{app.code}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Generator Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Tạo License Key Mới</h3>

                <div className="flex flex-col space-y-2">
                    <label className="text-sm text-gray-500 font-medium">Ứng dụng</label>
                    <select
                        value={selectedApp}
                        onChange={(e) => setSelectedApp(Number(e.target.value))}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    >
                        {apps.map(app => (
                            <option key={app.id} value={app.id}>{app.name} ({app.code})</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col space-y-2">
                    <label className="text-sm text-gray-500 font-medium">User</label>
                    <select
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(Number(e.target.value))}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    >
                        {users.map(u => (
                            <option key={u.id} value={u.id}>{u.email} - {u.full_name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col space-y-2">
                    <label className="text-sm text-gray-500 font-medium">Thời hạn sử dụng</label>
                    <select
                        value={selectedDuration}
                        onChange={(e) => setSelectedDuration(Number(e.target.value))}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    >
                        <option value={1}>1 tháng</option>
                        <option value={3}>3 tháng</option>
                        <option value={6}>6 tháng</option>
                        <option value={12}>1 năm</option>
                    </select>
                </div>

                <div className="flex flex-col space-y-2">
                    <label className="text-sm text-gray-500 font-medium">Số device tối đa</label>
                    <input
                        type="number"
                        min="1"
                        value={maxDevices}
                        onChange={(e) => setMaxDevices(Number(e.target.value))}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    />
                </div>

                <button
                    onClick={handleGenerateKey}
                    disabled={creating}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshCwIcon className="w-4 h-4 mr-2" />
                    {creating ? 'Đang tạo...' : 'Tạo License Key'}
                </button>
            </div>

            {/* AI Insights Card */}
            <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-2xl shadow-sm border border-indigo-100 relative overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-indigo-900 flex items-center">
                        <SparklesIcon className="w-5 h-5 mr-2 text-indigo-500" />
                        AI Analyst
                    </h3>
                    <button
                        onClick={handleGenerateInsight}
                        disabled={loadingInsight}
                        className="text-xs bg-white border border-indigo-200 text-indigo-600 px-3 py-1 rounded-full hover:bg-indigo-50 transition-colors disabled:opacity-50"
                    >
                        {loadingInsight ? 'Analyzing...' : 'Refresh Insights'}
                    </button>
                </div>
                <div className="prose prose-indigo prose-sm text-gray-600">
                    {insight ? (
                         <div className="whitespace-pre-line">{insight}</div>
                    ) : (
                        <p className="text-gray-400 italic">Click "Refresh Insights" to get an AI-powered summary of your license usage.</p>
                    )}
                </div>
            </div>
        </div>

        {/* Keys Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <h3 className="font-bold text-gray-800">Danh sách License Keys</h3>

                    <div className="flex flex-col md:flex-row gap-3 flex-1 md:max-w-2xl">
                        {/* Search */}
                        <input
                            type="text"
                            placeholder="Tìm kiếm theo key hoặc email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                        />

                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="all">Tất cả trạng thái</option>
                            <option value="active">Active</option>
                            <option value="valid">Valid</option>
                            <option value="expired">Expired</option>
                            <option value="revoked">Revoked</option>
                        </select>

                        {/* Sort */}
                        <select
                            value={`${sortBy}-${sortOrder}`}
                            onChange={(e) => {
                                const [by, order] = e.target.value.split('-');
                                setSortBy(by as 'created' | 'expires');
                                setSortOrder(order as 'asc' | 'desc');
                            }}
                            className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="created-desc">Mới nhất</option>
                            <option value="created-asc">Cũ nhất</option>
                            <option value="expires-desc">Hết hạn muộn nhất</option>
                            <option value="expires-asc">Hết hạn sớm nhất</option>
                        </select>
                    </div>
                </div>

                <div className="mt-3 text-sm text-gray-500">
                    Hiển thị {filteredKeys.length} / {keys.length} license keys
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 uppercase font-medium text-xs">
                        <tr>
                            <th className="px-6 py-3">License Key</th>
                            <th className="px-6 py-3">Ứng dụng</th>
                            <th className="px-6 py-3">Owner (Email)</th>
                            <th className="px-6 py-3">Thời hạn</th>
                            <th className="px-6 py-3">Số máy active</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Ngày tạo</th>
                            <th className="px-6 py-3 text-center w-32">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredKeys.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-center py-8 text-gray-400">
                                    {searchQuery || statusFilter !== 'all'
                                        ? 'Không tìm thấy license key phù hợp.'
                                        : 'Chưa có license key nào.'}
                                </td>
                            </tr>
                        )}
                        {filteredKeys.map((key) => (
                            <tr key={key.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-3 font-mono text-xs text-gray-800">{key.key}</td>
                                <td className="px-6 py-3">
                                    <div className="text-sm">
                                        <div className="font-medium text-gray-800">{key.appName}</div>
                                        <div className="text-xs text-gray-500">{key.appCode}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-gray-500">{key.owner || '-'}</td>
                                <td className="px-6 py-3 text-gray-500">{formatDate(key.expiresAt)}</td>
                                <td className="px-6 py-3">
                                    <span className="text-sm font-medium text-gray-700">
                                        {(key as any).activeDevices || 0} / {key.maxDevices}
                                    </span>
                                </td>
                                <td className="px-6 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(key.status)}`}>
                                        {key.status}
                                    </span>
                                </td>
                                <td className="px-6 py-3 text-gray-500">{formatDate(key.createdAt)}</td>
                                <td className="px-6 py-3">
                                    <div className="flex justify-center gap-1">
                                        {key.status !== KeyStatus.REVOKED && (
                                            <>
                                                <button
                                                    onClick={() => handleRevokeKey(key.id)}
                                                    className="px-2 py-1 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded text-xs font-medium transition-colors"
                                                    title="Vô hiệu hóa"
                                                >
                                                    Vô hiệu
                                                </button>
                                                <button
                                                    onClick={() => handleExtendKey(key.id)}
                                                    className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-xs font-medium transition-colors"
                                                    title="Gia hạn"
                                                >
                                                    Gia hạn
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveDevice(key.id)}
                                                    className="px-2 py-1 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 rounded text-xs font-medium transition-colors"
                                                    title="Gỡ khỏi máy"
                                                >
                                                    Gỡ máy
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => handleDeleteKey(key.id)}
                                            className="px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded text-xs font-medium transition-colors"
                                            title="Xóa"
                                        >
                                            Xóa
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

      </div>

      {/* Device Removal Popup */}
      {devicePopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">Chọn thiết bị cần gỡ</h3>
              <p className="text-sm text-gray-600 mt-1">
                Đã chọn: {devicePopup.selectedDevices.length} / {devicePopup.devices.length}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {devicePopup.devices.map((device: any, index: number) => (
                  <div
                    key={device.device_hash}
                    className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleDeviceSelection(device.device_hash)}
                  >
                    <input
                      type="checkbox"
                      checked={devicePopup.selectedDevices.includes(device.device_hash)}
                      onChange={() => {}}
                      className="mt-1 h-4 w-4 text-indigo-600 rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-gray-800">Device #{index + 1}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          device.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {device.status}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-gray-600 bg-gray-50 p-2 rounded break-all">
                        {device.device_hash}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
                        <div>
                          <span className="font-medium">Kích hoạt lần đầu:</span>
                          <br />
                          {new Date(device.first_activated_at).toLocaleString('vi-VN')}
                        </div>
                        <div>
                          <span className="font-medium">Checkin cuối:</span>
                          <br />
                          {new Date(device.last_checkin_at).toLocaleString('vi-VN')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end space-x-2">
              <button
                onClick={() => setDevicePopup(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmRemoveDevices}
                disabled={devicePopup.selectedDevices.length === 0}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Gỡ {devicePopup.selectedDevices.length > 0 ? `(${devicePopup.selectedDevices.length})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
