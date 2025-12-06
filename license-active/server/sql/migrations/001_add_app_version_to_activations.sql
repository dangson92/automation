-- Migration: Add app_version column to activations table
-- Date: 2025-01-06
-- Description: Track app version for each device activation

ALTER TABLE activations
ADD COLUMN app_version VARCHAR(50) NULL AFTER status;

-- Add index for faster queries on app_version if needed
-- CREATE INDEX idx_app_version ON activations(app_version);
