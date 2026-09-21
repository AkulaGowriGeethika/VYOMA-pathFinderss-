/* VYOMA feature helpers: offline cache, confidence, safety and model comparison. */
window.VYOMA_FEATURES = {
  saveOfflineRoute(route) {
    localStorage.setItem("vyoma_offline_route", JSON.stringify({route, savedAt: Date.now()}));
  },
  loadOfflineRoute() {
    try { return JSON.parse(localStorage.getItem("vyoma_offline_route") || "null"); }
    catch (_) { return null; }
  },
  saveOutageEvent(event) {
    const key = "vyoma_gnss_outages";
    let items = [];
    try { items = JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) {}
    items.push({...event, timestamp: Date.now()});
    localStorage.setItem(key, JSON.stringify(items.slice(-100)));
  },
  getOutageEvents() {
    try { return JSON.parse(localStorage.getItem("vyoma_gnss_outages") || "[]"); }
    catch (_) { return []; }
  },
  confidenceLabel(score) {
    return score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
  }
};
