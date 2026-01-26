// ==========================================
// 1. IMPORTATION & CONFIGURATION FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getFirestore, collection, getDocs, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Tes clés Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDDQ-SNampe1cwRgAXrGcd1Ta_aVJKOqGE",
  authDomain: "ethan-randos.firebaseapp.com",
  projectId: "ethan-randos",
  storageBucket: "ethan-randos.firebasestorage.app",
  messagingSenderId: "478245028007",
  appId: "1:478245028007:web:401c3f0cd25dc0a1745b82",
  measurementId: "G-2ZZ60TDVDP"
};

// --- TA CLÉ MÉTÉO ---
const API_METEO = "d8228c5ce53a841509cf2c653e7b69d6"; 

// Initialisation
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);


// ==========================================
// 2. GESTION DE LA NAVIGATION (SPA)
// ==========================================
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.page-section');

// Fonction pour changer de section
window.showSection = function(targetId) {
    sections.forEach(sec => {
        sec.classList.remove('active');
        sec.classList.add('hidden');
    });
    
    navLinks.forEach(link => link.classList.remove('active'));

    const targetSection = document.getElementById(targetId);
    if(targetSection) {
        targetSection.classList.remove('hidden');
        targetSection.classList.add('active');
        targetSection.scrollTop = 0; 
    }

    const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
    if(activeLink) activeLink.classList.add('active');

    if(targetId === 'app-container' && typeof map !== 'undefined') {
        setTimeout(() => { map.invalidateSize(); }, 300);
    }

    const backBtn = document.getElementById('back-to-top');
    if (backBtn) {
        backBtn.classList.remove('visible');
        backBtn.style.display = (targetId === 'app-container') ? 'none' : 'flex';
    }
}

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('data-target');
        if (targetId) {
            showSection(targetId);
        }
    });
});

window.goToMap = function() { showSection('app-container'); }

window.openFromGallery = function(index) {
    showSection('app-container'); 
    setTimeout(() => {
        const item = document.getElementById(`item-${index}`);
        if(item) {
            item.click(); 
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 500); 
}


// ==========================================
// 3. CARTE INTERACTIVE
// ==========================================
const mainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap' });
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });

var map = L.map('map', { 
    center: [45.1885, 5.7245], 
    zoom: 12, 
    layers: [mainLayer], 
    zoomControl: false,
    tap: !L.Browser.mobile 
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

let markersCluster = null;
if (typeof L.markerClusterGroup !== 'undefined') {
    markersCluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true });
    map.addLayer(markersCluster);
}

const switchControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'map-switch-btn-container');
        const btn = L.DomUtil.create('button', 'map-switch-btn', container);
        btn.innerHTML = '<i class="fa-solid fa-layer-group"></i>';
        L.DomEvent.disableClickPropagation(btn);
        btn.onclick = function() {
            if (map.hasLayer(mainLayer)) { map.removeLayer(mainLayer); map.addLayer(satelliteLayer); btn.innerHTML = '<i class="fa-regular fa-map"></i>'; } 
            else { map.removeLayer(satelliteLayer); map.addLayer(mainLayer); btn.innerHTML = '<i class="fa-solid fa-layer-group"></i>'; }
        };
        return container;
    }
});
map.addControl(new switchControl());
L.control.locate({ position: 'topleft', strings: { title: "Me localiser" } }).addTo(map);

// VARIABLES GLOBALES
let myElevationChart = null;
let hoverMarker = null; 
let currentChartCoords = []; 
let allMapLayers = {}; 


