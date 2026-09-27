const API = "";

let map = null;
let selectedMarker = null;
let selectedLocation = null;

let searchTimer = null;


/* =========================
   HELPER
========================= */

function $(id) {
  return document.getElementById(id);
}


/* =========================
   MAP INITIALIZATION
========================= */

function initMap() {

  if (map) return;

  // India center
  map = L.map("map").setView([22.9734, 78.6569], 5);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(map);


  // Map click
  map.on("click", async function (event) {

    const lat = event.latlng.lat;
    const lon = event.latlng.lng;

    await reverseGeocode(lat, lon);

  });

}


/* =========================
   SET SELECTED LOCATION
========================= */

function setSelectedLocation(
  lat,
  lon,
  name = "Selected Location",
  moveMap = true
) {

  lat = Number(lat);
  lon = Number(lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return;
  }

  selectedLocation = {
    lat: lat,
    lon: lon,
    name: name || "Selected Location"
  };


  // Inputs
  $("lat-input").value = lat.toFixed(6);
  $("lon-input").value = lon.toFixed(6);

  $("selected-location-name").textContent =
    selectedLocation.name;

  $("selected-location-box").classList.remove("hidden");


  // Marker
  if (selectedMarker) {
    map.removeLayer(selectedMarker);
  }

  selectedMarker = L.marker([lat, lon])
    .addTo(map)
    .bindPopup(
      `<b>${escapeHtml(selectedLocation.name)}</b><br>
       ${lat.toFixed(6)}, ${lon.toFixed(6)}`
    )
    .openPopup();


  if (moveMap) {
    map.setView([lat, lon], 11);
  }


  // Hide suggestions
  $("location-suggestions").classList.add("hidden");

}


/* =========================
   SEARCH LOCATION
========================= */

function bindLocationSearch() {

  const input = $("location-input");

  input.addEventListener("input", function () {

    const query = input.value.trim();

    clearTimeout(searchTimer);

    if (query.length < 2) {

      $("location-suggestions").innerHTML = "";

      $("location-suggestions")
        .classList.add("hidden");

      return;
    }


    searchTimer = setTimeout(
      () => searchLocations(query),
      600
    );

  });


  // Enter key
  input.addEventListener("keydown", function (event) {

    if (event.key === "Enter") {

      event.preventDefault();

      const query = input.value.trim();

      if (query.length >= 2) {
        searchLocations(query, true);
      }

    }

  });

}


/* =========================
   NOMINATIM SEARCH
========================= */

async function searchLocations(
  query,
  autoSelect = false
) {

  const suggestions = $("location-suggestions");

  try {

    suggestions.innerHTML =
      `<div class="location-suggestion">
        🔎 Searching...
      </div>`;

    suggestions.classList.remove("hidden");


    const url =
      "https://nominatim.openstreetmap.org/search" +
      "?format=jsonv2" +
      "&addressdetails=1" +
      "&limit=5" +
      "&countrycodes=in" +
      "&q=" +
      encodeURIComponent(query);


    const response = await fetch(url, {
      headers: {
        "Accept": "application/json"
      }
    });


    if (!response.ok) {
      throw new Error("Location search failed");
    }


    const places = await response.json();


    if (!places.length) {

      suggestions.innerHTML =
        `<div class="location-suggestion">
          ❌ No location found
        </div>`;

      return;
    }


    suggestions.innerHTML = "";


    places.forEach(place => {

      const item =
        document.createElement("div");

      item.className =
        "location-suggestion";


      const title =
        getPlaceName(place);


      item.innerHTML = `
        <div class="location-suggestion-title">
          📍 ${escapeHtml(title)}
        </div>

        <div class="location-suggestion-coords">
          ${Number(place.lat).toFixed(5)},
          ${Number(place.lon).toFixed(5)}
        </div>
      `;


      item.addEventListener("click", function () {

        setSelectedLocation(
          Number(place.lat),
          Number(place.lon),
          title,
          true
        );

        $("location-input").value = title;

      });


      suggestions.appendChild(item);

    });


    // Enter = first result
    if (autoSelect && places.length > 0) {

      const first = places[0];

      const title = getPlaceName(first);

      setSelectedLocation(
        Number(first.lat),
        Number(first.lon),
        title,
        true
      );

      $("location-input").value = title;

    }

  } catch (error) {

    console.error(error);

    suggestions.innerHTML =
      `<div class="location-suggestion">
        ⚠️ Unable to search location
      </div>`;

  }

}


/* =========================
   PLACE NAME
========================= */

function getPlaceName(place) {

  const address = place.address || {};

  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state ||
    place.display_name ||
    "Selected Location"
  );

}


/* =========================
   REVERSE GEOCODING
========================= */

