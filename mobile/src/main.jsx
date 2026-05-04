import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@cap-rel/smartcommon/dist/smartcommon-style.css";
import "./assets/styles/style.css";
// import "./assets/styles/base.css";
// import "./assets/styles/theme.css";

import { App } from "./App";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);