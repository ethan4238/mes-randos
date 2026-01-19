// ==========================================
// 1. GESTION DE LA NAVIGATION (SPA)
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
    }

    const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
    if(activeLink) activeLink.classList.add('active');

    if(targetId === 'app-container' && map) {
        setTimeout(() => { map.invalidateSize(); }, 200);
    }
}

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(link.getAttribute('data-target'));
    });
});

function goToMap() { showSection('app-container'); }


// ==========================================
// 2. CONFIGURATION DE LA CARTE (LEAFLET)
// ==========================================
const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap' });
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' });

var map = L.map('map', { 
    center: [45.1885, 5.7245], 
    zoom: 10, 
    layers: [topoLayer], 
    zoomControl: false 
});

L.control.zoom({ position: 'topleft' }).addTo(map);

const switchControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function(map) {
        const btn = L.DomUtil.create('button', 'map-switch-btn');
        btn.innerHTML = '🛰️ Satellite';
        btn.style.padding = "8px 12px";
        btn.style.background = "white";
        btn.style.border = "none";
        btn.style.borderRadius = "20px";
        btn.style.fontWeight = "bold";
        btn.style.cursor = "pointer";
        btn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";

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


// ==========================================
// 3. GESTION DES DONNÉES & GPX
// ==========================================
fetch('randos.json')
    .then(response => response.json())
    .then(jsonData => {
        const mesRandos = jsonData.items;
        if (mesRandos) {
            mesRandos.forEach((data, index) => {
                
                // --- CORRECTION POUR TON NOUVEAU JSON (CLOUDINARY) ---
                let safePhotos = [];
                if (data.photos) {
                    if (Array.isArray(data.photos)) {
                        // On vérifie si c'est un objet {image: "url"} (nouveau format) ou juste une chaîne (ancien)
                        safePhotos = data.photos.map(p => (typeof p === 'object' && p.image) ? p.image : p);
                    } else if (typeof data.photos === 'string') {
                        safePhotos = [data.photos];
                    }
                }
                data.safePhotos = safePhotos; // On stocke la liste propre d'URLs
                // -----------------------------------------------------

                const trackColor = getDiffColor(data.difficulty);

                // Leaflet GPX gère les URLs Cloudinary sans problème
                const gpxLayer = new L.GPX(data.gpx, {
                    async: true,
                    marker_options: {
                        startIconUrl: 'icones/depart.png', endIconUrl: 'icones/arrivee.png', shadowUrl: null, iconSize: [32, 32], iconAnchor: [16, 32]
                    },
                    polyline_options: { color: trackColor, opacity: 0.8, weight: 5, lineCap: 'round' }
                }).on('loaded', function(e) {
                    const dist = (e.target.get_distance() / 1000).toFixed(1);
                    const elDist = document.getElementById(`dist-${index}`);
                    if(elDist) elDist.innerText = `${dist} km`;

                    const rawDate = e.target.get_start_time();
                    if(rawDate) {
                        const dateStr = rawDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                        data.calculatedDate = dateStr; 
                    }
                }).on('click', function(e) {
                    L.DomEvent.stopPropagation(e);
                    afficherDetails(data, gpxLayer);
                    updateActiveItem(index);
                }).addTo(map);

                addRandoToList(data, index, safePhotos, gpxLayer);
            });
        }
    })
    .catch(err => console.error("Erreur chargement:", err));

function addRandoToList(data, index, photos, gpxLayer) {
    const list = document.getElementById('randonnees-list');
    if (!list) return;

    const item = document.createElement('div');
    item.className = 'rando-item';
    item.id = `item-${index}`;
    item.setAttribute('data-diff', data.difficulty); 
    item.setAttribute('data-id', index); 
    
    // IMAGE PAR DÉFAUT si pas de photos
    let thumbUrl = 'https://via.placeholder.com/80?text=Rando';
    if (photos && photos.length > 0) thumbUrl = photos[0];
    
    const diff = data.difficulty || "Moyenne";
    const diffColor = getDiffColor(diff);
    const isFav = getFavoris().includes(index);
    const heartIcon = isFav ? '❤️' : '🤍';
    const activeClass = isFav ? 'active' : '';

    item.innerHTML = `
        <img src="${thumbUrl}" class="list-thumb" loading="lazy" alt="${data.title}" onerror="this.src='https://via.placeholder.com/80?text=No+Img'">
        <div class="list-content">
            <h3 style="margin:0; font-size:1rem; color:#0f172a;">${data.title}</h3>
            <p style="margin:2px 0; font-size:0.85rem; color:#64748b;">Distance : <span id="dist-${index}">...</span></p>
            <span class="diff-badge" style="background-color: ${diffColor}; padding:2px 8px; border-radius:10px; color:white; font-size:0.7rem;">${diff}</span>
        </div>
        <button id="fav-btn-${index}" class="fav-btn-list ${activeClass}" onclick="toggleFavori(${index}, event)">${heartIcon}</button>
    `;
    
    item.addEventListener('click', () => {
        document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // Ouvre les détails
        afficherDetails(data, gpxLayer);
        
        // Zoom sur la carte
        if (gpxLayer && map) {
            map.fitBounds(gpxLayer.getBounds());
        }

        // Mobile : ferme la liste
        if (window.innerWidth < 768) {
            const sidebar = document.getElementById('sidebar');
            if(sidebar && !sidebar.classList.contains('minimized')) {
                sidebar.classList.add('minimized');
            }
        }
    });

    list.appendChild(item);
}


// ==========================================
// 4. PANNEAU DE DÉTAILS
// ==========================================
function afficherDetails(data, gpxLayer) {
    const panel = document.getElementById('info-panel');
    const displayDate = data.calculatedDate || "Date inconnue";
    const diffColor = getDiffColor(data.difficulty);

    panel.innerHTML = `
        <div class="mobile-toggle-bar" onclick="toggleMobilePanel('info-panel')">
            <i class="fa-solid fa-chevron-down"></i>
        </div>

        <div class="panel-header">
            <h2 style="margin:0;">${data.title}</h2>
            <button id="close-panel-btn" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#64748b;">&times;</button>
        </div>

        <div class="panel-content">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <span style="color:#64748b; font-weight:700; font-size:0.9rem;">📅 ${displayDate}</span>
                <span style="background:${diffColor}; color:white; padding:4px 12px; border-radius:12px; font-weight:700; font-size:0.75rem;">${data.difficulty}</span>
            </div>

            <div id="stats-placeholder" class="stats-grid">Chargement...</div>

            <button id="share-btn-action" class="share-btn">
                <i class="fa-solid fa-paper-plane"></i> Partager la sortie
            </button>

            <a href="${data.gpx}" download class="download-btn">
                <i class="fa-solid fa-download"></i> Télécharger la trace GPX
            </a>
            
            <div style="color:#334155; line-height:1.6; margin: 20px 0; font-size:0.95rem;">
                ${marked.parse(data.description || "")}
            </div>
            
            <div class="chart-container"><canvas id="elevationChart"></canvas></div>

            <h3 style="font-size:1.1rem; margin-top:20px; margin-bottom:10px;">📸 Galerie Photos</h3>
            <div id="rando-photos"></div>
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

    const pContainer = document.getElementById('rando-photos');
    if(data.safePhotos && data.safePhotos.length > 0) {
        data.safePhotos.forEach(url => {
            const div = document.createElement('div');
            div.className = 'photo-box';
            div.innerHTML = `<a data-fslightbox="gallery" href="${url}"><img src="${url}" loading="lazy" alt="Photo rando"></a>`;
            pContainer.appendChild(div);
        });
        if(typeof refreshFsLightbox === 'function') refreshFsLightbox();
    } else {
        pContainer.innerHTML = "<p style='color:#94a3b8; font-style:italic;'>Pas de photos pour cette sortie.</p>";
    }

    const raw = gpxLayer.get_elevation_data();
    const lbls=[], dataPoints=[];
    raw.forEach((p, i) => { if(i%10===0) { lbls.push(p[0].toFixed(1)); dataPoints.push(p[1]); }}); 

    if(myElevationChart) myElevationChart.destroy();
    myElevationChart = new Chart(document.getElementById('elevationChart'), {
        type: 'line',
        data: { labels: lbls, datasets: [{ label: 'Altitude', data: dataPoints, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', fill: true, pointRadius: 0, borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: {display:false}, y: {ticks:{font:{size:10}}} }, plugins: {legend:{display:false}} }
    });

    document.getElementById('close-panel-btn').onclick = () => {
        panel.classList.add('hidden');
        document.querySelectorAll('.rando-item').forEach(i => i.classList.remove('active'));
    };
    document.getElementById('share-btn-action').onclick = () => partagerRando(data.title);

    panel.classList.remove('hidden');
    panel.classList.remove('minimized');
}


// ==========================================
// 5. FONCTIONS UTILITAIRES
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

function getFavoris() { return JSON.parse(localStorage.getItem('mes_favoris_randos')) || []; }

function toggleFavori(index, event) {
    if(event) event.stopPropagation();
    let favoris = getFavoris();
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

function filtrerRandos(filtre) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(b => { if(b.textContent.includes(filtre === 'all' ? 'Tout' : filtre)) b.classList.add('active'); });
    if(filtre === 'favoris') document.querySelector('button[onclick="filtrerRandos(\'favoris\')"]').classList.add('active');

    const items = document.querySelectorAll('.rando-item');
    const favoris = getFavoris();

    items.forEach(item => {
        const diff = item.getAttribute('data-diff');
        const id = parseInt(item.getAttribute('data-id'));
        if (filtre === 'all') item.style.display = 'flex';
        else if (filtre === 'favoris') item.style.display = favoris.includes(id) ? 'flex' : 'none';
        else item.style.display = (diff === filtre) ? 'flex' : 'none';
    });
}

async function partagerRando(titre) {
    const url = window.location.href; 
    const text = `Regarde cette rando : ${titre} ! 🏔️`;
    if (navigator.share) {
        try { await navigator.share({ title: titre, text: text, url: url }); } catch (err) {}
    } else {
        navigator.clipboard.writeText(`${text} ${url}`).then(() => alert('Lien copié ! 📋'));
    }
}

document.getElementById('search-input').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.rando-item').forEach(item => {
        const title = item.querySelector('h3').innerText.toLowerCase();
        item.style.display = title.includes(term) ? 'flex' : 'none';
    });
});

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

function toggleMobilePanel(panelId) {
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