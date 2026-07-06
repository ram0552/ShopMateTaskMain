import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3001/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if(token){
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// api.interceptors.response.use(
//   (response) => response,
//   async (error) => {
//     const originalRequest = error.config;
//     if (error.response && error.response.status === 401 && !originalRequest._retry) {
//       originalRequest._retry = true;
//   }
//   try {
//     const refreshToken = localStorage.getItem("refreshToken");
//     if (refreshToken) {
//       const res = await axios.post("http://localhost:3001/api/users/refresh", {refreshToken });
//       const newAccessToken = res.data.accessToken;
//       if(res.status === 200) {
//         localStorage.setItem("accessToken", newAccessToken);
//         localStorage.setItem("refreshToken", res.data.refreshToken);
//         originalRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
//         return api(originalRequest);
//       }
//     }
//     } catch (err) {
//         localStorage.removeItem("accessToken");
//         localStorage.removeItem("refreshToken");
//         localStorage.removeItem("user");
//         if (window.location.pathname !== "/login") {
//           window.location.href = "/login";
//         }
//     }
//     return Promise.reject(error);
//     }
// );
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response &&
      error.response.status === 401 &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refreshToken");

        if (!refreshToken) {
          throw new Error("No refresh token");
        }

        const res = await axios.post(
          "http://localhost:3001/api/users/refresh",
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