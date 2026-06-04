import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cursorq", {
  onUpdate(cb: (payload: unknown) => void) {
    ipcRenderer.on("cursorq:update", (_e, payload) => cb(payload));
  },
  ready() {
    ipcRenderer.send("cursorq:renderer-ready");
  },
  togglePanel() {
    ipcRenderer.send("cursorq:toggle-panel");
  },
});
