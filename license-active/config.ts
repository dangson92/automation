/**
 * Frontend Configuration
 *
 * API_URL: Backend API endpoint
 * - Development: http://localhost:3000
 * - Production: https://api.dangthanhson.com
 */

export const config = {
  API_URL: import.meta.env.VITE_API_URL || 'https://api.dangthanhson.com',
  APP_NAME: 'License Manager',
  VERSION: '1.0.0'
}

export default config