async function reverseGeocode(lat, lon) {

  try {

    const url =
      "https://nominatim.openstreetmap.org/reverse" +
      "?format=jsonv2" +
      "&zoom=10" +
      "&lat=" +
      encodeURIComponent(lat) +
      "&lon=" +
      encodeURIComponent(lon);


    const response = await fetch(url, {
      headers: {
        "Accept": "application/json"
      }
    });


    if (!response.ok) {
      throw new Error("Reverse geocoding failed");
    }


    const data = await response.json();

    const name = getPlaceName(data);

    setSelectedLocation(
      lat,
      lon,
      name,
      true
    );

    $("location-input").value = name;

  } catch (error) {

    console.error(error);

    setSelectedLocation(
      lat,
      lon,
      "Selected Map Location",
      true
    );

    $("location-input").value =
      "Selected Map Location";

  }

}


/* =========================
   CLEAR LOCATION
========================= */

function clearLocation() {

  selectedLocation = null;


  $("location-input").value = "";

  $("lat-input").value = "";

  $("lon-input").value = "";

  $("selected-location-name").textContent = "—";

  $("selected-location-box")
    .classList.add("hidden");


  $("location-suggestions")
    .classList.add("hidden");


  if (selectedMarker) {

    map.removeLayer(selectedMarker);

    selectedMarker = null;

  }

}


/* =========================
   PREDICT
========================= */

async function predictSelected() {

  if (!selectedLocation) {

    alert(
      "Please select a location first."
    );

    return;

  }


  const button = $("check-btn");

  button.disabled = true;

  button.textContent =
    "⏳ Predicting...";


  try {

    const lat = selectedLocation.lat;

    const lon = selectedLocation.lon;

    const name = selectedLocation.name;


    const url =
      `${API}/api/predict` +
      `?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&name=${encodeURIComponent(name)}`;


    const response = await fetch(url);


    const data = await response.json();


    if (!response.ok) {

      throw new Error(
        data.detail ||
        "Prediction failed"
      );

    }


    showSelectedResult(data);

  } catch (error) {

    console.error(error);

    showError(
      error.message ||
      "Unable to get flood prediction."
    );

  } finally {

    button.disabled = false;

    button.textContent =
      "🔍 Predict Flood Risk";

  }

}


/* =========================
   SHOW RESULT
========================= */

