import axios from "axios";

/**
 * Resolves the backend API base URL cleanly:
 * - Uses VITE_API_URL if configured.
 * - In production environments, detects and intercepts errant localhost URLs.
 * - Defaults to 'http://localhost:3001/api' during local development.
 */
export const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  const isBrowser = typeof window !== 'undefined';
  const isLocalHost = isBrowser && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0'
  );

  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    const trimmed = envUrl.trim().replace(/\/+$/, '');

    // Safety guard: If deployed to production (Render/Vercel/etc.) but VITE_API_URL
    // was baked with localhost, prevent cross-origin/mixed-content failure to user's device.
    if (isBrowser && !isLocalHost && (trimmed.includes('localhost') || trimmed.includes('127.0.0.1'))) {
      console.warn(
        `[ShopMate API] Detected localhost API URL (${trimmed}) in a production environment (${window.location.origin}). Falling back to same-origin /api.`
      );
      return `${window.location.origin}/api`;
    }

    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }

  // Production browser without VITE_API_URL: use same-origin relative /api
  if (isBrowser && !isLocalHost) {
    return `${window.location.origin}/api`;
  }

  // Local development default
  return 'http://localhost:3001/api';
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Do not attempt token refresh for authentication endpoints, gateway errors, or if already retried
    const isAuthEndpoint =
      typeof originalRequest?.url === 'string' &&
      (originalRequest.url.includes('/users/login') ||
        originalRequest.url.includes('/users/refresh') ||
        originalRequest.url.includes('/users/register') ||
        originalRequest.url.includes('/users/resend-verification') ||
        originalRequest.url.includes('/users/forget-password') ||
        originalRequest.url.includes('/users/reset-password'));

    const isGatewayError =
      error.response?.data?.code === 'GATEWAY_ERROR' ||
      (typeof error.response?.data?.code === 'string' &&
        error.response.data.code.startsWith('GATEWAY_')) ||
      error.response?.status === 502 ||
      error.response?.status === 503;

    if (
      error.response &&
      error.response.status === 401 &&
      !isAuthEndpoint &&
      !isGatewayError &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refreshToken");

        if (!refreshToken) {
          throw new Error("No refresh token");
        }

        const res = await axios.post(
          `${getApiBaseUrl()}/users/refresh`,
          { refreshToken }
        );

        const newAccessToken = res.data.accessToken;

        localStorage.setItem("accessToken", newAccessToken);

        if (res.data.refreshToken) {
          localStorage.setItem(
            "refreshToken",
            res.data.refreshToken
          );
        }

        originalRequest.headers.Authorization =
          `Bearer ${newAccessToken}`;

        return api(originalRequest);
      } catch (err) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");

        if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
          window.location.href = "/login";
        }

        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);

export const logout = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
  window.location.href = "/login";
};

export default api;