// ==========================================
// 4. CHARGEMENT DES DONNÉES
// ==========================================
async function chargerRandos() {
    try {
        if (markersCluster) markersCluster.clearLayers();
        map.eachLayer(layer => { if (layer instanceof L.GPX || layer === hoverMarker) map.removeLayer(layer); });
        
        const listContainer = document.getElementById('randonnees-list');
        const galleryGrid = document.getElementById('gallery-grid');
        
        if(listContainer) listContainer.innerHTML = ''; 
        if(galleryGrid) galleryGrid.innerHTML = '';
        allMapLayers = {};

        console.log("Chargement Firebase...");
        const querySnapshot = await getDocs(collection(db, "randos"));
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const index = doc.id; 
            data.likes = (typeof data.likes === 'number' && data.likes >= 0) ? data.likes : 0;
            
            let safePhotos = [];
            if (data.photos) {
                if (Array.isArray(data.photos)) safePhotos = data.photos.map(p => (typeof p === 'object' && p.image) ? p.image : p);
                else if (typeof data.photos === 'string') safePhotos = [data.photos];
            }
            data.safePhotos = safePhotos;

            data.tags = data.tags || [];
            const tagsHTML = generateTagsHTML(data.tags);

            setupMapLayer(data, index, safePhotos, tagsHTML);
            addRandoToGallery(data, index, safePhotos);
        });

    } catch (error) { console.error("Erreur chargement :", error); }
}

chargerRandos();


// ==========================================
// 5. FONCTIONS CARTE & LISTE
// ==========================================
function setupMapLayer(data, index, safePhotos, tagsHTML) {
    const trackColor = getDiffColor(data.difficulty);
    const customIcon = L.divIcon({ className: 'custom-div-icon', html: "<div class='marker-pin'>🏔️</div>", iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -25] });

    const gpxLayer = new L.GPX(data.gpx, {
        async: true,
        marker_options: { startIconUrl: '', endIconUrl: '', shadowUrl: '', wptIconUrls: '', startIcon: null, endIcon: null },
        polyline_options: { color: trackColor, opacity: 0.9, weight: 6, lineCap: 'round' }
    }).on('loaded', function(e) {
        
        const dist = (e.target.get_distance() / 1000).toFixed(1);
        setTimeout(() => { const el = document.getElementById(`dist-${index}`); if(el) el.innerText = `${dist} km`; }, 100);

        const rawDate = e.target.get_start_time();
        if(rawDate) data.calculatedDate = rawDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

        let exactStart = null;
        const layers = e.target.getLayers();
        for(const l of layers) {
            if(l.getLatLngs) { const pts = l.getLatLngs(); if(pts.length > 0) { exactStart = (Array.isArray(pts[0])) ? pts[0][0] : pts[0]; break; } }
        }
        if (!exactStart) exactStart = e.target.getBounds().getCenter();
        data.startPoint = exactStart;

        let popupImg = (safePhotos.length > 0) ? safePhotos[0] : 'https://via.placeholder.com/260x140?text=Rando';
        const popupContent = `
            <div style="cursor:pointer;" onclick="document.getElementById('item-${index}').click()">
                <img src="${popupImg}" class="popup-header-img">
                <div class="popup-info">
                    <span class="popup-title">${data.title}</span>
                    <div class="popup-meta"><span>📏 ${dist} km</span> • <span style="color:${trackColor}; font-weight:bold;">📶 ${data.difficulty}</span></div>
                    <button style="margin-top:10px; background:#f97316; color:white; border:none; padding:6px 15px; border-radius:20px; font-weight:bold;">Voir Détails</button>
                </div>
            </div>`;

        const startMarker = L.marker(exactStart, { icon: customIcon }).bindPopup(popupContent);
        startMarker.on('click', (ev) => { L.DomEvent.stopPropagation(ev); afficherDetails(data, gpxLayer, tagsHTML); updateActiveItem(index); });
        startMarker.on('mouseover', function() { this.openPopup(); });
        
        if (markersCluster) markersCluster.addLayer(startMarker); else startMarker.addTo(map);
        gpxLayer.addTo(map);

        allMapLayers[index] = { marker: startMarker, track: gpxLayer };

        gpxLayer.bindPopup(popupContent);
        gpxLayer.on('click', (ev) => { L.DomEvent.stopPropagation(ev); afficherDetails(data, gpxLayer, tagsHTML); updateActiveItem(index); });
        
        gpxLayer.on('mousemove', (ev) => {
            updateHoverMarker(ev.latlng);
            if(myElevationChart && currentChartCoords.length > 0) {
                let closestIndex = 0, minDst = Infinity;
                for (let i = 0; i < currentChartCoords.length; i++) {
                    const coord = currentChartCoords[i];
                    if(coord) { const dst = map.distance(ev.latlng, coord); if(dst < minDst) { minDst = dst; closestIndex = i; } }
                }
                const chart = myElevationChart;
                if(chart.tooltip) {
                    chart.setActiveElements([{datasetIndex: 0, index: closestIndex}]);
                    chart.tooltip.setActiveElements([{datasetIndex: 0, index: closestIndex}]);
                    chart.update('none'); 
                }
            }
        });

        gpxLayer.on('mouseover', function() { this.setStyle({ weight: 8, opacity: 1 }); });
        gpxLayer.on('mouseout', function() { 
            this.setStyle({ weight: 6, opacity: 0.9 });
            if(hoverMarker) map.removeLayer(hoverMarker);
            if(myElevationChart) { myElevationChart.setActiveElements([]); myElevationChart.tooltip.setActiveElements([]); myElevationChart.update('none'); }
        });
    });

    addRandoToList(data, index, safePhotos, gpxLayer, tagsHTML);
}

