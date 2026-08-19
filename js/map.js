(() => {
  const MAP_CENTER = [35.832, 140.145];
  const MAP_ZOOM = 12;
  const STATUS_CLASSES = new Set(['green', 'yellow', 'red', 'gray']);
  let map = null;
  let markersById = new Map();

  function escapeHtml(value) {
    const element = document.createElement('span');
    element.textContent = String(value ?? '');
    return element.innerHTML;
  }

  function validateShelter(shelter) {
    return shelter && shelter.id && shelter.name
      && Number.isFinite(Number(shelter.latitude))
      && Number.isFinite(Number(shelter.longitude))
      && shelter.evacuees && Number.isFinite(Number(shelter.evacuees.total));
  }

  function createMarkerIcon(status) {
    const safeStatus = STATUS_CLASSES.has(status) ? status : 'gray';
    return L.divIcon({
      className: '',
      html: `<div class="shelter-marker status-${safeStatus}"><span>避</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 28],
      popupAnchor: [0, -28]
    });
  }

  function makePopup(shelter, supply) {
    const supplies = supply
      ? `${supply.water.label}・${supply.food.label}・${supply.blankets.label}`
      : '未確認';
    return `
      <article>
        <h3 class="popup-title">${escapeHtml(shelter.name)}</h3>
        <div class="popup-row"><span class="popup-label">避難者数</span><span class="popup-value">${escapeHtml(shelter.evacuees.total)}人</span></div>
        <div class="popup-row"><span class="popup-label">主要物資</span><span class="popup-value">${escapeHtml(supplies)}</span></div>
        <div class="popup-row"><span class="popup-label">更新時刻</span><time class="popup-value">${escapeHtml(shelter.updatedAt)}</time></div>
        <div class="popup-row"><span class="popup-label">信頼度</span><span class="popup-value confidence"><i class="status-dot status-${escapeHtml(shelter.confidence.color)}"></i>${escapeHtml(shelter.confidence.level)}</span></div>
      </article>`;
  }

  function showMapError(message) {
    const error = document.getElementById('map-error');
    error.textContent = message;
    error.hidden = false;
  }

  function renderMarkers(shelters, supplies) {
    const validShelters = shelters.filter(validateShelter);
    if (validShelters.length !== shelters.length) {
      console.warn('必須項目が不足している避難所データを除外しました。');
    }
    const suppliesByShelter = new Map(supplies.map((item) => [item.shelterId, item]));
    const activeIds = new Set(validShelters.map((shelter) => shelter.id));
    markersById.forEach((marker, shelterId) => {
      if (!activeIds.has(shelterId)) {
        marker.remove();
        markersById.delete(shelterId);
      }
    });
    validShelters.forEach((shelter) => {
      const existingMarker = markersById.get(shelter.id);
      if (existingMarker) {
        existingMarker.setLatLng([Number(shelter.latitude), Number(shelter.longitude)]);
        existingMarker.setIcon(createMarkerIcon(shelter.status));
        existingMarker.setPopupContent(makePopup(shelter, suppliesByShelter.get(shelter.id)));
        return;
      }
      const marker = L.marker([Number(shelter.latitude), Number(shelter.longitude)], {
        icon: createMarkerIcon(shelter.status)
      }).addTo(map).bindPopup(makePopup(shelter, suppliesByShelter.get(shelter.id)));
      markersById.set(shelter.id, marker);
    });
  }

  function initMap(shelters, supplies) {
    if (typeof L === 'undefined') {
      showMapError('地図ライブラリを読み込めませんでした。ネットワーク接続を確認してください。');
      return;
    }

    map = L.map('map', { center: MAP_CENTER, zoom: MAP_ZOOM, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    renderMarkers(shelters, supplies);
  }

  function updateMap(shelters, supplies) {
    if (!map) return;
    renderMarkers(shelters, supplies);
  }

  window.addEventListener('shelter-map:shown', () => {
    window.setTimeout(() => map?.invalidateSize(), 0);
  });

  window.ShelterMap = { init: initMap, update: updateMap };
})();
