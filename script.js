// 1. Définition des fonds de carte
const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data: © OpenStreetMap | Style: © OpenTopoMap'
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

// 2. Initialisation de la carte
var map = L.map('map', {
    center: [45.8326, 6.8652],
    zoom: 10,
    layers: [topoLayer], 
    zoomControl: false
});

L.control.zoom({ position: 'topleft' }).addTo(map);

// 3. Bouton Switch (Map/Sat)
const switchControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function(map) {
        const container = L.DomUtil.create('button', 'map-switch-btn');
        container.innerHTML = '🛰️ Vue Satellite';
        L.DomEvent.disableClickPropagation(container);
        container.onclick = function() {
            if (map.hasLayer(topoLayer)) {
                map.removeLayer(topoLayer);
                map.addLayer(satelliteLayer);
                this.classList.add('active');
                this.innerHTML = '🗺️ Vue Plan';
            } else {
                map.removeLayer(satelliteLayer);
                map.addLayer(topoLayer);
                this.classList.remove('active');
                this.innerHTML = '🛰️ Vue Satellite';
            }
        };
        return container;
    }
});
map.addControl(new switchControl());

// 4. Bouton Localisation
let myElevationChart = null;

L.control.locate({
    position: 'topleft',
    strings: { title: "Me localiser" },
    locateOptions: { enableHighAccuracy: true, maxZoom: 15 }
}).addTo(map);

// ---------------------------------------------------------
// LOGIQUE PRINCIPALE
// ---------------------------------------------------------

// Vérification que le fichier data.js est bien chargé
if (typeof mesRandos !== 'undefined') {
    
    mesRandos.forEach((data, index) => {
        
        // A. Carte
        const gpxLayer = new L.GPX(data.gpx, {
            async: true,
            marker_options: {
                // --- VOS ICÔNES LOCALES ---
                startIconUrl: 'icones/depart.png',
                endIconUrl: 'icones/arrivee.png',
                shadowUrl: null,
                iconSize: [32, 32], 
                iconAnchor: [16, 32] 
            },
            polyline_options: { color: 'red', opacity: 0.8, weight: 4, lineCap: 'round' }
        }).on('loaded', function(e) {
            const dist = (e.target.get_distance() / 1000).toFixed(1);
            const elemDist = document.getElementById(`dist-${index}`);
            if(elemDist) elemDist.innerText = `${dist} km`;
        }).on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            afficherDetails(data, gpxLayer);
            updateActiveItem(index);
        }).addTo(map);

        // B. Liste
        const listContainer = document.getElementById('randonnees-list');
        if (listContainer) {
            const listItem = document.createElement('div');
            listItem.className = 'rando-item';
            listItem.id = `item-${index}`; 
            listItem.innerHTML = `
                <h3>${data.title}</h3>
                <p>Distance : <span id="dist-${index}">Calcul...</span></p>
            `;
            
            listItem.addEventListener('click', () => {
                map.fitBounds(gpxLayer.getBounds());
                afficherDetails(data, gpxLayer);
                updateActiveItem(index);
            });

            listContainer.appendChild(listItem);
        }
    });

} else {
    console.error("Erreur : Le fichier data.js n'est pas chargé ou est vide !");
}

// Ajouter le Footer dans la sidebar (Personnalisé Ethan42380)
const sidebar = document.getElementById('sidebar');
const footer = document.createElement('div');
footer.className = 'sidebar-footer';
footer.innerHTML = "© 2026 - Ethan42380 - Mes Randonnées<br>Fait avec passion 🏔️";
sidebar.appendChild(footer);


// --- FONCTIONS ---

