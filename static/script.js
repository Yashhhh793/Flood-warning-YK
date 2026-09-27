const API = "";

let map;
let markersLayer;
let selectedMarker = null;
let dashboardMarkers = [];

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[c]));
}

function riskColor(level) {
  return ({
    LOW: "#22c55e",
    MODERATE: "#eab308",
    HIGH: "#f97316",
    CRITICAL: "#ef4444"
  })[level] || "#8ea0c2";
}

/* =========================
   MAP
   ========================= */

function initMap() {
  map = L.map("map", {
    zoomControl: true
  }).setView([22.9734, 78.6569], 5);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  /* Click anywhere on map */
  map.on("click", async (e) => {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    setSelectedLocation(
      lat,
      lon,
      "Map selected location",
      true
    );

    await reverseGeocode(lat, lon);
  });
}


/* =========================
   LOCATION SELECT
   ========================= */

function setSelectedLocation(
  lat,
  lon,
  name = "Selected location",
  moveMap = true
) {
  lat = Number(lat);
  lon = Number(lon);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return;
  }

  const latInput = $("lat-input");
  const lonInput = $("lon-input");
  const locationInput = $("location-input");
  const selectedBox = $("selected-location-box");
  const checkBtn = $("check-btn");

  if (latInput) {
    latInput.value = lat.toFixed(6);
  }

  if (lonInput) {
    lonInput.value = lon.toFixed(6);
  }

  if (locationInput && name) {
    locationInput.value = name;
  }

  if (selectedBox) {
    selectedBox.innerHTML =
      `<strong>Selected:</strong> ${esc(name)}<br>` +
      `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }

  if (checkBtn) {
    checkBtn.disabled = false;
  }

  if (selectedMarker) {
    map.removeLayer(selectedMarker);
  }

  selectedMarker = L.marker(
    [lat, lon],
    { draggable: true }
  ).addTo(map);

  selectedMarker.bindTooltip(
    name || "Selected location"
  );

  selectedMarker.on("dragend", async () => {
    const p = selectedMarker.getLatLng();

    setSelectedLocation(
      p.lat,
      p.lng,
      "Selected location",
      false
    );

    await reverseGeocode(p.lat, p.lng);
  });

  if (moveMap) {
    map.setView(
      [lat, lon],
      Math.max(map.getZoom(), 10)
    );
  }
}


/* =========================
   SEARCH LOCATION
   ========================= */

let searchTimer = null;

function bindLocationSearch() {
  const input = $("location-input");
  const suggestions = $("location-suggestions");

  if (!input || !suggestions) return;

  input.addEventListener("input", () => {

    clearTimeout(searchTimer);

    const query = input.value.trim();

    if (query.length < 2) {
      suggestions.classList.add("hidden");
      suggestions.innerHTML = "";
      return;
    }

    searchTimer = setTimeout(
      () => searchLocations(query),
      400
    );
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const query = input.value.trim();

      if (query) {
        searchLocations(query, true);
      }
    }

    if (e.key === "Escape") {
      suggestions.classList.add("hidden");
    }
  });
}


async function searchLocations(query, autoSelect = false) {

  const suggestions = $("location-suggestions");

  if (!suggestions) return;

  suggestions.classList.remove("hidden");

  suggestions.innerHTML =
    `<div class="location-suggestion">
      Searching...
    </div>`;

  try {

    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2` +
      `&addressdetails=1` +
      `&limit=5` +
      `&countrycodes=in` +
      `&q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Location search failed");
    }

    const results = await response.json();

    if (!results.length) {
      suggestions.innerHTML =
        `<div class="location-suggestion">
          Location not found
        </div>`;
      return;
    }

    suggestions.innerHTML = results.map((place, index) => {

      const title =
        place.display_name
          .split(",")
          .slice(0, 2)
          .join(", ");

      const coords =
        `${Number(place.lat).toFixed(5)}, ` +
        `${Number(place.lon).toFixed(5)}`;

      return `
        <div
          class="location-suggestion"
          data-index="${index}"
        >
          <div class="location-suggestion-title">
            ${esc(title)}
          </div>

          <div class="location-suggestion-coords">
            ${esc(place.display_name)}
            <br>
            ${coords}
          </div>
        </div>
      `;

    }).join("");

    document
      .querySelectorAll(".location-suggestion[data-index]")
      .forEach((item) => {

        item.addEventListener("click", () => {

          const index =
            Number(item.dataset.index);

          const place = results[index];

          const name =
            place.display_name
              .split(",")
              .slice(0, 2)
              .join(", ");

          setSelectedLocation(
            Number(place.lat),
            Number(place.lon),
            name,
            true
          );

          suggestions.classList.add("hidden");
        });
      });

    /* If Enter was pressed */
    if (autoSelect && results[0]) {

      const place = results[0];

      const name =
        place.display_name
          .split(",")
          .slice(0, 2)
          .join(", ");

      setSelectedLocation(
        Number(place.lat),
        Number(place.lon),
        name,
        true
      );

      suggestions.classList.add("hidden");
    }

  } catch (error) {

    console.error(error);

    suggestions.innerHTML =
      `<div class="location-suggestion">
        Search failed. Try again.
      </div>`;
  }
}


/* =========================
   REVERSE GEOCODING
   ========================= */

async function reverseGeocode(lat, lon) {

  try {

    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?format=jsonv2` +
      `&lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}`;

    const response = await fetch(url);

    if (!response.ok) return;

    const data = await response.json();

    let name = "Selected location";

    if (data.display_name) {
      name = data.display_name
        .split(",")
        .slice(0, 2)
        .join(", ");
    }

    const locationInput = $("location-input");

    if (locationInput) {
      locationInput.value = name;
    }

    const selectedBox = $("selected-location-box");

    if (selectedBox) {
      selectedBox.innerHTML =
        `<strong>Selected:</strong> ${esc(name)}<br>` +
        `${Number(lat).toFixed(6)}, ` +
        `${Number(lon).toFixed(6)}`;
    }

  } catch (error) {
    console.error("Reverse geocoding failed:", error);
  }
}


