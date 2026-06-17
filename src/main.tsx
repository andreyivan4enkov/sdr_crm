import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerPwa } from "./pwa";

registerPwa();

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui,sans-serif", background: "#fafaf9" }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, marginBottom: 8 }}>Ошибка загрузки CRM</h1>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 16 }}>{this.state.error.message}</p>
            <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 16px", borderRadius: 12, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer" }}>
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);
