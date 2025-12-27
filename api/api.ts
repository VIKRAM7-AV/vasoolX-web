import axios from "axios";
import Cookies from "js-cookie"; // Replaces SecureStore
import { BASE_URL } from "@/constants/base_url"; // Ensure this resolves correctly in Next.js

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Crucial if your backend sets HTTP-only cookies
  timeout: 300000,
});

// REQUEST INTERCEPTOR
api.interceptors.request.use((config) => {
  // 1. Get token from Cookies (Sync in browser, unlike Async SecureStore)
  const accessToken = Cookies.get("access_token");
  
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  // 2. Handle FormData automatically
  if (config.data instanceof FormData) {
    config.headers['Content-Type'] = 'multipart/form-data';
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// RESPONSE INTERCEPTOR
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Check if 401 and strictly avoid infinite loops
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = Cookies.get("refresh_token");

        // If no refresh token exists, redirect to login immediately
        if (!refreshToken) {
            throw new Error("No refresh token");
        }

        // Call your refresh endpoint
        const res = await axios.post(`${BASE_URL}/admin/refresh-token`, { refreshToken });
        
        const newAccessToken = res.data.accessToken;
        
        // 3. Update Cookies
        Cookies.set("access_token", newAccessToken, { secure: true, sameSite: 'strict' });
        
        // Update header and retry
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        originalRequest.headers["access_token"] = newAccessToken; // If your backend needs this specific header
        
        return api(originalRequest);
      } catch (refreshError) {
        // 4. Handle Session Expiry (Logout)
        Cookies.remove("access_token");
        Cookies.remove("refresh_token");
        
        // In Next.js client-side, redirect to login
        if (typeof window !== "undefined") {
            window.location.href = "/login"; // Or your login route
        }
        
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;