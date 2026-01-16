// --- GESTION DE LA NAVIGATION (SPA) ---
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
    }
    const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
    if(activeLink) activeLink.classList.add('active');

    if(targetId === 'app-container' && map) {
        setTimeout(() => { map.invalidateSize(); }, 100);
    }
}

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(link.getAttribute('data-target'));
    });
});
function goToMap() { showSection('app-container'); }

// --- CODE CARTE & RANDOS ---
const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap' });
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' });

var map = L.map('map', { center: [45.8326, 6.8652], zoom: 10, layers: [topoLayer], zoomControl: false });
L.control.zoom({ position: 'topleft' }).addTo(map);

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
L.control.locate({ position: 'topleft', strings: { title: "Me localiser" } }).addTo(map);

let myElevationChart = null;

function getDiffColor(d) {
    if(!d) return '#f59e0b';
    if(d === 'Facile') return '#10b981';
    if(d === 'Difficile') return '#ef4444';
    if(d === 'Expert') return '#111827';
    return '#f59e0b';
}

// CHARGEMENT DONNÉES
fetch('randos.json')
    .then(response => response.json())
    .then(jsonData => {
        const mesRandos = jsonData.items;
        if (mesRandos) {
            mesRandos.forEach((data, index) => {
                // SÉCURITÉ FORMAT PHOTOS : On s'assure que c'est toujours une liste
                let safePhotos = [];
                if (data.photos) {
                    if (Array.isArray(data.photos)) {
                        safePhotos = data.photos; // C'est déjà une liste, parfait
                    } else if (typeof data.photos === 'string') {
                        safePhotos = [data.photos]; // C'est un texte seul, on le met dans une liste
                    }
                }
                data.safePhotos = safePhotos; // On stocke la version propre

                // Création Carte
                const gpxLayer = new L.GPX(data.gpx, {
                    async: true,
                    marker_options: {
                        startIconUrl: 'icones/depart.png', endIconUrl: 'icones/arrivee.png', shadowUrl: null, iconSize: [32, 32], iconAnchor: [16, 32]
                    },
                    polyline_options: { color: 'red', opacity: 0.8, weight: 4 }
                }).on('loaded', function(e) {
                    const dist = (e.target.get_distance() / 1000).toFixed(1);
                    const elDist = document.getElementById(`dist-${index}`);
                    if(elDist) elDist.innerText = `${dist} km`;

                    const rawDate = e.target.get_start_time();
                    if(rawDate) {
                        const dateStr = rawDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                        const elDate = document.getElementById(`date-${index}`);
                        if(elDate) elDate.innerText = dateStr;
                        data.calculatedDate = dateStr; 
                    }
                }).on('click', function(e) {
                    L.DomEvent.stopPropagation(e);
                    afficherDetails(data, gpxLayer);
                    updateActiveItem(index);
                }).addTo(map);

                // CREATION LISTE
                const list = document.getElementById('randonnees-list');
                if (list) {
                    const item = document.createElement('div');
                    item.className = 'rando-item';
                    item.id = `item-${index}`;
                    
                    // Gestion miniature sécurisée
                    let thumbUrl = 'https://via.placeholder.com/70?text=No+Img';
                    if (safePhotos.length > 0) {
                        // On prend la 1ère photo, qu'elle soit string ou objet
                        let p = safePhotos[0];
                        thumbUrl = (typeof p === 'string') ? p : (p.image || thumbUrl);
                    }
                    
                    const diff = data.difficulty || "Moyenne";
                    const diffColor = getDiffColor(diff);

                    item.innerHTML = `
                        <img src="${thumbUrl}" class="list-thumb" loading="lazy" onerror="this.src='https://via.placeholder.com/70?text=Erreur'" alt="${data.title}">
                        <div class="list-content">
                            <h3>${data.title}</h3>
                            <p style="margin-bottom: 2px;">Distance : <span id="dist-${index}">...</span></p>
                            <p style="font-size: 0.75rem; color: #999;">📅 <span id="date-${index}">--/--/----</span></p>
                            <span class="diff-badge" style="background-color: ${diffColor};">${diff}</span>
                        </div>
                    `;
                    
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
    .catch(err => console.error("Erreur chargement:", err));


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
    try {
        const panel = document.getElementById('info-panel');
        const displayDate = data.calculatedDate || "Date inconnue";
        const diff = data.difficulty || "Moyenne";
        const diffColor = getDiffColor(diff);

        panel.innerHTML = `
            <div class="panel-header">
                <h2 style="margin:0; font-size:1.2rem; color:#2c3e50;">${data.title}</h2>
                <button id="close-panel-btn" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            <div class="panel-content">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <p style="color:var(--primary-soft); font-weight:600; font-size:0.9rem; margin:0;">📅 Sortie du ${displayDate}</p>
                    <span class="diff-badge" style="background-color: ${diffColor}; margin:0;">${diff}</span>
                </div>

                <div id="stats-placeholder">Chargement stats...</div>
                
                <a href="${data.gpx}" download class="download-btn">📥 Télécharger la trace GPX</a>
                
                <div style="color:#666; line-height:1.5; margin: 15px 0;">${marked.parse(data.description)}</div> <div class="chart-container"><canvas id="elevationChart"></canvas></div>
                <div id="rando-photos"></div>
            </div>
        `;

        // Bouton fermer
        document.getElementById('close-panel-btn').onclick = () => {
            panel.classList.add('hidden');
            document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
        };

        // Stats
        const dist = (gpxLayer.get_distance() / 1000).toFixed(1); 
        const elev = gpxLayer.get_elevation_gain().toFixed(0);    
        const time = msToTime(gpxLayer.get_moving_time());
        
        document.getElementById('stats-placeholder').innerHTML = `
            <div class="stats-grid">
                <div class="stat-item"><span class="stat-icon">📏</span><span class="stat-value">${dist} km</span><span class="stat-label">Distance</span></div>
                <div class="stat-item"><span class="stat-icon">🏔️</span><span class="stat-value">${elev} m</span><span class="stat-label">Dénivelé</span></div>
                <div class="stat-item"><span class="stat-icon">⏱️</span><span class="stat-value">${time}</span><span class="stat-label">Temps</span></div>
            </div>
        `;

        // Affichage Photos (Version Robuste)
        const pContainer = document.getElementById('rando-photos');
        if(data.safePhotos && data.safePhotos.length > 0) {
            data.safePhotos.forEach(item => {
                // On accepte soit un string direct, soit un objet avec .image
                let url = (typeof item === 'string') ? item : (item.image || null);
                
                if(url) {
                    const div = document.createElement('div'); div.className='photo-box';
                    div.innerHTML = `<a data-fslightbox="gallery" href="${url}"><img src="${url}" onerror="this.style.display='none'"></a>`;
                    pContainer.appendChild(div);
                }
            });
            if(typeof refreshFsLightbox === 'function') refreshFsLightbox();
        }

        // Graphique
        const raw = gpxLayer.get_elevation_data();
        const lbls=[], dataPoints=[];
        raw.forEach((p, i) => { if(i%10===0) { lbls.push(p[0].toFixed(1)); dataPoints.push(p[1]); }}); 

        if(myElevationChart) myElevationChart.destroy();
        myElevationChart = new Chart(document.getElementById('elevationChart'), {
            type: 'line',
            data: { labels: lbls, datasets: [{ label: 'Alt', data: dataPoints, borderColor: '#e67e22', backgroundColor: 'rgba(230,126,34,0.1)', fill: true, pointRadius: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: {display:false} }, plugins: {legend:{display:false}} }
        });

        panel.classList.remove('hidden');
    } catch (e) {
        console.error("Erreur affichage détails : ", e);
    }
}