import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import ConfirmHost from "./components/Confirm";
import ErrorBoundary from "./components/ErrorBoundary";
import { RealtimeProvider } from "./realtime/RealtimeContext";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Oxirgi to'siq: bundan tashqarida xato bo'lsa odam oq ekran ko'rardi. */}
    <ErrorBoundary scope="app">
      <BrowserRouter>
        <AuthProvider>
          <RealtimeProvider>
            <App />
            {/* Tasdiqlash oynasi - `window.confirm` o'rniga, bir marta. */}
            <ConfirmHost />
          </RealtimeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
