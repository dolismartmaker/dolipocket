import { createSlice } from "@reduxjs/toolkit";
import { getLocal, setLocal, removeLocal } from "@cap-rel/smartcommon";

const authSlice = createSlice({
  name: "auth",
  initialState: {
    token: getLocal("auth_token") || null,
    user: getLocal("auth_user") || null,
    apiUrl: getLocal("auth_api_url") || null,
    dolibarr_url: getLocal("auth_dolibarr_url") || null,
    isAuthenticated: !!(getLocal("auth_token") && getLocal("auth_user")),
  },
  reducers: {
    setAuth(state, action) {
      const { token, user, apiUrl, dolibarrUrl } = action.payload;

      state.token = token;
      state.user = user;
      state.apiUrl = apiUrl || state.apiUrl;
      state.dolibarr_url = dolibarrUrl || state.dolibarr_url;
      state.isAuthenticated = true;

      // Persist to localStorage
      setLocal("auth_token", token);
      setLocal("auth_user", user);
      if (apiUrl) {
        setLocal("auth_api_url", apiUrl);
      }
      if (dolibarrUrl) {
        setLocal("auth_dolibarr_url", dolibarrUrl);
      }
    },
    clearAuth(state) {
      state.token = null;
      state.user = null;
      state.apiUrl = null;
      state.dolibarr_url = null;
      state.isAuthenticated = false;

      // Clear from localStorage
      removeLocal("auth_token");
      removeLocal("auth_user");
      removeLocal("auth_api_url");
      removeLocal("auth_dolibarr_url");
    },
    updateUser(state, action) {
      state.user = { ...state.user, ...action.payload };
      state.isAuthenticated = true;
      setLocal("auth_user", state.user);
    }
  },
});

export const authReducer = authSlice.reducer;
export const { setAuth, clearAuth, updateUser } = authSlice.actions;