function showSelectedResult(data) {

  const section =
    $("result-section");

  const panel =
    $("detail-panel");


  section.classList.remove("hidden");


  const probability =
    getValue(
      data,
      [
        "probability",
        "landslide_probability",
        "flood_probability",
        "risk_probability"
      ],
      null
    );


  const risk =
    getValue(
      data,
      [
        "risk_level",
        "risk",
        "prediction",
        "status"
      ],
      "UNKNOWN"
    );


  const rainfall3 =
    getValue(
      data,
      [
        "rainfall_3day_mm",
        "rainfall_3d",
        "rainfall_3_day"
      ],
      "—"
    );


  const rainfall7 =
    getValue(
      data,
      [
        "rainfall_7day_mm",
        "rainfall_7d",
        "rainfall_7_day"
      ],
      "—"
    );


  const soil =
    getValue(
      data,
      [
        "soil_moisture_m3_m3",
        "soil_moisture"
      ],
      "—"
    );


  const elevation =
    getValue(
      data,
      [
        "elevation_m",
        "elevation"
      ],
      "—"
    );


  const slope =
    getValue(
      data,
      [
        "slope_degrees",
        "slope"
      ],
      "—"
    );


  let probabilityText = "—";

  if (
    probability !== null &&
    probability !== undefined &&
    probability !== "—"
  ) {

    let p = Number(probability);

    if (p <= 1) {
      p = p * 100;
    }

    probabilityText =
      p.toFixed(2) + "%";

  }


  const riskClass =
    getRiskClass(String(risk));


  panel.innerHTML = `

    <div class="risk-result ${riskClass}">

      <div class="risk-main">

        <div class="risk-label">
          FLOOD RISK
        </div>

        <div class="risk-value">
          ${escapeHtml(String(risk))}
        </div>

        <div class="risk-probability">
          Probability:
          <strong>${probabilityText}</strong>
        </div>

      </div>


      <div class="risk-data">

        <div class="data-item">
          <span>🌧️ 3-Day Rainfall</span>
          <strong>${formatValue(rainfall3, " mm")}</strong>
        </div>

        <div class="data-item">
          <span>🌧️ 7-Day Rainfall</span>
          <strong>${formatValue(rainfall7, " mm")}</strong>
        </div>

        <div class="data-item">
          <span>💧 Soil Moisture</span>
          <strong>${formatValue(soil, "")}</strong>
        </div>

        <div class="data-item">
          <span>⛰️ Elevation</span>
          <strong>${formatValue(elevation, " m")}</strong>
        </div>

        <div class="data-item">
          <span>📐 Slope</span>
          <strong>${formatValue(slope, "°")}</strong>
        </div>

      </div>

    </div>

  `;


  section.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/* =========================
   DASHBOARD
========================= */

async function loadDashboard() {

  const dashboard =
    $("dashboard");


  dashboard.innerHTML =
    `<p>⏳ Loading dashboard...</p>`;


  try {

    const response =
      await fetch(
        `${API}/api/dashboard`
      );


    if (!response.ok) {
      throw new Error(
        "Dashboard unavailable"
      );
    }


    const data =
      await response.json();


    renderDashboard(data);

  } catch (error) {

    console.error(error);

    dashboard.innerHTML =
      `<p>
        ⚠️ Dashboard data unavailable.
      </p>`;

  }

}


/* =========================
   RENDER DASHBOARD
========================= */

function renderDashboard(data) {

  const dashboard =
    $("dashboard");


  if (!data || typeof data !== "object") {

    dashboard.innerHTML =
      `<p>No dashboard data available.</p>`;

    return;

  }


  let html =
    `<div class="dashboard-grid">`;


  Object.entries(data).forEach(
    ([key, value]) => {

      if (
        typeof value === "object" &&
        value !== null
      ) {
        return;
      }


      html += `

        <div class="data-item">

          <span>
            ${escapeHtml(formatKey(key))}
          </span>

          <strong>
            ${escapeHtml(String(value))}
          </strong>

        </div>

      `;

    }
  );


  html += `</div>`;


  dashboard.innerHTML = html;

}


/* =========================
   REFRESH
========================= */

function refreshDashboard() {

  loadDashboard();

}


/* =========================
   GET VALUE
========================= */

function getValue(
  object,
  keys,
  fallback = "—"
) {

  for (const key of keys) {

    if (
      object &&
      object[key] !== undefined &&
      object[key] !== null
    ) {

      return object[key];

    }

  }

  return fallback;

}


/* =========================
   RISK CLASS
========================= */

function getRiskClass(risk) {

  const value =
    risk.toLowerCase();


  if (
    value.includes("critical")
  ) {
    return "risk-critical";
  }


  if (
    value.includes("high")
  ) {
    return "risk-high";
  }


  if (
    value.includes("moderate") ||
    value.includes("medium")
  ) {
    return "risk-moderate";
  }


  if (
    value.includes("low")
  ) {
    return "risk-low";
  }


  return "";

}


/* =========================
   FORMAT VALUE
========================= */

function formatValue(
  value,
  suffix = ""
) {

  if (
    value === null ||
    value === undefined ||
    value === "—"
  ) {
    return "—";
  }


  if (
    typeof value === "number"
  ) {

    return (
      value.toFixed(2) +
      suffix
    );

  }


  return (
    String(value) +
    suffix
  );

}


/* =========================
   FORMAT KEY
========================= */

function formatKey(key) {

  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, char =>
      char.toUpperCase()
    );

}


/* =========================
   ERROR
========================= */

function showError(message) {

  $("result-section")
    .classList.remove("hidden");


  $("detail-panel").innerHTML = `

    <div class="risk-result risk-high">

      <div class="risk-main">

        <div class="risk-label">
          ERROR
        </div>

        <div class="risk-value">
          ⚠️ Unable to Predict
        </div>

        <div class="risk-probability">
          ${escapeHtml(message)}
        </div>

      </div>

    </div>

  `;

}


/* =========================
   HTML ESCAPE
========================= */

function escapeHtml(value) {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================
   UI BINDING
========================= */

function bindUI() {

  $("check-btn")
    .addEventListener(
      "click",
      predictSelected
    );


  $("refresh-btn")
    .addEventListener(
      "click",
      refreshDashboard
    );


  $("clear-location-btn")
    .addEventListener(
      "click",
      clearLocation
    );


  $("map-select-btn")
    .addEventListener(
      "click",
      function () {

        $("map").scrollIntoView({
          behavior: "smooth",
          block: "center"
        });

        alert(
          "Click anywhere on the map to select a location."
        );

      }
    );


  bindLocationSearch();


  // Close suggestions when clicking outside
  document.addEventListener(
    "click",
    function (event) {

      const wrapper =
        document.querySelector(
          ".location-search-wrapper"
        );

      if (
        wrapper &&
        !wrapper.contains(event.target)
      ) {

        $("location-suggestions")
          .classList.add("hidden");

      }

    }
  );

}


/* =========================
   START APPLICATION
========================= */

document.addEventListener(
  "DOMContentLoaded",
  function () {

    initMap();

    bindUI();

    loadDashboard();

  }
);
