// ==========================================
// 1. IMPORTATION & CONFIGURATION FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// --- CLE API METEO (OpenWeatherMap) ---
// 👇 REMPLACE CECI PAR TA CLÉ, SINON LA MÉTÉO AFFICHERA UNE ERREUR 👇
const API_METEO = "TA_CLE_OPENWEATHER_ICI"; 

// Initialisation Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);


// ==========================================
// 2. GESTION DE LA NAVIGATION (SPA)
// ==========================================
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.page-section');

function showSection(targetId) {
    sections.forEach(sec => sec.classList.remove('active'));
    sections.forEach(sec => sec.classList.add('hidden')); 
    navLinks.forEach(link => link.classList.remove('active'));

    const targetSection = document.getElementById(targetId);
    if(targetSection) {
        targetSection.classList.add('active');
        targetSection.classList.remove('hidden');
        targetSection.scrollTop = 0; 
    }

    const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
    if(activeLink) activeLink.classList.add('active');

    if(targetId === 'app-container' && map) {
        setTimeout(() => { map.invalidateSize(); }, 200);
    }

    // Masquer bouton retour haut sur la carte
    const backBtn = document.getElementById('back-to-top');
    if (backBtn) {
        backBtn.classList.remove('visible');
        if (targetId === 'app-container') backBtn.style.display = 'none';
        else backBtn.style.display = 'flex';
    }
}

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(link.getAttribute('data-target'));
    });
});

window.goToMap = function() { showSection('app-container'); }


// ==========================================
// 3. CONFIGURATION DE LA CARTE & CLUSTERING
// ==========================================

const mainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { 
    maxZoom: 17, attribution: '© OpenStreetMap' 
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
    maxZoom: 19, attribution: 'Tiles © Esri' 
});

var map = L.map('map', { 
    center: [45.1885, 5.7245], 
    zoom: 12, 
    layers: [mainLayer], 
    zoomControl: false 
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

// --- GROUPE DE CLUSTERING (Sécurité si la librairie manque) ---
let markersCluster;
if (typeof L.markerClusterGroup === 'function') {
    markersCluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50
    });
    map.addLayer(markersCluster);
} else {
    console.warn("Leaflet.markercluster non chargé. Les marqueurs ne seront pas regroupés.");
}

// Bouton Switch Satellite
const switchControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'map-switch-btn-container');
        const btn = L.DomUtil.create('button', 'map-switch-btn', container);
        btn.innerHTML = '<i class="fa-solid fa-layer-group"></i>';
        btn.title = "Changer le fond de carte";
        L.DomEvent.disableClickPropagation(btn);
        
        btn.onclick = function() {
            if (map.hasLayer(mainLayer)) {
                map.removeLayer(mainLayer); map.addLayer(satelliteLayer);
                btn.innerHTML = '<i class="fa-regular fa-map"></i>';
            } else {
                map.removeLayer(satelliteLayer); map.addLayer(mainLayer);
                btn.innerHTML = '<i class="fa-solid fa-layer-group"></i>';
            }
        };
        return container;
    }
});
map.addControl(new switchControl());
L.control.locate({ position: 'topleft', strings: { title: "Me localiser" } }).addTo(map);

let myElevationChart = null;


