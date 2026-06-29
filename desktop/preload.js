const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('syncframeDesktop', {
  // Empty secure bridge for Batch 21A
});
