// --- GESTION DE LA NAVIGATION (SPA) ---
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.page-section');

function showSection(targetId) {
    // 1. Cacher toutes les sections
    sections.forEach(sec => sec.classList.remove('active'));
    sections.forEach(sec => sec.classList.add('hidden')); 

    // 2. Enlever active des liens
    navLinks.forEach(link => link.classList.remove('active'));

    // 3. Montrer la section cible
    const targetSection = document.getElementById(targetId);
    if(targetSection) {
        targetSection.classList.add('active');
        targetSection.classList.remove('hidden');
    }

    // 4. Mettre le lien en actif
    const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
    if(activeLink) activeLink.classList.add('active');

    // 5. Si on va sur la carte, on force le recalcul de la taille (Bug Leaflet classique)
    if(targetId === 'app-container' && map) {
        setTimeout(() => { map.invalidateSize(); }, 100);
    }
}

// Clics sur le menu
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.getAttribute('data-target');
        showSection(target);
    });
});

// Bouton "Explorer" sur l'accueil
function goToMap() {
    showSection('app-container');
}


// --- CODE EXISTANT (CARTE & RANDOS) ---

// 1. Fonds de carte
const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap' });
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' });

// 2. Init Carte
var map = L.map('map', { center: [45.8326, 6.8652], zoom: 10, layers: [topoLayer], zoomControl: false });
L.control.zoom({ position: 'topleft' }).addTo(map);

// 3. Switch Sat
const switchControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function(map) {
        const btn = L.DomUtil.create('button', 'map-switch-btn');
        btn.innerHTML = '🛰️ Satellite';
        L.DomEvent.disableClickPropagation(btn);
        btn.onclick = function() {
            if (map.hasLayer(topoLayer)) {
                map.removeLayer(topoLayer); map.addLayer(satelliteLayer); this.innerHTML = '🗺️ Plan';
            } else {
                map.removeLayer(satelliteLayer); map.addLayer(topoLayer); this.innerHTML = '🛰️ Satellite';
            }
        };
        return btn;
    }
});
map.addControl(new switchControl());

// 4. Locate
L.control.locate({ position: 'topleft', strings: { title: "Me localiser" } }).addTo(map);

let myElevationChart = null;

// CHARGEMENT DONNÉES
fetch('randos.json')
    .then(response => response.json())
    .then(jsonData => {
        const mesRandos = jsonData.items;
        if (mesRandos) {
            mesRandos.forEach((data, index) => {
                // Carte
                const gpxLayer = new L.GPX(data.gpx, {
                    async: true,
                    marker_options: {
                        startIconUrl: 'icones/depart.png', endIconUrl: 'icones/arrivee.png', shadowUrl: null, iconSize: [32, 32], iconAnchor: [16, 32]
                    },
                    polyline_options: { color: 'red', opacity: 0.8, weight: 4 }
                }).on('loaded', function(e) {
                    const dist = (e.target.get_distance() / 1000).toFixed(1);
                    const el = document.getElementById(`dist-${index}`);
                    if(el) el.innerText = `${dist} km`;
                }).on('click', function(e) {
                    L.DomEvent.stopPropagation(e);
                    afficherDetails(data, gpxLayer);
                    updateActiveItem(index);
                }).addTo(map);

                // Liste
                const list = document.getElementById('randonnees-list');
                if (list) {
                    const item = document.createElement('div');
                    item.className = 'rando-item';
                    item.id = `item-${index}`;
                    item.innerHTML = `<h3>${data.title}</h3><p>Distance : <span id="dist-${index}">...</span></p>`;
                    item.addEventListener('click', () => {
                        map.fitBounds(gpxLayer.getBounds());
                        afficherDetails(data, gpxLayer);
                        updateActiveItem(index);
                    });
                    list.appendChild(item);
                }
            });
        }
    })
    .catch(err => console.error(err));


// --- FONCTIONS UI ---

function updateActiveItem(idx) {
    document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
    const sel = document.getElementById(`item-${idx}`);
    if(sel) { sel.classList.add('active'); sel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function msToTime(duration) {
    if (!duration) return "--"; 
    var min = Math.floor((duration / (1000 * 60)) % 60);
    var h = Math.floor((duration / (1000 * 60 * 60)) % 24);
    return (h < 10 ? "0"+h : h) + "h" + (min < 10 ? "0"+min : min);
}

function afficherDetails(data, gpxLayer) {
    const panel = document.getElementById('info-panel');
    
    // Structure HTML Panel
    panel.innerHTML = `
        <div class="panel-header">
            <h2 style="margin:0; font-size:1.2rem; color:#2c3e50;">${data.title}</h2>
            <button id="close-panel-btn" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
        </div>
        <div class="panel-content">
            <div id="stats-placeholder"></div>
            <p style="color:#666; line-height:1.5; margin: 15px 0;">${data.description}</p>
            <div class="chart-container"><canvas id="elevationChart"></canvas></div>
            <div id="rando-photos"></div>
        </div>
    `;

    // Close Event
    document.getElementById('close-panel-btn').onclick = () => {
        panel.classList.add('hidden');
        document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
    };

    // Stats
    const dist = (gpxLayer.get_distance() / 1000).toFixed(1); 
    const elev = gpxLayer.get_elevation_gain().toFixed(0);    
    const time = msToTime(gpxLayer.get_moving_time());
    
    // --- ICI ON AJOUTE LES ICÔNES ---
    document.getElementById('stats-placeholder').innerHTML = `
        <div class="stats-grid">
            <div class="stat-item">
                <span class="stat-icon">📏</span>
                <span class="stat-value">${dist} km</span>
                <span class="stat-label">Distance</span>
            </div>
            <div class="stat-item">
                <span class="stat-icon">🏔️</span>
                <span class="stat-value">${elev} m</span>
                <span class="stat-label">Dénivelé</span>
            </div>
            <div class="stat-item">
                <span class="stat-icon">⏱️</span>
                <span class="stat-value">${time}</span>
                <span class="stat-label">Temps</span>
            </div>
        </div>
    `;

    // Photos
    const pContainer = document.getElementById('rando-photos');
    if(data.photos) {
        data.photos.forEach(url => {
            const div = document.createElement('div'); div.className='photo-box';
            div.innerHTML = `<a data-fslightbox="gallery" href="${url}"><img src="${url}"></a>`;
            pContainer.appendChild(div);
        });
        if(typeof refreshFsLightbox === 'function') refreshFsLightbox();
    }

    // Chart
    const raw = gpxLayer.get_elevation_data();
    const lbls=[], dataPoints=[];
    raw.forEach((p, i) => { if(i%10===0) { lbls.push(p[0].toFixed(1)); dataPoints.push(p[1]); }}); 

    if(myElevationChart) myElevationChart.destroy();
    myElevationChart = new Chart(document.getElementById('elevationChart'), {
        type: 'line',
        data: {
            labels: lbls,
            datasets: [{
                label: 'Alt', data: dataPoints, borderColor: '#e67e22', backgroundColor: 'rgba(230,126,34,0.1)', fill: true, pointRadius: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: {display:false} }, plugins: {legend:{display:false}} }
    });

    panel.classList.remove('hidden');
}

// Recherche
document.getElementById('search-input').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.rando-item').forEach(item => {
        item.style.display = item.querySelector('h3').innerText.toLowerCase().includes(term) ? 'block' : 'none';
    });
});