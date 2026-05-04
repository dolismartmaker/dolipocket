import { createSlice } from "@reduxjs/toolkit";
import { getLocal, removeLocal, setLocal, isUndefined } from "@cap-rel/smartcommon";

export const defaultSettings = {
  lang: !isUndefined(navigator) ? (navigator.language || navigator.userLanguage).split("-")[0] : "en",
  theme: "SmartInterventions",
  darkMode: !isUndefined(window) ? window.matchMedia("(prefers-color-scheme: dark)").matches : false,
  scale: 1,
};

const lastSettingsSlice = createSlice({
  name: "lastSettings",
  initialState: getLocal("lastSettings") ?? defaultSettings,
  reducers: {
    setLastSettings(state, action) {
        const lastSettings = action.payload;

        setLocal("lastSettings", lastSettings);
        return lastSettings;
    },
    unsetLastSettings(state) {
        removeLocal("lastSettings");
        return defaultSettings;
    },
    updateLastSettings(state, action) {
      const lastSettings = action.payload;

      const newLastSettings = { ...state, ...lastSettings };

      setLocal("lastSettings", newLastSettings);
      return newLastSettings;
    }
  },
});

export const lastSettingsReducer = lastSettingsSlice.reducer;
export const { setLastSettings, unsetLastSettings, updateLastSettings } = lastSettingsSlice.actions;
