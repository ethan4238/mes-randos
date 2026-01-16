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

// --- GESTION DES FAVORIS (LOCAL STORAGE) ---
function getFavoris() {
    return JSON.parse(localStorage.getItem('mes_favoris_randos')) || [];
}

function toggleFavori(index, event) {
    if(event) event.stopPropagation(); // Empêche d'ouvrir la fiche quand on clique sur le cœur
    
    let favoris = getFavoris();
    const btn = document.getElementById(`fav-btn-${index}`);
    
    if (favoris.includes(index)) {
        // Retirer des favoris
        favoris = favoris.filter(id => id !== index);
        if(btn) {
            btn.classList.remove('active');
            btn.innerHTML = '🤍'; // Cœur vide
        }
    } else {
        // Ajouter aux favoris
        favoris.push(index);
        if(btn) {
            btn.classList.add('active');
            btn.innerHTML = '❤️'; // Cœur plein
        }
    }
    
    localStorage.setItem('mes_favoris_randos', JSON.stringify(favoris));
}


// --- COULEURS DYNAMIQUES ---
function getDiffColor(d) {
    if(!d) return '#f59e0b'; 
    if(d === 'Facile') return '#10b981';   
    if(d === 'Moyenne') return '#f59e0b';  
    if(d === 'Difficile') return '#ef4444';
    if(d === 'Expert') return '#000000';   
    return '#f59e0b';
}

// --- PARTAGE ---
async function partagerRando(titre) {
    const url = window.location.href; 
    const text = `Regarde cette rando : ${titre} ! 🏔️`;
    if (navigator.share) {
        try { await navigator.share({ title: titre, text: text, url: url }); } catch (err) {}
    } else {
        navigator.clipboard.writeText(`${text} ${url}`).then(() => alert('Lien copié ! 📋'));
    }
}

