// ==========================================
// 1. IMPORTATION & CONFIGURATION FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
// Ajout de doc, updateDoc et increment pour gérer les Likes
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

// --- ⚠️ TA CLÉ MÉTÉO ⚠️ ---
const API_METEO = "d8228c5ce53a841509cf2c653e7b69d6"; 

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

// --- GROUPE DE CLUSTERING ---
let markersCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true
});
map.addLayer(markersCluster);

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
let hoverMarker = null; // Point bleu interactif


// ==========================================
// 4. CHARGEMENT DES DONNÉES
// ==========================================
async function chargerRandos() {
    try {
        if (markersCluster) markersCluster.clearLayers();
        map.eachLayer(function (layer) {
            if (layer instanceof L.GPX || layer === hoverMarker) { map.removeLayer(layer); }
        });
        if(hoverMarker) hoverMarker = null;

        const listContainer = document.getElementById('randonnees-list');
        if (listContainer) listContainer.innerHTML = ''; 

        console.log("Chargement depuis Firebase...");
        const querySnapshot = await getDocs(collection(db, "randos"));
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const index = doc.id; 

            // IMPORTANT : On s'assure que likes est un nombre
            data.likes = (typeof data.likes === 'number') ? data.likes : 0;

            let safePhotos = [];
            if (data.photos) {
                if (Array.isArray(data.photos)) safePhotos = data.photos.map(p => (typeof p === 'object' && p.image) ? p.image : p);
                else if (typeof data.photos === 'string') safePhotos = [data.photos];
            }
            data.safePhotos = safePhotos;

            const trackColor = getDiffColor(data.difficulty);

            const customIcon = L.divIcon({
                className: 'custom-div-icon',
                html: "<div class='marker-pin'>🏔️</div>",
                iconSize: [40, 40],
                iconAnchor: [20, 20],
                popupAnchor: [0, -25]
            });

            // --- LAYER GPX (FIX BUG MARKER) ---
            const gpxLayer = new L.GPX(data.gpx, {
                async: true,
                marker_options: {
                    // ON VIDE TOUT pour éviter l'icône cassée
                    startIconUrl: '', 
                    endIconUrl: '',
                    shadowUrl: '',
                    wptIconUrls: '',
                    startIcon: null,
                    endIcon: null
                },
                polyline_options: { color: trackColor, opacity: 0.9, weight: 6, lineCap: 'round' }
            }).on('loaded', function(e) {
                
                const dist = (e.target.get_distance() / 1000).toFixed(1);
                setTimeout(() => {
                    const elDist = document.getElementById(`dist-${index}`);
                    if(elDist) elDist.innerText = `${dist} km`;
                }, 100);

                const rawDate = e.target.get_start_time();
                if(rawDate) data.calculatedDate = rawDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

                // Popup
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

                // Marqueur Départ (Cluster)
                const startPoint = e.target.getBounds().getCenter();
                const layers = e.target.getLayers();
                let exactStart = startPoint;
                if(layers.length > 0 && layers[0].getLatLngs) {
                     const pts = layers[0].getLatLngs();
                     if(pts.length > 0) exactStart = pts[0]; 
                }

                const startMarker = L.marker(exactStart, { icon: customIcon });
                startMarker.bindPopup(popupContent);
                startMarker.on('click', (ev) => {
                    L.DomEvent.stopPropagation(ev);
                    afficherDetails(data, gpxLayer);
                    updateActiveItem(index);
                });
                startMarker.on('mouseover', function() { this.openPopup(); });
                
                markersCluster.addLayer(startMarker);

                // Tracé (Carte)
                gpxLayer.bindPopup(popupContent);
                gpxLayer.on('click', (ev) => {
                    L.DomEvent.stopPropagation(ev);
                    afficherDetails(data, gpxLayer);
                    updateActiveItem(index);
                });
                gpxLayer.on('mouseover', function(ev) { 
                    this.setStyle({ weight: 8, opacity: 1 });
                    this.openPopup(ev.latlng); 
                });
                gpxLayer.on('mouseout', function() { 
                    this.setStyle({ weight: 6, opacity: 0.9 });
                });

                gpxLayer.addTo(map);
            });

            addRandoToList(data, index, safePhotos, gpxLayer);
        });

    } catch (error) { console.error("Erreur chargement :", error); }
}

chargerRandos();