/* =========================
   CLEAR LOCATION
   ========================= */

function clearLocation() {

  if (selectedMarker) {
    map.removeLayer(selectedMarker);
    selectedMarker = null;
  }

  if ($("location-input")) {
    $("location-input").value = "";
  }

  if ($("lat-input")) {
    $("lat-input").value = "";
  }

  if ($("lon-input")) {
    $("lon-input").value = "";
  }

  if ($("selected-location-box")) {
    $("selected-location-box").innerHTML =
      "No location selected";
  }

  if ($("check-btn")) {
    $("check-btn").disabled = true;
  }

  if ($("location-suggestions")) {
    $("location-suggestions").classList.add("hidden");
  }
}


/* =========================
   PREDICT RISK
   ========================= */

async function predictSelected() {

  const lat =
    parseFloat($("lat-input")?.value);

  const lon =
    parseFloat($("lon-input")?.value);

  const name =
    ($("location-input")?.value ||
     "Selected location").trim();

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    alert(
      "Please select a location from the search box or map."
    );
    return;
  }

  const button = $("check-btn");

  button.disabled = true;
  button.textContent = "Checking...";

  try {

    const url =
      `${API}/api/predict` +
      `?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&name=${encodeURIComponent(name)}`;

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        await response.text()
      );
    }

    const data =
      await response.json();

    showSelectedResult(data);

  } catch (error) {

    console.error(error);

    alert(
      "Prediction failed. Please try again."
    );

  } finally {

    button.disabled = false;
    button.textContent = "Predict Risk";
  }
}


/* =========================
   RESULT PANEL
   ========================= */

function showSelectedResult(data) {

  const panel = $("detail-panel");

  if (!panel) return;

  const color =
    riskColor(data.risk_level);

  const inputs =
    data.inputs || {};

  const probability =
    data.probability ??
    data.risk_probability ??
    data.probabilities?.[data.risk_level] ??
    0;

  panel.innerHTML = `
    <span
      class="close-x"
      onclick="this.parentElement.classList.add('hidden')"
    >
      ×
    </span>

    <h3>${esc(data.name || "Selected location")}</h3>

    <div
      class="risk-big"
      style="color:${color}"
    >
      ${esc(data.risk_level || "UNKNOWN")}
    </div>

    <div class="row">
      <span>Probability</span>
      <strong>
        ${Math.round(Number(probability) * 100)}%
      </strong>
    </div>

    <div class="row">
      <span>1h Rainfall</span>
      <strong>
        ${inputs.rainfall_1h_mm ?? "—"} mm
      </strong>
    </div>

    <div class="row">
      <span>24h Rainfall</span>
      <strong>
        ${inputs.rainfall_24h_mm ?? "—"} mm
      </strong>
    </div>

    <div class="row">
      <span>Soil Moisture</span>
      <strong>
        ${inputs.soil_moisture_m3m3 ?? "—"}
      </strong>
    </div>

    <div class="row">
      <span>Elevation</span>
      <strong>
        ${inputs.elevation_m ?? "—"} m
      </strong>
    </div>

    <div class="row">
      <span>Slope</span>
      <strong>
        ${inputs.slope_deg ?? "—"}°
      </strong>
    </div>

    <div class="action-box">
      <strong>Recommended action</strong>
      <br>
      ${esc(
        data.recommended_action ||
        "Continue monitoring."
      )}
    </div>

    <div class="src">
      Weather:
      ${esc(data.data_sources?.weather || "—")}
      <br>
      Terrain:
      ${esc(data.data_sources?.terrain || "—")}
    </div>
  `;

  panel.classList.remove("hidden");

  if (
    Number.isFinite(Number(data.lat)) &&
    Number.isFinite(Number(data.lon))
  ) {

    setSelectedLocation(
      Number(data.lat),
      Number(data.lon),
      data.name || "Selected location",
      true
    );
  }
}


