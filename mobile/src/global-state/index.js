import { lastSettingsReducer, authReducer } from "./slices";

export const reducers = {
  lastSettings: lastSettingsReducer,
  auth: authReducer,
};

export * from "./slices";