function updateHoverMarker(latlng) {
    if (!hoverMarker) { hoverMarker = L.circleMarker(latlng, { radius: 8, color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1, interactive: false }).addTo(map); } 
    else { hoverMarker.setLatLng(latlng); if (!map.hasLayer(hoverMarker)) hoverMarker.addTo(map); }
}

function addRandoToList(data, index, photos, gpxLayer, tagsHTML) {
    const list = document.getElementById('randonnees-list');
    if (!list) return;

    const item = document.createElement('div');
    item.className = 'rando-item';
    item.id = `item-${index}`;
    
    item.setAttribute('data-diff', data.difficulty); 
    item.setAttribute('data-id', index); 
    const tagsString = (data.tags || []).join(',').toLowerCase();
    item.setAttribute('data-tags', tagsString);
    
    let thumbUrl = (photos && photos.length > 0) ? photos[0] : 'https://via.placeholder.com/80?text=Rando';
    const diffColor = getDiffColor(data.difficulty);
    const isFav = getFavoris().includes(index);
    const heartSymbol = isFav ? '❤️' : '🤍';
    const heartClass = isFav ? 'active' : '';

    item.innerHTML = `
        <img src="${thumbUrl}" class="list-thumb" loading="lazy" onerror="this.src='https://via.placeholder.com/80?text=Img'">
        <div class="list-content">
            <h3 style="margin:0; font-size:1rem; color:#0f172a;">${data.title}</h3>
            <p style="margin:2px 0; font-size:0.85rem; color:#64748b;">Distance : <span id="dist-${index}">...</span></p>
            <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:4px;">
                <span class="diff-badge" style="background:${diffColor}; padding:2px 8px; border-radius:10px; color:white; font-size:0.7rem;">${data.difficulty || "Moyenne"}</span>
                ${tagsHTML}
            </div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:center;">
            <button id="fav-btn-${index}" class="fav-btn-list ${heartClass}" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">${heartSymbol}</button>
            <span id="like-count-${index}" style="font-size:0.75rem; color:#64748b; font-weight:bold;">${data.likes}</span>
        </div>
    `;
    
    const favBtn = item.querySelector(`#fav-btn-${index}`);
    favBtn.addEventListener('click', async (e) => { e.stopPropagation(); await toggleGlobalLike(index, data); });

    item.addEventListener('click', () => {
        document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        afficherDetails(data, gpxLayer, tagsHTML);
        
        if (gpxLayer) {
            const zoomAction = () => { 
                map.flyToBounds(gpxLayer.getBounds(), {padding:[50,50], duration:1.5}); 
                setTimeout(()=>gpxLayer.openPopup(),1000); 
            };
            if (markersCluster) markersCluster.zoomToShowLayer(gpxLayer, zoomAction); 
            else zoomAction();
        }
        
        if (window.innerWidth < 768) { document.getElementById('sidebar').classList.add('minimized'); }
    });
    list.appendChild(item);
}


