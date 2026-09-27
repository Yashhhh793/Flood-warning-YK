const RISK_COLORS = {
  LOW: "#22c55e",
  MODERATE: "#eab308",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

let map = L.map("map", { zoomControl: true }).setView([30.3, 79.0], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 18,
}).addTo(map);

let markers = {};

function riskBadge(level) {
  const c = RISK_COLORS[level] || "#888";
  return `<span class="risk-tag" style="background:${c}">${level}</span>`;
}

function renderSummary(locations) {
  const counts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
  locations.forEach((l) => counts[l.risk_level] = (counts[l.risk_level] || 0) + 1);
  const el = document.getElementById("summary-cards");
  el.innerHTML = Object.keys(counts).map((k) => `
    <div class="summary-card" style="border-top:3px solid ${RISK_COLORS[k]}">
      <div class="count">${counts[k]}</div>
      <div class="label">${k}</div>
    </div>
  `).join("");
}

function renderList(locations) {
  const el = document.getElementById("location-list");
  el.innerHTML = locations.map((l) => `
    <div class="loc-card" style="border-left-color:${RISK_COLORS[l.risk_level]}" data-id="${l.id || l.name}">
      <div class="name">${l.name}</div>
      <div class="meta">
        <span>${riskBadge(l.risk_level)}</span>
        <span>${l.inputs.rainfall_24h_mm} mm / 24h</span>
      </div>
    </div>
  `).join("");

  el.querySelectorAll(".loc-card").forEach((card, i) => {
    card.addEventListener("click", () => {
      const loc = locations[i];
      map.flyTo([loc.lat, loc.lon], 10);
      showDetail(loc);
      if (markers[loc.id]) markers[loc.id].openPopup();
    });
  });
}

function markerIcon(level) {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${RISK_COLORS[level]};border:2px solid #0b1220;box-shadow:0 0 8px ${RISK_COLORS[level]}"></div>`,
    iconSize: [18, 18],
  });
}

function renderMarkers(locations) {
  Object.values(markers).forEach((m) => map.removeLayer(m));
  markers = {};
  locations.forEach((loc) => {
    const m = L.marker([loc.lat, loc.lon], { icon: markerIcon(loc.risk_level) }).addTo(map);
    m.bindPopup(`
      <b>${loc.name}</b><br/>
      Risk: <b style="color:${RISK_COLORS[loc.risk_level]}">${loc.risk_level}</b><br/>
      24h rainfall: ${loc.inputs.rainfall_24h_mm} mm<br/>
      Soil moisture: ${loc.inputs.soil_moisture_m3m3}
    `);
    m.on("click", () => showDetail(loc));
    markers[loc.id || loc.name] = m;
  });
}

function showDetail(loc) {
  const panel = document.getElementById("detail-panel");
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <span class="close-x" onclick="document.getElementById('detail-panel').classList.add('hidden')">✕</span>
    <h3>${loc.name}</h3>
    <div class="risk-big" style="color:${RISK_COLORS[loc.risk_level]}">${loc.risk_level}</div>
    <div class="row"><span>Lead time</span><b>${loc.lead_time_hours ? loc.lead_time_hours + " hrs" : "—"}</b></div>
    <div class="row"><span>1h rainfall</span><b>${loc.inputs.rainfall_1h_mm} mm</b></div>
    <div class="row"><span>6h rainfall</span><b>${loc.inputs.rainfall_6h_mm} mm</b></div>
    <div class="row"><span>24h rainfall</span><b>${loc.inputs.rainfall_24h_mm} mm</b></div>
    <div class="row"><span>Antecedent 72h</span><b>${loc.inputs.antecedent_rainfall_72h_mm} mm</b></div>
    <div class="row"><span>Soil moisture</span><b>${loc.inputs.soil_moisture_m3m3}</b></div>
    <div class="row"><span>Slope</span><b>${loc.inputs.slope_deg}°</b></div>
    <div class="row"><span>Elevation</span><b>${loc.inputs.elevation_m} m</b></div>
    <div class="action-box"><b>Recommended action</b><br/>${loc.recommended_action}</div>
    <div class="src">Weather: ${loc.data_sources.weather}<br/>Terrain: ${loc.data_sources.terrain}</div>
  `;
}

async function loadDashboard() {
  document.getElementById("refresh-btn").textContent = "⟳ Loading...";
  try {
    const res = await fetch("/api/dashboard");
    const data = await res.json();
    renderSummary(data.locations);
    renderList(data.locations);
    renderMarkers(data.locations);
    document.getElementById("last-updated").textContent =
      "Updated " + new Date(data.generated_at * 1000).toLocaleTimeString();
  } catch (e) {
    document.getElementById("last-updated").textContent = "Failed to load: " + e;
  }
  document.getElementById("refresh-btn").textContent = "⟳ Refresh";
}

document.getElementById("refresh-btn").addEventListener("click", loadDashboard);

document.getElementById("check-btn").addEventListener("click", async () => {
  const lat = parseFloat(document.getElementById("lat-input").value);
  const lon = parseFloat(document.getElementById("lon-input").value);
  const name = document.getElementById("name-input").value || "Custom location";
  if (isNaN(lat) || isNaN(lon)) {
    alert("Please enter valid latitude and longitude.");
    return;
  }
  const res = await fetch(`/api/predict?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}`);
  const loc = await res.json();
  loc.id = "custom-" + Date.now();
  map.flyTo([lat, lon], 11);
  const m = L.marker([lat, lon], { icon: markerIcon(loc.risk_level) }).addTo(map);
  m.bindPopup(`<b>${loc.name}</b><br/>Risk: <b style="color:${RISK_COLORS[loc.risk_level]}">${loc.risk_level}</b>`).openPopup();
  showDetail(loc);
});

loadDashboard();
