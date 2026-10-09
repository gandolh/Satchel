import { AuthGate } from "./auth/AuthGate";
import { AppShell } from "./layout/AppShell";

export function App() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}