function updateActiveItem(selectedIndex) {
    const allItems = document.querySelectorAll('.rando-item');
    allItems.forEach(item => item.classList.remove('active'));

    const selectedItem = document.getElementById(`item-${selectedIndex}`);
    if (selectedItem) {
        selectedItem.classList.add('active');
        selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Fonction utilitaire pour convertir le temps (ms -> 00h00)
function msToTime(duration) {
    if (!duration || duration === 0) return "--"; 
    var minutes = Math.floor((duration / (1000 * 60)) % 60);
    var hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    return hours + "h" + minutes;
}

function afficherDetails(data, gpxLayer) {
    const panel = document.getElementById('info-panel');
    
    document.getElementById('rando-title').innerText = data.title;
    document.getElementById('rando-desc').innerText = data.description;
    
    // --- CALCUL DES STATS (Distance, D+, Temps) ---
    const dist = (gpxLayer.get_distance() / 1000).toFixed(1); 
    const elev = gpxLayer.get_elevation_gain().toFixed(0);    
    const durationMs = gpxLayer.get_moving_time(); 
    const durationStr = msToTime(durationMs);
    
    // --- CONSTRUCTION DU TABLEAU DE BORD (3 CASES) ---
    const statsHTML = `
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
                <span class="stat-icon">🚶</span>
                <span class="stat-value">${durationStr}</span>
                <span class="stat-label">Temps marche</span>
            </div>
        </div>
    `;

    // Injection dans le HTML
    // On cible la div .meta-info existante ou on la crée
    let metaDiv = document.querySelector('#info-panel .meta-info');
    if(!metaDiv) {
        metaDiv = document.createElement('div');
        metaDiv.className = 'meta-info';
        document.getElementById('rando-title').after(metaDiv);
    }
    metaDiv.innerHTML = statsHTML;
    // On nettoie le style par défaut (pour que la grille prenne le dessus)
    metaDiv.style.border = "none";
    metaDiv.style.padding = "0";

    // --- GESTION DES PHOTOS (LIGHTBOX) ---
    const photoContainer = document.getElementById('rando-photos');
    photoContainer.innerHTML = ""; 
    
    if(data.photos && data.photos.length > 0) {
        data.photos.forEach(photoUrl => {
            const photoBox = document.createElement('div');
            photoBox.className = 'photo-box';

            const link = document.createElement('a');
            link.setAttribute('data-fslightbox', 'gallery'); 
            link.href = photoUrl; 
            
            const img = document.createElement('img');
            img.src = photoUrl;
            img.alt = data.title;
            img.onerror = function() { photoBox.style.display='none'; };
            
            link.appendChild(img);
            photoBox.appendChild(link);
            photoContainer.appendChild(photoBox);
        });
        
        if (typeof refreshFsLightbox === 'function') {
            refreshFsLightbox();
        }
    }

    // --- GRAPHIQUE ---
    const rawData = gpxLayer.get_elevation_data(); 
    const labels = [];
    const elevations = [];
    
    rawData.forEach((point, i) => {
        if (i % 5 === 0) { 
            labels.push(point[0].toFixed(1));
            elevations.push(point[1].toFixed(0));
        }
    });

    if (myElevationChart) {
        myElevationChart.destroy();
    }

    const ctx = document.getElementById('elevationChart').getContext('2d');
    myElevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Altitude (m)',
                data: elevations,
                borderColor: '#e67e22',
                backgroundColor: 'rgba(230, 126, 34, 0.2)',
                fill: true,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: true, title: { display: true, text: 'Distance (km)' } },
                y: { display: true, title: { display: true, text: 'Altitude (m)' } }
            },
            plugins: { legend: { display: false } }
        }
    });

    panel.classList.remove('hidden');
}

document.getElementById('close-btn').addEventListener('click', () => {
    document.getElementById('info-panel').classList.add('hidden');
    const allItems = document.querySelectorAll('.rando-item');
    allItems.forEach(item => item.classList.remove('active'));
});

// --- FONCTION DE RECHERCHE ---
const searchInput = document.getElementById('search-input');

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const allItems = document.querySelectorAll('.rando-item');

        allItems.forEach(item => {
            const title = item.querySelector('h3').innerText.toLowerCase();
            if (title.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
}