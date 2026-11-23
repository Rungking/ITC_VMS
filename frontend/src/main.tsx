import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App as AntApp, ConfigProvider } from "antd";
import thTH from "antd/locale/th_TH";

// Font is bundled (not loaded from Google) because many sites run without internet access.
import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/600.css";
import "./i18n";
import { AuthProvider } from "./auth/AuthContext";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={thTH}
      theme={{ token: { fontFamily: "Sarabun, system-ui, sans-serif", fontSize: 16, colorPrimary: "#1d4ed8" } }}
    >
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