// ==========================================
// 6. GENERATION GALERIE (BANNIÈRES)
// ==========================================
function addRandoToGallery(data, index, photos) {
    const galleryGrid = document.getElementById('gallery-grid');
    if(!galleryGrid) return;

    let bannerImg = (photos && photos.length > 0) ? photos[0] : 'https://via.placeholder.com/400x300?text=Pas+d+image';
    const diffColor = getDiffColor(data.difficulty);

    const card = document.createElement('div');
    card.className = 'rando-banner-card';
    card.setAttribute('onclick', `openFromGallery('${index}')`);

    card.innerHTML = `
        <img src="${bannerImg}" class="rando-banner-img" loading="lazy" alt="${data.title}">
        <div class="rando-banner-overlay">
            <h3 class="banner-title">${data.title}</h3>
            <div class="banner-meta">
                <span style="background:${diffColor}; padding:4px 10px; border-radius:15px; font-size:0.8rem; color:white;">${data.difficulty}</span>
                <span style="margin-left:10px;">❤️ ${data.likes}</span>
            </div>
        </div>
    `;
    galleryGrid.appendChild(card);
}


// ==========================================
// 7. FILTRAGE COMPLET (LISTE + CARTE)
// ==========================================
window.filtrerRandos = function(filtre) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(b => { 
        if(b.getAttribute('onclick').includes(`'${filtre}'`)) b.classList.add('active');
    });

    const items = document.querySelectorAll('.rando-item');
    const favoris = window.getFavoris();
    const filtreLower = filtre.toLowerCase();

    items.forEach(item => {
        const id = item.getAttribute('data-id');
        const itemTags = item.getAttribute('data-tags') || ""; 
        const diff = item.getAttribute('data-diff'); 
        
        let isVisible = false;

        if (filtre === 'all') isVisible = true;
        else if (filtre === 'favoris') isVisible = favoris.includes(id);
        else {
            if (diff === filtre || itemTags.includes(filtreLower)) isVisible = true;
        }

        item.style.display = isVisible ? 'flex' : 'none';

        if (allMapLayers[id]) {
            const { marker, track } = allMapLayers[id];
            if (isVisible) {
                if (markersCluster) {
                    if (!markersCluster.hasLayer(marker)) markersCluster.addLayer(marker);
                } else {
                    if (!map.hasLayer(marker)) marker.addTo(map);
                }
                if (!map.hasLayer(track)) track.addTo(map);
            } else {
                if (markersCluster) {
                    if (markersCluster.hasLayer(marker)) markersCluster.removeLayer(marker);
                } else {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
                if (map.hasLayer(track)) map.removeLayer(track);
            }
        }
    });
}


