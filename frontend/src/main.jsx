import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import VerificationPage from "./components/VerificationPage.jsx";
import "./styles.css";

const root = createRoot(document.getElementById("root"));

// Route /verify before App mounts so App's history effect never overwrites the URL
if (window.location.pathname === "/verify") {
  root.render(
    <React.StrictMode>
      <VerificationPage />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
