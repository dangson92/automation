CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL,
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS apps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(128) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS licenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  app_id INT NOT NULL,
  license_key VARCHAR(64) UNIQUE NOT NULL,
  max_devices INT NOT NULL,
  expires_at DATETIME NULL,
  status ENUM('active','revoked','expired') NOT NULL,
  meta JSON NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_licenses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_licenses_app FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  license_id INT NOT NULL,
  device_hash VARCHAR(255) NOT NULL,
  first_activated_at DATETIME NOT NULL,
  last_checkin_at DATETIME NOT NULL,
  status ENUM('active','banned') NOT NULL,
  UNIQUE KEY uniq_activation (license_id, device_hash),
  CONSTRAINT fk_activations_license FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS renew_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  license_id INT NOT NULL,
  message TEXT,
  status ENUM('pending','approved','rejected') NOT NULL,
  created_at DATETIME NOT NULL,
  processed_at DATETIME NULL,
  processed_by_admin_id INT NULL,
  CONSTRAINT fk_rr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rr_license FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
  CONSTRAINT fk_rr_admin FOREIGN KEY (processed_by_admin_id) REFERENCES users(id)
);