/* =========================
   MAP SELECT BUTTON
   ========================= */

function enableMapSelection() {

  alert(
    "Click anywhere on the map to select a location."
  );

  map.getContainer().style.cursor =
    "crosshair";

  const handler = (e) => {

    setSelectedLocation(
      e.latlng.lat,
      e.latlng.lng,
      "Map selected location",
      true
    );

    reverseGeocode(
      e.latlng.lat,
      e.latlng.lng
    );

    map.getContainer().style.cursor = "";

    map.off("click", handler);
  };

  map.once("click", handler);
}


/* =========================
   DASHBOARD
   ========================= */

async function loadDashboard() {

  try {

    const response =
      await fetch(`${API}/api/dashboard`);

    if (!response.ok) return;

    const data =
      await response.json();

    const locations =
      data.locations || [];

    renderSummary(locations);
    renderLocations(locations);
    renderMapMarkers(locations);

    if ($("last-updated")) {
      $("last-updated").textContent =
        `Updated ${new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })}`;
    }

  } catch (error) {

    console.error(
      "Dashboard loading failed:",
      error
    );

    if ($("last-updated")) {
      $("last-updated").textContent =
        "Update failed";
    }
  }
}


function renderSummary(locations) {

  const counts = {
    LOW: 0,
    MODERATE: 0,
    HIGH: 0,
    CRITICAL: 0
  };

  locations.forEach((location) => {

    if (counts[location.risk_level] !== undefined) {
      counts[location.risk_level]++;
    }
  });

  if (!$("summary-cards")) return;

  $("summary-cards").innerHTML =
    Object.entries(counts)
      .map(([risk, count]) => `
        <div
          class="summary-card"
          style="border-top:3px solid ${riskColor(risk)}"
        >
          <div class="count">${count}</div>
          <div class="label">${risk}</div>
        </div>
      `)
      .join("");
}


function renderLocations(locations) {

  if (!$("location-list")) return;

  $("location-list").innerHTML =
    locations.map((loc) => `
      <div
        class="loc-card"
        style="border-left-color:${riskColor(loc.risk_level)}"
      >
        <div class="name">
          ${esc(loc.name)}
        </div>

        <div class="meta">

          <span>
            ${Number(loc.lat).toFixed(3)},
            ${Number(loc.lon).toFixed(3)}
          </span>

          <span
            class="risk-tag"
            style="background:${riskColor(loc.risk_level)}"
          >
            ${esc(loc.risk_level)}
          </span>

        </div>
      </div>
    `).join("");

  document
    .querySelectorAll(".loc-card")
    .forEach((card, index) => {

      card.addEventListener("click", () => {

        const loc = locations[index];

        setSelectedLocation(
          loc.lat,
          loc.lon,
          loc.name,
          true
        );

        showSelectedResult(loc);
      });
    });
}


function renderMapMarkers(locations) {

  if (!markersLayer) return;

  markersLayer.clearLayers();

  dashboardMarkers = [];

  locations.forEach((loc) => {

    const marker =
      L.circleMarker(
        [loc.lat, loc.lon],
        {
          radius: 8,
          color: "#ffffff",
          weight: 1.5,
          fillColor: riskColor(loc.risk_level),
          fillOpacity: 0.9
        }
      ).addTo(markersLayer);

    marker.bindPopup(
      `<strong>${esc(loc.name)}</strong><br>` +
      `<b style="color:${riskColor(loc.risk_level)}">` +
      `${esc(loc.risk_level)} risk` +
      `</b>`
    );

    marker.on("click", () => {

      setSelectedLocation(
        loc.lat,
        loc.lon,
        loc.name,
        true
      );

      showSelectedResult(loc);
    });

    dashboardMarkers.push(marker);
  });
}


/* =========================
   BUTTONS
   ========================= */

function bindUI() {

  $("check-btn")?.addEventListener(
    "click",
    predictSelected
  );

  $("refresh-btn")?.addEventListener(
    "click",
    loadDashboard
  );

  $("map-select-btn")?.addEventListener(
    "click",
    enableMapSelection
  );

  $("clear-location-btn")?.addEventListener(
    "click",
    clearLocation
  );

  bindLocationSearch();
}


/* =========================
   START
   ========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    initMap();

    bindUI();

    loadDashboard();
  }
);
