// Minimal service worker — only needed to enable showNotification() from the
// main thread when the tab is in the background on Chrome/localhost.
// No caching, no offline support, just notification relay.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => self.clients.claim())