// --- FONCTION AJOUT LISTE (AVEC LIKE GLOBAL) ---
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
    
    // Vérification locale pour le cœur rouge
    const isFav = getFavoris().includes(index);
    const heartClass = isFav ? 'active' : '';
    const heartSymbol = isFav ? '❤️' : '🤍';

    item.innerHTML = `
        <img src="${thumbUrl}" class="list-thumb" loading="lazy" alt="${data.title}" onerror="this.src='https://via.placeholder.com/80?text=No+Img'">
        <div class="list-content">
            <h3 style="margin:0; font-size:1rem; color:#0f172a;">${data.title}</h3>
            <p style="margin:2px 0; font-size:0.85rem; color:#64748b;">Distance : <span id="dist-${index}">...</span></p>
            <span class="diff-badge" style="background-color: ${diffColor}; padding:2px 8px; border-radius:10px; color:white; font-size:0.7rem;">${data.difficulty || "Moyenne"}</span>
        </div>
        <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
            <button id="fav-btn-${index}" class="fav-btn-list ${heartClass}" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">${heartSymbol}</button>
            <span id="like-count-${index}" style="font-size:0.75rem; color:#64748b; font-weight:bold;">${data.likes}</span>
        </div>
    `;
    
    // GESTION DU CLIC SUR LE COEUR (GLOBAL)
    const favBtn = item.querySelector(`#fav-btn-${index}`);
    favBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Ne pas ouvrir la fiche
        await toggleGlobalLike(index, data);
    });

    item.addEventListener('click', () => {
        document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        afficherDetails(data, gpxLayer);
        
        // --- 🚀 ANIMATION CINÉMATIQUE (FLY TO) ---
        if (gpxLayer) {
            const flyToOptions = { 
                padding: [50, 50], 
                duration: 1.5, // Durée du vol (1.5 secondes)
                easeLinearity: 0.25 
            };

            if (markersCluster) {
                // Si la rando est dans un cluster, on zoome d'abord le cluster
                markersCluster.zoomToShowLayer(gpxLayer, () => {
                    // Une fois dégroupé, on vole vers la trace
                    map.flyToBounds(gpxLayer.getBounds(), flyToOptions);
                    setTimeout(() => gpxLayer.openPopup(), 1000); // Petit délai pour le popup
                });
            } else {
                map.flyToBounds(gpxLayer.getBounds(), flyToOptions);
                setTimeout(() => gpxLayer.openPopup(), 1000);
            }
        }

        if (window.innerWidth < 768) {
            const sidebar = document.getElementById('sidebar');
            if(sidebar && !sidebar.classList.contains('minimized')) sidebar.classList.add('minimized');
        }
    });

    list.appendChild(item);
}

// --- FONCTION LIKE GLOBAL (PERSISTANT) ---
async function toggleGlobalLike(docId, dataObj) {
    const btn = document.getElementById(`fav-btn-${docId}`);
    const countSpan = document.getElementById(`like-count-${docId}`);
    const isCurrentlyFav = getFavoris().includes(docId);

    // 1. UI Locale (Immédiat)
    let favoris = getFavoris();
    if (isCurrentlyFav) {
        favoris = favoris.filter(id => id !== docId);
        btn.innerHTML = '🤍';
        btn.classList.remove('active');
        dataObj.likes = Math.max(0, dataObj.likes - 1);
    } else {
        favoris.push(docId);
        btn.innerHTML = '❤️';
        btn.classList.add('active');
        dataObj.likes += 1;
    }
    localStorage.setItem('mes_favoris_randos', JSON.stringify(favoris));
    countSpan.innerText = dataObj.likes;

    // 2. Mise à jour Database (Firebase)
    try {
        console.log("Tentative d'écriture Firebase...");
        const randoRef = doc(db, "randos", docId);
        // Utilisation de increment pour éviter les conflits
        await updateDoc(randoRef, {
            likes: increment(isCurrentlyFav ? -1 : 1)
        });
        console.log("Like enregistré sur Firebase !");
    } catch (err) {
        console.error("ERREUR D'ÉCRITURE : Vérifie tes règles Firebase !", err);
        alert("Impossible de sauvegarder le Like. Vérifie que tes règles Firestore autorisent l'écriture (mode public pour l'instant).");
    }
}