// --- CHARGEMENT DES DONNÉES ---
fetch('randos.json')
    .then(response => response.json())
    .then(jsonData => {
        const mesRandos = jsonData.items;
        if (mesRandos) {
            mesRandos.forEach((data, index) => {
                let safePhotos = [];
                if (data.photos) {
                    if (Array.isArray(data.photos)) safePhotos = data.photos;
                    else if (typeof data.photos === 'string') safePhotos = [data.photos];
                }
                data.safePhotos = safePhotos;

                const trackColor = getDiffColor(data.difficulty);

                // GPX Layer
                const gpxLayer = new L.GPX(data.gpx, {
                    async: true,
                    marker_options: {
                        startIconUrl: 'icones/depart.png', endIconUrl: 'icones/arrivee.png', shadowUrl: null, iconSize: [32, 32], iconAnchor: [16, 32]
                    },
                    polyline_options: { color: trackColor, opacity: 0.8, weight: 4, lineCap: 'round' }
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

                // --- CRÉATION LISTE AVEC COEUR ---
                const list = document.getElementById('randonnees-list');
                if (list) {
                    const item = document.createElement('div');
                    item.className = 'rando-item';
                    item.id = `item-${index}`;
                    item.setAttribute('data-diff', data.difficulty); // Pour le filtre
                    item.setAttribute('data-id', index); // Pour le filtre favoris
                    
                    let thumbUrl = 'https://via.placeholder.com/70?text=No+Img';
                    if (safePhotos.length > 0) {
                        let p = safePhotos[0];
                        thumbUrl = (typeof p === 'string') ? p : (p.image || thumbUrl);
                    }
                    
                    const diff = data.difficulty || "Moyenne";
                    const diffColor = getDiffColor(diff);
                    
                    // Vérif si déjà favori
                    const isFav = getFavoris().includes(index);
                    const heartIcon = isFav ? '❤️' : '🤍';
                    const activeClass = isFav ? 'active' : '';

                    item.innerHTML = `
                        <img src="${thumbUrl}" class="list-thumb" loading="lazy" alt="${data.title}">
                        <div class="list-content">
                            <h3>${data.title}</h3>
                            <p style="margin-bottom: 2px;">Distance : <span id="dist-${index}">...</span></p>
                            <p style="font-size: 0.75rem; color: #999;">📅 <span id="date-${index}">--/--/----</span></p>
                            <span class="diff-badge" style="background-color: ${diffColor};">${diff}</span>
                        </div>
                        <button id="fav-btn-${index}" class="fav-btn-list ${activeClass}" onclick="toggleFavori(${index}, event)">${heartIcon}</button>
                    `;
                    
                    item.addEventListener('click', () => {
                        map.fitBounds(gpxLayer.getBounds());
                        afficherDetails(data, gpxLayer);
                        updateActiveItem(index);
                    });

                    item.addEventListener('mouseenter', () => {
                        gpxLayer.setStyle({ weight: 8, opacity: 1 });
                        gpxLayer.bringToFront();
                    });
                    item.addEventListener('mouseleave', () => {
                        if(!item.classList.contains('active')) {
                            gpxLayer.setStyle({ weight: 4, opacity: 0.8 });
                        }
                    });

                    list.appendChild(item);
                }
            });
        }
    })
    .catch(err => console.error("Erreur chargement:", err));


// --- FONCTIONS UTILITAIRES ---

function updateActiveItem(idx) {
    document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
    const sel = document.getElementById(`item-${idx}`);
    if(sel) { sel.classList.add('active'); sel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function filtrerRandos(filtre) {
    // Gestion boutons actifs
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    // On trouve le bouton cliqué
    const buttons = document.querySelectorAll('.filter-btn');
    // Simple boucle pour mettre 'active' sur le bon bouton (basique)
    for(let b of buttons) {
        if(b.textContent.includes(filtre === 'all' ? 'Tout' : (filtre === 'favoris' ? 'Favoris' : filtre))) {
            b.classList.add('active');
        }
    }
    // Si on clique sur le bouton rouge Favoris explicitement
    if(filtre === 'favoris') {
         document.querySelector('button[onclick="filtrerRandos(\'favoris\')"]').classList.add('active');
    }

    const items = document.querySelectorAll('.rando-item');
    const favoris = getFavoris();

    items.forEach(item => {
        const diff = item.getAttribute('data-diff');
        const id = parseInt(item.getAttribute('data-id'));
        
        if (filtre === 'all') {
            item.style.display = 'flex';
        } else if (filtre === 'favoris') {
            // Affiche seulement si l'ID est dans le tableau des favoris
            item.style.display = favoris.includes(id) ? 'flex' : 'none';
        } else {
            // Filtre par difficulté
            item.style.display = (diff === filtre) ? 'flex' : 'none';
        }
    });
}

function msToTime(duration) {
    if (!duration) return "--"; 
    var min = Math.floor((duration / (1000 * 60)) % 60);
    var h = Math.floor((duration / (1000 * 60 * 60)) % 24);
    return (h < 10 ? "0"+h : h) + "h" + (min < 10 ? "0"+min : min);
}

function afficherDetails(data, gpxLayer) {
    const panel = document.getElementById('info-panel');
    
    // 1. Nettoyage et préparation des données
    const displayDate = data.calculatedDate || "Date inconnue";
    const diffColor = getDiffColor(data.difficulty);

    // 2. Injection du HTML
    panel.innerHTML = `
        <div class="mobile-toggle-bar" onclick="toggleMobilePanel('info-panel')">
            <i class="fa-solid fa-chevron-down"></i>
        </div>
        <div class="panel-header">
            <h2 style="margin:0;">${data.title}</h2>
            <button id="close-panel-btn" style="background:none; border:none; font-size:20px; cursor:pointer;">✕</button>
        </div>
        <div class="panel-content">
            <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                <span style="font-weight:700; color:#64748b;">📅 ${displayDate}</span>
                <span class="diff-badge" style="background:${diffColor}; margin:0;">${data.difficulty}</span>
            </div>

            <div id="stats-placeholder" class="stats-grid"></div>

            <button id="share-btn-action" class="share-btn">
                <i class="fa-solid fa-paper-plane"></i> PARTAGER LA SORTIE
            </button>

            <a href="${data.gpx}" download class="download-btn">
                <i class="fa-solid fa-download"></i> TRACE GPX
            </a>

            <div style="margin:20px 0; line-height:1.6; color:#334155;">
                ${marked.parse(data.description || "")}
            </div>

            <div class="chart-container"><canvas id="elevationChart"></canvas></div>

            <h3 style="margin-top:30px;">📸 Galerie Photos</h3>
            <div id="rando-photos"></div>
        </div>
    `;

    // 3. Stats réelles
    const dist = (gpxLayer.get_distance() / 1000).toFixed(1);
    const elev = gpxLayer.get_elevation_gain().toFixed(0);
    const time = msToTime(gpxLayer.get_moving_time());

    document.getElementById('stats-placeholder').innerHTML = `
        <div class="stat-item"><span class="stat-value">${dist}km</span><span class="stat-label">Dist.</span></div>
        <div class="stat-item"><span class="stat-value">${elev}m</span><span class="stat-label">Déniv.</span></div>
        <div class="stat-item"><span class="stat-value">${time}</span><span class="stat-label">Temps</span></div>
    `;

    // 4. CHARGEMENT DES PHOTOS (Correction force .JPG)
    const pContainer = document.getElementById('rando-photos');
    if (data.photos && data.photos.length > 0) {
        data.photos.forEach(path => {
            // On s'assure que le chemin est propre
            const div = document.createElement('div');
            div.className = 'photo-box';
            div.innerHTML = `<a data-fslightbox="gallery" href="${path}"><img src="${path}" loading="lazy"></a>`;
            pContainer.appendChild(div);
        });
        if(window.refreshFsLightbox) refreshFsLightbox();
    } else {
        pContainer.innerHTML = "<p>Aucune photo pour cette sortie.</p>";
    }

    // Graphique altitude
    renderElevationChart(gpxLayer);

    // Events
    document.getElementById('close-panel-btn').onclick = () => panel.classList.add('hidden');
    document.getElementById('share-btn-action').onclick = () => partagerRando(data.title);

    panel.classList.remove('hidden');
}

// Fonction isolée pour le graphique
function renderElevationChart(gpxLayer) {
    const raw = gpxLayer.get_elevation_data();
    const lbls=[], dataPoints=[];
    raw.forEach((p, i) => { if(i%10===0) { lbls.push(p[0].toFixed(1)); dataPoints.push(p[1]); }}); 
    if(myElevationChart) myElevationChart.destroy();
    myElevationChart = new Chart(document.getElementById('elevationChart'), {
        type: 'line',
        data: { labels: lbls, datasets: [{ label: 'Alt', data: dataPoints, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', fill: true, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: {display:false} }, plugins: {legend:{display:false}} }
    });
}

// --- RECHERCHE ---
document.getElementById('search-input').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.rando-item').forEach(item => {
        item.style.display = item.querySelector('h3').innerText.toLowerCase().includes(term) ? 'flex' : 'none';
    });
});

// --- BOUTON RETOUR HAUT ---
const backToTopBtn = document.getElementById('back-to-top');
const scrollableSections = document.querySelectorAll('.page-section');
if (backToTopBtn) {
    scrollableSections.forEach(section => {
        section.addEventListener('scroll', () => {
            if (section.scrollTop > 300) backToTopBtn.classList.add('visible');
            else backToTopBtn.classList.remove('visible');
        });
    });
    backToTopBtn.addEventListener('click', () => {
        const activeSection = document.querySelector('.page-section.active');
        if(activeSection) activeSection.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ==========================================
// GESTION MOBILE : MINIMISER / MAXIMISER (TOGGLE)
// ==========================================
function toggleMobilePanel(panelId) {
    // On ne fait ça que sur mobile
    if (window.innerWidth > 768) return;

    const panel = document.getElementById(panelId);
    const icon = panel.querySelector('.mobile-toggle-bar i');
    
    // On ajoute/enlève la classe "minimized"
    panel.classList.toggle('minimized');

    // On change l'icône (Flèche haut ou bas)
    if (panel.classList.contains('minimized')) {
        // Si réduit -> Montrer flèche haut
        if(icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
    } else {
        // Si ouvert -> Montrer flèche bas
        if(icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
    }
}

// ==========================================
// GESTION DU MENU BURGER MOBILE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.getElementById('main-nav');
    const navLinks = document.querySelectorAll('.nav-link');

    if (menuToggle && nav) {
        // Ouvrir / Fermer au clic sur le burger
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('open');
            
            // Change l'icône (Barres <-> Croix)
            const icon = menuToggle.querySelector('i');
            if (nav.classList.contains('open')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            }
        });

        // Fermer le menu quand on clique sur un lien
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('open');
                const icon = menuToggle.querySelector('i');
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            });
        });
    }
});