// ==========================================
// 8. UI DÉTAILS (VERSION MOBILE AMÉLIORÉE)
// ==========================================
function afficherDetails(data, gpxLayer, tagsHTML) {
    const panel = document.getElementById('info-panel');
    const displayDate = data.calculatedDate || "Date inconnue";
    const diffColor = getDiffColor(data.difficulty);
    const startLat = data.startPoint ? data.startPoint.lat : 0;
    const startLng = data.startPoint ? data.startPoint.lng : 0;

    const topPhotos = data.safePhotos.slice(0, 2);
    const bottomPhotos = data.safePhotos.slice(2);
    let topGalleryHTML = '';
    if(topPhotos.length > 0) {
        topGalleryHTML = '<div class="photo-grid-top" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">';
        topPhotos.forEach(url => { topGalleryHTML += `<div class="photo-box"><a data-fslightbox="gallery" href="${url}"><img src="${url}" loading="lazy"></a></div>`; });
        topGalleryHTML += '</div>';
    }

    panel.innerHTML = `
        <div class="mobile-toggle-bar" onclick="toggleMobilePanel('info-panel')"><i class="fa-solid fa-chevron-down"></i></div>
        
        <div class="panel-header">
            <h2 style="margin:0;">${data.title}</h2>
            <button id="close-panel-btn" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#64748b;">×</button>
        </div>

        <div class="panel-content">
            <button id="btn-show-map" style="width:100%; padding:14px; background:#0f172a; color:white; border:none; border-radius:12px; font-weight:bold; margin-bottom:20px; display:flex; align-items:center; justify-content:center; gap:10px; cursor:pointer;">
                <i class="fa-solid fa-map"></i> Voir l'itinéraire sur la carte
            </button>

            <div style="margin-bottom:15px;">${tagsHTML}</div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <span style="color:#64748b; font-weight:700; font-size:0.9rem;">📅 ${displayDate}</span>
                <span style="background:${diffColor}; color:white; padding:4px 12px; border-radius:12px; font-weight:700; font-size:0.75rem;">${data.difficulty}</span>
            </div>

            ${topGalleryHTML}

            <div id="stats-placeholder" class="stats-grid">Chargement...</div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <button id="share-btn-action" class="share-btn" style="margin:0;"><i class="fa-solid fa-paper-plane"></i> Partager</button>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${startLat},${startLng}" target="_blank" class="share-btn" style="background:#10b981; color:white; margin:0; text-decoration:none;"><i class="fa-solid fa-location-arrow"></i> S'y rendre</a>
            </div>

            <a href="${data.gpx}" download class="download-btn"><i class="fa-solid fa-download"></i> Télécharger GPX</a>
            
            <div style="color:#334155; line-height:1.6; margin: 20px 0; font-size:0.95rem;">${marked.parse(data.description || "")}</div>
            
            <div class="chart-container"><canvas id="elevationChart"></canvas></div>

            <div id="weather-widget" style="background:#f0f9ff; padding:15px; border-radius:12px; margin-top:20px; margin-bottom:20px; border:1px solid #bae6fd; display:flex; align-items:center; gap:15px;">
                <i class="fa-solid fa-cloud-sun" style="font-size:1.5rem; color:#0ea5e9;"></i>
                <div style="flex-grow:1;">
                    <span style="font-weight:bold; color:#0284c7; display:block;">Météo au départ</span>
                    <span id="weather-text" style="font-size:0.9rem; color:#334155;">Chargement...</span>
                </div>
            </div>

            <h3 style="font-size:1rem; margin-top:10px; color:#334155;">📸 Plus de photos</h3>
            <div id="rando-photos-bottom" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; padding-bottom:20px;"></div>
        </div>
    `;

    const dist = (gpxLayer.get_distance() / 1000).toFixed(1); 
    const elev = gpxLayer.get_elevation_gain().toFixed(0);    
    const time = msToTime(gpxLayer.get_moving_time());
    document.getElementById('stats-placeholder').innerHTML = `
        <div class="stat-item"><span class="stat-value">${dist} km</span><span class="stat-label">Distance</span></div>
        <div class="stat-item"><span class="stat-value">${elev} m</span><span class="stat-label">Dénivelé</span></div>
        <div class="stat-item"><span class="stat-value">${time}</span><span class="stat-label">Temps</span></div>`;

    chargerMeteo(startLat, startLng);

    const pContainerBottom = document.getElementById('rando-photos-bottom');
    if(bottomPhotos.length > 0) {
        bottomPhotos.forEach(url => {
            const div = document.createElement('div'); div.className = 'photo-box';
            div.innerHTML = `<a data-fslightbox="gallery" href="${url}"><img src="${url}" loading="lazy"></a>`;
            pContainerBottom.appendChild(div);
        });
    } else { pContainerBottom.innerHTML = "<p style='color:#94a3b8; font-style:italic; font-size:0.9rem;'>Pas d'autres photos.</p>"; }
    
    if(typeof refreshFsLightbox === 'function') refreshFsLightbox();

    createChart(gpxLayer);

    // --- ACTIONS BOUTONS ---
    // 1. Fermer
    document.getElementById('close-panel-btn').onclick = () => {
        panel.classList.add('hidden');
        if(hoverMarker) map.removeLayer(hoverMarker);
        document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
    };

    // 2. Voir Carte (Réduit le panneau)
    document.getElementById('btn-show-map').onclick = () => {
        panel.classList.add('minimized');
        const icon = panel.querySelector('.mobile-toggle-bar i');
        if(icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
    };

    document.getElementById('share-btn-action').onclick = () => partagerRando(data.title);
    
    // Reset à l'ouverture
    panel.classList.remove('hidden');
    panel.classList.remove('minimized');
    const icon = panel.querySelector('.mobile-toggle-bar i');
    if(icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
}

function generateTagsHTML(tagsArray) {
    if (!tagsArray || !Array.isArray(tagsArray) || tagsArray.length === 0) return '';
    let html = '<div class="tags-container" style="display:inline-flex; gap:5px; margin-left:5px;">';
    tagsArray.forEach(tag => {
        let style = 'background:#f3f4f6; color:#374151;';
        const t = tag.toLowerCase();
        if (t.includes('bivouac')) style = 'background:#dbeafe; color:#1e40af;';
        else if (t.includes('alpinisme')) style = 'background:#fce7f3; color:#9d174d;';
        else if (t.includes('neige') || t.includes('ski')) style = 'background:#f1f5f9; color:#475569;';
        else if (t.includes('coucher') || t.includes('sunset')) style = 'background:#ffedd5; color:#9a3412;';
        else if (t.includes('mer de nuage')) style = 'background:#e0f2fe; color:#0369a1;';
        else if (t.includes('lac')) style = 'background:#ddd6fe; color:#5b21b6;';
        html += `<span style="${style} font-size:0.7rem; font-weight:700; padding:2px 6px; border-radius:6px; text-transform:uppercase;">${tag}</span>`;
    });
    html += '</div>';
    return html;
}

function createChart(gpxLayer) {
    const ctxCanvas = document.getElementById('elevationChart');
    if(!ctxCanvas || typeof Chart === 'undefined') return;

    const raw = gpxLayer.get_elevation_data();
    const lbls = [], dataPoints = [];
    currentChartCoords = []; 

    raw.forEach((p, i) => { 
        if(i % 10 === 0) { 
            lbls.push(p[0].toFixed(1)); 
            dataPoints.push(p[1]); 
            if(p.length >= 2) { const lat = p[p.length - 2]; const lng = p[p.length - 1]; currentChartCoords.push([lat, lng]); } 
            else { currentChartCoords.push(null); }
        } 
    }); 

    if(myElevationChart) myElevationChart.destroy();
    
    myElevationChart = new Chart(ctxCanvas.getContext('2d'), {
        type: 'line',
        data: { labels: lbls, datasets: [{ label: 'Altitude', data: dataPoints, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', fill: true, pointRadius: 0, borderWidth: 2, hoverRadius: 6, hoverBackgroundColor: '#0f172a' }] },
        options: { 
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: false, 
            scales: { x: {display:false}, y: {ticks:{font:{size:10}}} }, 
            plugins: { legend:{display:false}, tooltip: { intersect: false, mode: 'index' } },
            onHover: (e, elements) => {
                if (elements && elements.length > 0) {
                    const index = elements[0].index;
                    const latLng = currentChartCoords[index];
                    if (latLng) updateHoverMarker(latLng);
                }
            }
        }
    });
}

async function chargerMeteo(lat, lon) {
    const div = document.getElementById('weather-text');
    if (API_METEO.includes("TA_CLE")) { div.innerHTML = "<span style='color:orange'>Clé manquante</span>"; return; }
    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${API_METEO}`);
        if(!res.ok) throw new Error("Err");
        const data = await res.json();
        if(data.weather) {
            const desc = data.weather[0].description;
            const temp = Math.round(data.main.temp);
            div.innerHTML = `<strong>${temp}°C</strong> - ${desc.charAt(0).toUpperCase() + desc.slice(1)}`;
        }
    } catch (e) { div.innerText = "Météo indisponible"; }
}

async function toggleGlobalLike(docId, dataObj) {
    const btn = document.getElementById(`fav-btn-${docId}`);
    const countSpan = document.getElementById(`like-count-${docId}`);
    const isCurrentlyFav = getFavoris().includes(docId);
    let favoris = getFavoris();

    if (isCurrentlyFav) { favoris = favoris.filter(id => id !== docId); btn.innerHTML = '🤍'; btn.classList.remove('active'); if (dataObj.likes > 0) dataObj.likes -= 1; } 
    else { favoris.push(docId); btn.innerHTML = '❤️'; btn.classList.add('active'); dataObj.likes += 1; }
    
    localStorage.setItem('mes_favoris_randos', JSON.stringify(favoris));
    countSpan.innerText = dataObj.likes;

    try {
        const randoRef = doc(db, "randos", docId);
        if (isCurrentlyFav) { if(dataObj.likes >= 0) await updateDoc(randoRef, { likes: increment(-1) }); } 
        else { await updateDoc(randoRef, { likes: increment(1) }); }
    } catch (err) { console.error("Err Like:", err); }
}

function updateActiveItem(idx) {
    document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
    const sel = document.getElementById(`item-${idx}`);
    if(sel) { sel.classList.add('active'); sel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function getDiffColor(d) { if(d === 'Facile') return '#10b981'; if(d === 'Moyenne') return '#f59e0b'; if(d === 'Difficile') return '#ef4444'; if(d === 'Expert') return '#0f172a'; return '#f59e0b'; }
function msToTime(duration) { if (!duration) return "--"; var min = Math.floor((duration / (1000 * 60)) % 60); var h = Math.floor((duration / (1000 * 60 * 60)) % 24); return (h < 10 ? "0"+h : h) + "h" + (min < 10 ? "0"+min : min); }
window.getFavoris = function() { return JSON.parse(localStorage.getItem('mes_favoris_randos')) || []; }

window.partagerRando = async function(titre) {
    const url = window.location.href; const text = `Regarde cette rando : ${titre} ! 🏔️`;
    if (navigator.share) { try { await navigator.share({ title: titre, text: text, url: url }); } catch (err) {} } 
    else { navigator.clipboard.writeText(`${text} ${url}`).then(() => alert('Lien copié ! 📋')); }
}

window.toggleMobilePanel = function(panelId) {
    if (window.innerWidth > 768) return; 
    const panel = document.getElementById(panelId);
    if(panel) {
        panel.classList.toggle('minimized');
        const icon = panel.querySelector('.mobile-toggle-bar i');
        if(icon) {
            if(panel.classList.contains('minimized')) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); } 
            else { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        }
    }
}

// GESTION RECHERCHE (Debounce + Clavier Mobile)
const searchInput = document.getElementById('search-input');
let searchTimeout;

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('.rando-item').forEach(item => {
                const title = item.querySelector('h3').innerText.toLowerCase();
                item.style.display = title.includes(term) ? 'flex' : 'none';
            });
        }, 300); 
    });

    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            this.blur(); // Ferme le clavier mobile
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.getElementById('main-nav');
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('open');
            const icon = menuToggle.querySelector('i');
            if (nav.classList.contains('open')) { icon.classList.remove('fa-bars'); icon.classList.add('fa-xmark'); } 
            else { icon.classList.remove('fa-xmark'); icon.classList.add('fa-bars'); }
        });
        nav.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('open');
                const icon = menuToggle.querySelector('i');
                icon.classList.remove('fa-xmark'); icon.classList.add('fa-bars');
            });
        });
    }

    const backBtn = document.getElementById('back-to-top');
    if(backBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) backBtn.classList.add('visible');
            else backBtn.classList.remove('visible');
        });
        backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
});