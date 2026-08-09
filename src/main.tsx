import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { getBrowserCapabilities } from "./lib/capabilities";
import "./styles.css";

if (import.meta.env.PROD && getBrowserCapabilities().serviceWorkerSupported) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
