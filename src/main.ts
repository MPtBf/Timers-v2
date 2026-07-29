import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

if (import.meta.env.DEV) {
  import("tauri-plugin-mcp").then(({ setupPluginListeners }) => {
    setupPluginListeners().catch((err: unknown) => {
      console.warn("[MCP] Bridge initialization failed:", err);
    });
  });
}

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
