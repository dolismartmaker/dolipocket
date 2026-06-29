import { createSlice } from "@reduxjs/toolkit";
import { removeLocal, setLocal } from "@cap-rel/smartcommon";

import { readBootLocal } from "./_bootLocal";

// NB: navigator/window presence is checked inline with typeof rather than
// smartcommon's isUndefined(). Calling a shared (Module Federation) function at
// top-level module-eval time races against the MF shared-scope init and crashes
// the prod build with "__mf_NNN is not a function". typeof is a language
// primitive, always available.
export const defaultSettings = {
  lang: typeof navigator !== "undefined" ? (navigator.language || navigator.userLanguage).split("-")[0] : "en",
  theme: "SmartInterventions",
  darkMode: typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false,
  scale: 1,
};

const lastSettingsSlice = createSlice({
  name: "lastSettings",
  initialState: readBootLocal("lastSettings") ?? defaultSettings,
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
