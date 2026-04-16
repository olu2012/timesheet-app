import axios from 'axios';

// In development VITE_API_URL is empty → Vite proxy forwards /api to localhost:3001
// In production set VITE_API_URL=https://your-app.onrender.com/api
const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        })
        .catch((err) => Promise.reject(err));
    }

    isRefreshing = true;

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      isRefreshing = false;
      processQueue(error);
      localStorage.clear();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
      processQueue(null, data.accessToken);
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(original);
    } catch (err) {
      processQueue(err);
      localStorage.clear();
      window.location.href = '/login';
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