// ==========================================
// 4. CHARGEMENT DES DONNÉES (CORRIGÉ)
// ==========================================
async function chargerRandos() {
    try {
        console.log("Chargement depuis Firebase...");
        const querySnapshot = await getDocs(collection(db, "randos"));
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const index = doc.id; 

            let safePhotos = [];
            if (data.photos) {
                if (Array.isArray(data.photos)) safePhotos = data.photos.map(p => (typeof p === 'object' && p.image) ? p.image : p);
                else if (typeof data.photos === 'string') safePhotos = [data.photos];
            }
            data.safePhotos = safePhotos;

            const trackColor = getDiffColor(data.difficulty);

            // Icône "Montagne" dans le rond
            const customIcon = L.divIcon({
                className: 'custom-div-icon',
                html: "<div class='marker-pin'>🏔️</div>",
                iconSize: [40, 40],
                iconAnchor: [20, 20],
                popupAnchor: [0, -20]
            });

            // --- CRÉATION DE LA COUCHE GPX ---
            const gpxLayer = new L.GPX(data.gpx, {
                async: true,
                marker_options: {
                    startIcon: customIcon,
                    endIcon: null,
                    shadowUrl: null
                },
                polyline_options: { color: trackColor, opacity: 0.9, weight: 6, lineCap: 'round' }
            }).on('loaded', function(e) {
                // --- C'EST ICI QUE LA MAGIE OPÈRE (Une fois chargé) ---
                const dist = (e.target.get_distance() / 1000).toFixed(1);
                
                // Mise à jour de la distance dans la liste latérale
                setTimeout(() => {
                    const elDist = document.getElementById(`dist-${index}`);
                    if(elDist) elDist.innerText = `${dist} km`;
                }, 100);

                const rawDate = e.target.get_start_time();
                if(rawDate) data.calculatedDate = rawDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

                // Popup "Carte Postale"
                let popupImg = (data.safePhotos.length > 0) ? data.safePhotos[0] : 'https://via.placeholder.com/260x140?text=Rando';
                const popupContent = `
                    <div style="cursor:pointer;" onclick="document.getElementById('item-${index}').click()">
                        <img src="${popupImg}" class="popup-header-img">
                        <div class="popup-info">
                            <span class="popup-title">${data.title}</span>
                            <div class="popup-meta">
                                <span>📏 ${dist} km</span> • <span style="color:${trackColor}; font-weight:bold;">📶 ${data.difficulty}</span>
                            </div>
                            <button style="margin-top:10px; background:#f97316; color:white; border:none; padding:6px 15px; border-radius:20px; cursor:pointer; font-size:0.8rem; font-weight:bold;">Voir Détails</button>
                        </div>
                    </div>`;
                gpxLayer.bindPopup(popupContent);

                // --- IMPORTANT : AJOUT AU CLUSTER ICI SEULEMENT ---
                if (markersCluster) {
                    markersCluster.addLayer(gpxLayer);
                } else {
                    gpxLayer.addTo(map); // Fallback si pas de cluster
                }

            }).on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                afficherDetails(data, gpxLayer);
                updateActiveItem(index);
            });

            // Effets de survol sur la trace
            gpxLayer.on('mouseover', function() { this.setStyle({ weight: 8, opacity: 1 }); });
            gpxLayer.on('mouseout', function() { this.setStyle({ weight: 6, opacity: 0.9 }); });

            // On ajoute l'élément dans la liste latérale
            addRandoToList(data, index, safePhotos, gpxLayer);
        });

    } catch (error) { 
        console.error("Erreur critique chargement randos :", error); 
    }
}

// Lancer le chargement
chargerRandos();


// --- FONCTION AJOUT LISTE ---
function addRandoToList(data, index, photos, gpxLayer) {
    const list = document.getElementById('randonnees-list');
    if (!list) return;

    const item = document.createElement('div');
    item.className = 'rando-item';
    item.id = `item-${index}`;
    item.setAttribute('data-diff', data.difficulty); 
    item.setAttribute('data-id', index); 
    
    let thumbUrl = (photos && photos.length > 0) ? photos[0] : 'https://via.placeholder.com/80?text=Rando';
    const diffColor = getDiffColor(data.difficulty || "Moyenne");
    const isFav = getFavoris().includes(index);
    const heartIcon = isFav ? '❤️' : '🤍';
    const activeClass = isFav ? 'active' : '';

    item.innerHTML = `
        <img src="${thumbUrl}" class="list-thumb" loading="lazy" alt="${data.title}" onerror="this.src='https://via.placeholder.com/80?text=No+Img'">
        <div class="list-content">
            <h3 style="margin:0; font-size:1rem; color:#0f172a;">${data.title}</h3>
            <p style="margin:2px 0; font-size:0.85rem; color:#64748b;">Distance : <span id="dist-${index}">...</span></p>
            <span class="diff-badge" style="background-color: ${diffColor}; padding:2px 8px; border-radius:10px; color:white; font-size:0.7rem;">${data.difficulty || "Moyenne"}</span>
        </div>
        <button id="fav-btn-${index}" class="fav-btn-list ${activeClass}" onclick="toggleFavori('${index}', event)">${heartIcon}</button>
    `;
    
    item.addEventListener('click', () => {
        document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        afficherDetails(data, gpxLayer);
        
        // Zoom intelligent
        if (gpxLayer && markersCluster) {
            markersCluster.zoomToShowLayer(gpxLayer, () => {
                map.fitBounds(gpxLayer.getBounds());
                gpxLayer.openPopup();
            });
        } else if (gpxLayer) {
            map.fitBounds(gpxLayer.getBounds());
            gpxLayer.openPopup();
        }

        if (window.innerWidth < 768) {
            const sidebar = document.getElementById('sidebar');
            if(sidebar && !sidebar.classList.contains('minimized')) sidebar.classList.add('minimized');
        }
    });

    list.appendChild(item);
}


