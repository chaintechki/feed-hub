import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { registerServiceWorker } from "./lib/pwa";
import "./i18n";
import "./styles.css";

if (localStorage.getItem("fp.theme") === "dark") {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
