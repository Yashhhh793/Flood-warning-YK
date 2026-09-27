"""Sample village/ward locations in flash-flood-prone Indian hill
regions, used to pre-populate the dashboard map. lat/lon are real
coordinates; elevation is an approximate reference value (the API
also re-fetches live elevation via Open-Elevation when possible)."""

SAMPLE_LOCATIONS = [
    {"id": "joshimath", "name": "Joshimath, Uttarakhand", "lat": 30.5546, "lon": 79.5644, "elevation_m": 1875},
    {"id": "kedarnath", "name": "Kedarnath, Uttarakhand", "lat": 30.7346, "lon": 79.0669, "elevation_m": 3583},
    {"id": "chamoli", "name": "Chamoli, Uttarakhand", "lat": 30.4000, "lon": 79.3200, "elevation_m": 1308},
    {"id": "rudraprayag", "name": "Rudraprayag, Uttarakhand", "lat": 30.2848, "lon": 78.9808, "elevation_m": 895},
    {"id": "nainital", "name": "Nainital, Uttarakhand", "lat": 29.3803, "lon": 79.4636, "elevation_m": 2084},
    {"id": "shimla", "name": "Shimla, Himachal Pradesh", "lat": 31.1048, "lon": 77.1734, "elevation_m": 2205},
    {"id": "manali", "name": "Manali, Himachal Pradesh", "lat": 32.2432, "lon": 77.1892, "elevation_m": 2050},
    {"id": "kullu", "name": "Kullu, Himachal Pradesh", "lat": 31.9578, "lon": 77.1095, "elevation_m": 1279},
    {"id": "gangtok", "name": "Gangtok, Sikkim", "lat": 27.3389, "lon": 88.6065, "elevation_m": 1650},
    {"id": "darjeeling", "name": "Darjeeling, West Bengal", "lat": 27.0410, "lon": 88.2663, "elevation_m": 2042},
    {"id": "wayanad", "name": "Wayanad, Kerala", "lat": 11.6854, "lon": 76.1320, "elevation_m": 780},
    {"id": "idukki", "name": "Idukki, Kerala", "lat": 9.8494, "lon": 76.9681, "elevation_m": 1200},
]
