import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

// Fonts, self-hosted from the fontsource packages: never Google at runtime.
// Latin and Latin Extended cover English and Romanian; the mono face only
// ever shows a token.
import "@fontsource/familjen-grotesk/latin-600.css";
import "@fontsource/familjen-grotesk/latin-700.css";
import "@fontsource/familjen-grotesk/latin-ext-600.css";
import "@fontsource/familjen-grotesk/latin-ext-700.css";
import "@fontsource/instrument-sans/latin-400.css";
import "@fontsource/instrument-sans/latin-500.css";
import "@fontsource/instrument-sans/latin-600.css";
import "@fontsource/instrument-sans/latin-ext-400.css";
import "@fontsource/instrument-sans/latin-ext-500.css";
import "@fontsource/instrument-sans/latin-ext-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/chats.css";
import "./styles/settings.css";

import { App } from "./App";

/*
 * The service worker precaches the app shell. A new version waits and is
 * applied the next time the page is hidden, so an update never reloads the
 * app under somebody mid-message. (In `vite dev` there is no worker.)
 */
const updateServiceWorker = registerSW({
  onNeedRefresh() {
    const applyWhenHidden = () => {
      if (document.visibilityState !== "hidden") return;
      document.removeEventListener("visibilitychange", applyWhenHidden);
      void updateServiceWorker(true);
    };
    document.addEventListener("visibilitychange", applyWhenHidden);
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
