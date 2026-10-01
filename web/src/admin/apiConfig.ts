import { env } from '../envVars';

export const API_BASE_URL = env.VITE_AUTH_API_URL?.replace(/\/$/, '') ?? '';
