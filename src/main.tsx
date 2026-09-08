import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installDemoApi } from "./lib/demoApi";
import "./index.css";

// 靜態展示站冇後端：先掛示範 API，令所有 /api/* 掣有示範回應而唔係 404。
installDemoApi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