// ==========================================
// 5. PANNEAU DE DÉTAILS (MÉTÉO, GPS, GRAPHIQUE)
// ==========================================
function afficherDetails(data, gpxLayer) {
    const panel = document.getElementById('info-panel');
    const displayDate = data.calculatedDate || "Date inconnue";
    const diffColor = getDiffColor(data.difficulty);

    // Coordonnées approximatives (centre de la rando) pour Météo/GPS
    const center = gpxLayer.getBounds().getCenter(); 
    const lat = center.lat;
    const lng = center.lng;

    panel.innerHTML = `
        <div class="mobile-toggle-bar" onclick="toggleMobilePanel('info-panel')"><i class="fa-solid fa-chevron-down"></i></div>

        <div class="panel-header">
            <h2 style="margin:0;">${data.title}</h2>
            <button id="close-panel-btn" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#64748b;">×</button>
        </div>

        <div class="panel-content">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <span style="color:#64748b; font-weight:700; font-size:0.9rem;">📅 ${displayDate}</span>
                <span style="background:${diffColor}; color:white; padding:4px 12px; border-radius:12px; font-weight:700; font-size:0.75rem;">${data.difficulty}</span>
            </div>

            <div id="weather-widget" style="background:#f0f9ff; padding:15px; border-radius:12px; margin-bottom:20px; border:1px solid #bae6fd; display:flex; align-items:center; gap:15px;">
                <i class="fa-solid fa-cloud-sun" style="font-size:1.5rem; color:#0ea5e9;"></i>
                <div style="flex-grow:1;">
                    <span style="font-weight:bold; color:#0284c7; display:block;">Météo sur place</span>
                    <span id="weather-text" style="font-size:0.9rem; color:#334155;">Chargement...</span>
                </div>
            </div>

            <div id="stats-placeholder" class="stats-grid">Chargement...</div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <button id="share-btn-action" class="share-btn" style="margin:0;"><i class="fa-solid fa-paper-plane"></i> Partager</button>
                <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" class="share-btn" style="background:#10b981; color:white; margin:0; text-decoration:none;">
                    <i class="fa-solid fa-location-arrow"></i> S'y rendre
                </a>
            </div>

            <a href="${data.gpx}" download class="download-btn"><i class="fa-solid fa-download"></i> Télécharger GPX</a>
            
            <div style="color:#334155; line-height:1.6; margin: 20px 0; font-size:0.95rem;">${marked.parse(data.description || "")}</div>
            
            <div class="chart-container"><canvas id="elevationChart"></canvas></div>

            <h3 style="font-size:1.1rem; margin-top:20px; margin-bottom:10px;">📸 Galerie Photos</h3>
            <div id="rando-photos"></div>
        </div>
    `;

    // Stats
    const dist = (gpxLayer.get_distance() / 1000).toFixed(1); 
    const elev = gpxLayer.get_elevation_gain().toFixed(0);    
    const time = msToTime(gpxLayer.get_moving_time());
    document.getElementById('stats-placeholder').innerHTML = `
        <div class="stat-item"><span class="stat-value">${dist} km</span><span class="stat-label">Distance</span></div>
        <div class="stat-item"><span class="stat-value">${elev} m</span><span class="stat-label">Dénivelé</span></div>
        <div class="stat-item"><span class="stat-value">${time}</span><span class="stat-label">Temps</span></div>
    `;

    // Charger Météo
    chargerMeteo(lat, lng);

    // Photos
    const pContainer = document.getElementById('rando-photos');
    if(data.safePhotos && data.safePhotos.length > 0) {
        data.safePhotos.forEach(url => {
            const div = document.createElement('div');
            div.className = 'photo-box';
            div.innerHTML = `<a data-fslightbox="gallery" href="${url}"><img src="${url}" loading="lazy"></a>`;
            pContainer.appendChild(div);
        });
        if(typeof refreshFsLightbox === 'function') refreshFsLightbox();
    } else { pContainer.innerHTML = "<p style='color:#94a3b8; font-style:italic;'>Pas de photos.</p>"; }

    // Graphique
    createChart(gpxLayer);

    document.getElementById('close-panel-btn').onclick = () => {
        panel.classList.add('hidden');
        document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
    };
    document.getElementById('share-btn-action').onclick = () => partagerRando(data.title);

    panel.classList.remove('hidden');
    panel.classList.remove('minimized');
}

// --- GRAPHIQUE ---
function createChart(gpxLayer) {
    const ctxCanvas = document.getElementById('elevationChart');
    if(!ctxCanvas || typeof Chart === 'undefined') return;

    const raw = gpxLayer.get_elevation_data();
    const lbls=[], dataPoints=[];
    raw.forEach((p, i) => { if(i%10===0) { lbls.push(p[0].toFixed(1)); dataPoints.push(p[1]); } }); 

    if(myElevationChart) myElevationChart.destroy();
    myElevationChart = new Chart(ctxCanvas.getContext('2d'), {
        type: 'line',
        data: { 
            labels: lbls, 
            datasets: [{ 
                label: 'Altitude', data: dataPoints, 
                borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', 
                fill: true, pointRadius: 0, borderWidth: 2, hoverRadius: 6 
            }] 
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            interaction: { mode: 'index', intersect: false },
            scales: { x: {display:false}, y: {ticks:{font:{size:10}}} }, 
            plugins: {legend:{display:false}} 
        }
    });
}

