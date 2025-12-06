import { config } from '../config';

interface LoginResponse {
  token: string;
}

interface RegisterResponse {
  token: string;
}

interface DecodedToken {
  id: string;
  email: string;
  role: 'user' | 'admin';
  exp: number;
}

// JWT token management
const TOKEN_KEY = 'auth_token';

export const saveToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

// Decode JWT token (simple base64 decode - without verification)
export const decodeToken = (token: string): DecodedToken | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return payload as DecodedToken;
  } catch (e) {
    console.error('Failed to decode token:', e);
    return null;
  }
};

// Get current user from token
export const getCurrentUser = (): DecodedToken | null => {
  const token = getToken();
  if (!token) return null;

  const decoded = decodeToken(token);
  if (!decoded) return null;

  // Check if token is expired
  if (decoded.exp * 1000 < Date.now()) {
    removeToken();
    return null;
  }

  return decoded;
};

// API client with authentication
const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${config.API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
};

// Authentication endpoints
export const api = {
  auth: {
    login: async (email: string, password: string): Promise<LoginResponse> => {
      const response = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (response.token) {
        saveToken(response.token);
      }

      return response;
    },

    register: async (email: string, password: string, fullName: string): Promise<RegisterResponse> => {
      const response = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName }),
      });

      if (response.token) {
        saveToken(response.token);
      }

      return response;
    },

    logout: () => {
      removeToken();
    },
  },

  // Admin endpoints
  admin: {
    // Apps
    getApps: async () => {
      return apiCall('/admin/apps');
    },

    createApp: async (data: { code: string; name: string }) => {
      return apiCall('/admin/apps', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    // Users
    getUsers: async () => {
      return apiCall('/admin/users');
    },

    // Licenses
    getLicenses: async (filters?: { user_id?: number; app_id?: number; status?: string }) => {
      const params = new URLSearchParams();
      if (filters?.user_id) params.append('user_id', filters.user_id.toString());
      if (filters?.app_id) params.append('app_id', filters.app_id.toString());
      if (filters?.status) params.append('status', filters.status);

      const query = params.toString();
      return apiCall(`/admin/licenses${query ? '?' + query : ''}`);
    },

    createLicense: async (data: {
      user_id: number;
      app_id: number;
      max_devices: number;
      expires_at?: string;
      status?: string;
    }) => {
      return apiCall('/admin/licenses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    getLicenseDetails: async (id: number) => {
      return apiCall(`/admin/licenses/${id}`);
    },

    updateLicense: async (id: number, data: {
      expires_at?: string;
      status?: string;
      max_devices?: number;
      user_id?: number;
      meta?: any;
    }) => {
      return apiCall(`/admin/licenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    deleteLicense: async (id: number) => {
      return apiCall(`/admin/licenses/${id}`, {
        method: 'DELETE',
      });
    },

    revokeLicense: async (id: number) => {
      return apiCall(`/admin/licenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'revoked' }),
      });
    },

    extendLicense: async (id: number, additionalMonths: number) => {
      return apiCall(`/admin/licenses/${id}/extend`, {
        method: 'POST',
        body: JSON.stringify({ additionalMonths }),
      });
    },

    transferLicense: async (id: number, newUserId: number) => {
      return apiCall(`/admin/licenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ user_id: newUserId }),
      });
    },

    removeDevice: async (licenseId: number, deviceHash: string) => {
      return apiCall(`/admin/licenses/${licenseId}/devices/${deviceHash}`, {
        method: 'DELETE',
      });
    },
  },

  activations: {
    // TODO: Add activation endpoints if needed
  },
};

export default api;