// ==========================================
// 5. PANNEAU DE DÉTAILS
// ==========================================
function afficherDetails(data, gpxLayer) {
    const panel = document.getElementById('info-panel');
    const displayDate = data.calculatedDate || "Date inconnue";
    const diffColor = getDiffColor(data.difficulty);
    const center = gpxLayer.getBounds().getCenter(); 
    const lat = center.lat;
    const lng = center.lng;

    const topPhotos = data.safePhotos.slice(0, 2);
    const bottomPhotos = data.safePhotos.slice(2);

    let topGalleryHTML = '';
    if(topPhotos.length > 0) {
        topGalleryHTML = '<div class="photo-grid-top" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">';
        topPhotos.forEach(url => {
            topGalleryHTML += `<div class="photo-box"><a data-fslightbox="gallery" href="${url}"><img src="${url}" loading="lazy"></a></div>`;
        });
        topGalleryHTML += '</div>';
    }

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

            ${topGalleryHTML}

            <div id="stats-placeholder" class="stats-grid">Chargement...</div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <button id="share-btn-action" class="share-btn" style="margin:0;"><i class="fa-solid fa-paper-plane"></i> Partager</button>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" class="share-btn" style="background:#10b981; color:white; margin:0; text-decoration:none;">
                    <i class="fa-solid fa-location-arrow"></i> S'y rendre
                </a>
            </div>

            <a href="${data.gpx}" download class="download-btn"><i class="fa-solid fa-download"></i> Télécharger GPX</a>
            
            <div style="color:#334155; line-height:1.6; margin: 20px 0; font-size:0.95rem;">${marked.parse(data.description || "")}</div>
            
            <div class="chart-container"><canvas id="elevationChart"></canvas></div>

            <div id="weather-widget" style="background:#f0f9ff; padding:15px; border-radius:12px; margin-top:20px; margin-bottom:20px; border:1px solid #bae6fd; display:flex; align-items:center; gap:15px;">
                <i class="fa-solid fa-cloud-sun" style="font-size:1.5rem; color:#0ea5e9;"></i>
                <div style="flex-grow:1;">
                    <span style="font-weight:bold; color:#0284c7; display:block;">Météo sur place</span>
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
        <div class="stat-item"><span class="stat-value">${time}</span><span class="stat-label">Temps</span></div>
    `;

    chargerMeteo(lat, lng);

    const pContainerBottom = document.getElementById('rando-photos-bottom');
    if(bottomPhotos.length > 0) {
        bottomPhotos.forEach(url => {
            const div = document.createElement('div');
            div.className = 'photo-box';
            div.innerHTML = `<a data-fslightbox="gallery" href="${url}"><img src="${url}" loading="lazy"></a>`;
            pContainerBottom.appendChild(div);
        });
    } else {
        pContainerBottom.innerHTML = "<p style='color:#94a3b8; font-style:italic; font-size:0.9rem;'>Pas d'autres photos.</p>";
    }
    
    if(typeof refreshFsLightbox === 'function') refreshFsLightbox();

    createChart(gpxLayer);

    document.getElementById('close-panel-btn').onclick = () => {
        panel.classList.add('hidden');
        if(hoverMarker) map.removeLayer(hoverMarker);
        document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
    };
    document.getElementById('share-btn-action').onclick = () => partagerRando(data.title);

    panel.classList.remove('hidden');
    panel.classList.remove('minimized');
}

// --- GRAPHIQUE & POINT INTERACTIF ---
function createChart(gpxLayer) {
    const ctxCanvas = document.getElementById('elevationChart');
    if(!ctxCanvas || typeof Chart === 'undefined') return;

    // On récupère les données brutes AVEC les coordonnées
    const raw = gpxLayer.get_elevation_data();
    
    const lbls = [];
    const dataPoints = [];
    const chartCoords = []; // On stocke les GPS ici

    raw.forEach((p, i) => { 
        if(i % 10 === 0) { 
            lbls.push(p[0].toFixed(1)); 
            dataPoints.push(p[1]); 
            // Leaflet GPX : [dist, elev, slope, time, LAT, LNG]
            if(p.length >= 6) {
                chartCoords.push([p[4], p[5]]);
            } else {
                chartCoords.push(null);
            }
        } 
    }); 

    if(myElevationChart) myElevationChart.destroy();
    
    myElevationChart = new Chart(ctxCanvas.getContext('2d'), {
        type: 'line',
        data: { 
            labels: lbls, 
            datasets: [{ 
                label: 'Altitude', data: dataPoints, 
                borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', 
                fill: true, pointRadius: 0, borderWidth: 2, 
                hoverBackgroundColor: '#0f172a', hoverRadius: 6 
            }] 
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            interaction: { mode: 'index', intersect: false },
            scales: { x: {display:false}, y: {ticks:{font:{size:10}}} }, 
            plugins: {
                legend:{display:false},
                tooltip: { intersect: false }
            },
            // --- SYNC CARTE ---
            onHover: (e, elements) => {
                if (elements && elements.length > 0) {
                    const index = elements[0].index;
                    const latLng = chartCoords[index];

                    if (latLng) {
                        if (!hoverMarker) {
                            hoverMarker = L.circleMarker(latLng, {
                                radius: 8, color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1
                            }).addTo(map);
                        } else {
                            hoverMarker.setLatLng(latLng);
                            if (!map.hasLayer(hoverMarker)) hoverMarker.addTo(map);
                        }
                    }
                }
            }
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