// --- MÉTÉO ---
async function chargerMeteo(lat, lon) {
    const div = document.getElementById('weather-text');
    if (API_METEO.includes("TA_CLE")) {
        div.innerHTML = "<span style='color:orange'>Clé API manquante</span>";
        return;
    }
    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${API_METEO}`);
        if(!res.ok) throw new Error("Erreur API");
        const data = await res.json();
        if(data.weather) {
            const desc = data.weather[0].description;
            const temp = Math.round(data.main.temp);
            div.innerHTML = `<strong>${temp}°C</strong> - ${desc.charAt(0).toUpperCase() + desc.slice(1)}`;
        }
    } catch (e) {
        div.innerText = "Météo indisponible";
    }
}


// ==========================================
// 6. UTILITAIRES
// ==========================================
function updateActiveItem(idx) {
    document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
    const sel = document.getElementById(`item-${idx}`);
    if(sel) { sel.classList.add('active'); sel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function getDiffColor(d) {
    if(!d) return '#f59e0b'; 
    if(d === 'Facile') return '#10b981';   
    if(d === 'Moyenne') return '#f59e0b';  
    if(d === 'Difficile') return '#ef4444';
    if(d === 'Expert') return '#0f172a';   
    return '#f59e0b';
}

function msToTime(duration) {
    if (!duration) return "--"; 
    var min = Math.floor((duration / (1000 * 60)) % 60);
    var h = Math.floor((duration / (1000 * 60 * 60)) % 24);
    return (h < 10 ? "0"+h : h) + "h" + (min < 10 ? "0"+min : min);
}

window.getFavoris = function() { return JSON.parse(localStorage.getItem('mes_favoris_randos')) || []; }

window.toggleFavori = function(index, event) {
    if(event) event.stopPropagation();
    let favoris = window.getFavoris();
    const btn = document.getElementById(`fav-btn-${index}`);
    
    if (favoris.includes(index)) {
        favoris = favoris.filter(id => id !== index);
        if(btn) { btn.classList.remove('active'); btn.innerHTML = '🤍'; }
    } else {
        favoris.push(index);
        if(btn) { btn.classList.add('active'); btn.innerHTML = '❤️'; }
    }
    localStorage.setItem('mes_favoris_randos', JSON.stringify(favoris));
}

window.filtrerRandos = function(filtre) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(b => { if(b.textContent.includes(filtre === 'all' ? 'Tout' : filtre)) b.classList.add('active'); });
    if(filtre === 'favoris') document.querySelector('button[onclick="filtrerRandos(\'favoris\')"]').classList.add('active');

    const items = document.querySelectorAll('.rando-item');
    const favoris = window.getFavoris();

    items.forEach(item => {
        const diff = item.getAttribute('data-diff');
        const id = item.getAttribute('data-id'); 
        if (filtre === 'all') item.style.display = 'flex';
        else if (filtre === 'favoris') item.style.display = favoris.includes(id) ? 'flex' : 'none';
        else item.style.display = (diff === filtre) ? 'flex' : 'none';
    });
}

window.partagerRando = async function(titre) {
    const url = window.location.href; 
    const text = `Regarde cette rando : ${titre} ! 🏔️`;
    if (navigator.share) {
        try { await navigator.share({ title: titre, text: text, url: url }); } catch (err) {}
    } else {
        navigator.clipboard.writeText(`${text} ${url}`).then(() => alert('Lien copié ! 📋'));
    }
}

window.toggleMobilePanel = function(panelId) {
    if (window.innerWidth > 768) return; 
    const panel = document.getElementById(panelId);
    if(panel) {
        panel.classList.toggle('minimized');
        const icon = panel.querySelector('.mobile-toggle-bar i');
        if(icon) {
            if(panel.classList.contains('minimized')) {
                icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up');
            } else {
                icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down');
            }
        }
    }
}

document.getElementById('search-input').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.rando-item').forEach(item => {
        const title = item.querySelector('h3').innerText.toLowerCase();
        item.style.display = title.includes(term) ? 'flex' : 'none';
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.getElementById('main-nav');
    const navLinks = document.querySelectorAll('.nav-link');

    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('open');
            const icon = menuToggle.querySelector('i');
            if (nav.classList.contains('open')) {
                icon.classList.remove('fa-bars'); icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark'); icon.classList.add('fa-bars');
            }
        });
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('open');
                const icon = menuToggle.querySelector('i');
                icon.classList.remove('fa-xmark'); icon.classList.add('fa-bars');
            });
        });
    }
});