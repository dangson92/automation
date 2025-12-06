export enum KeyStatus {
  VALID = 'VALID',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export interface User {
  id: string;
  username: string;
  password: string; // Plaintext for demo purposes
  role: UserRole;
}

export interface LicenseKey {
  id: string;
  key: string;
  status: KeyStatus;
  createdAt: string;
  expiresAt?: string;
  owner?: string; // User ID or email
  appCode?: string; // App code
  appName?: string; // App name
  hwid?: string; // Hardware ID (device hash)
  maxDevices?: number; // Max devices allowed
}

export interface AnalyticsSummary {
  totalKeys: number;
  activeKeys: number;
  revenue: number;
  aiInsight: string;
}

export interface App {
  id: number;
  code: string;
  name: string;
  created_at?: string;
}

export interface CreateLicenseRequest {
  userId: number;
  appId: number;
  durationMonths: number; // 1, 3, 6, 12
  maxDevices?: number;
}

export interface TransferLicenseRequest {
  licenseId: number;
  newUserId: number;
}

export interface ExtendLicenseRequest {
  licenseId: number;
  additionalMonths: number;
}