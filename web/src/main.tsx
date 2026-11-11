import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

// The one stylesheet: Tailwind, the tokens, and the self-hosted fonts (never Google at runtime).
import "./styles/index.css";

import { App } from "./App";
import { captureShare } from "./share/share";
import { setUpAuth } from "./ward";

// The auth hooks need the plugin's routes before anything renders.
setUpAuth();
// A share from Android's share sheet: keep the text through sign-in, drop it from the address.
captureShare();

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
