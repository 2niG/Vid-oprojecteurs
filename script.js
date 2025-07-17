document.addEventListener('DOMContentLoaded', () => {
    const projectorContainer = document.getElementById('projector-container');
    const comparisonSection = document.getElementById('comparison-section');
    const comparisonTable = document.getElementById('comparison-table');
    const clearComparisonButton = document.getElementById('clear-comparison');
    const noResultsMessage = document.getElementById('no-results'); // Référence au message "aucun résultat"

    // Filter elements
    const searchBar = document.getElementById('search-bar');
    const minPriceInput = document.getElementById('min-price');
    const maxPriceInput = document.getElementById('max-price');
    const resolutionFilter = document.getElementById('resolution-filter');
    const brightnessFilter = document.getElementById('brightness-filter');
    const technologyFilter = document.getElementById('technology-filter'); // Nouveau filtre pour la technologie
    const applyFiltersButton = document.getElementById('apply-filters');
    const resetFiltersButton = document.getElementById('reset-filters');

    let allProjectors = []; // Stores the original, unfiltered list of projectors
    let projectorsToCompare = []; // Array to store IDs of projectors to compare

    // --- SCORE CALCULATION LOGIC ---

    // Define weights for each characteristic.
    // Weights are arbitrary and can be adjusted according to the importance you give them.
    const weights = {
        luminosite: 0.25, // Very important
        resolution: 0.30, // Most important
        contraste: 0.10,
        prix: 0.15, // Important, inverted (cheaper = better)
        autofocus_auto: 0.05,
        reglage_trapezoidal_auto: 0.05,
        bruit_db: 0.05, // Less important, inverted (less noise = better)
        duree_vie_lampe: 0.03, // Less important
        wifi: 0.02, // Wi-Fi 6 is better
        bluetooth: 0.01, // Bluetooth 5.2 is better
        ports_hdmi: 0.02, // More HDMI ports
        os_smart: 0.02, // Presence of smart OS
        android_tv: 0.02, // Specifically Android TV
        fonctionnalites_sup_count: 0.03 // Count of features
    };

    // Functions to normalize values on a 0 to 1 scale
    // These functions should be adapted to the actual value ranges of your data.

    function normalizeLuminosite(lumens) {
        if (!lumens || lumens === "N/A") return 0;

        if (lumens.includes("ANSI Lumens")) {
            const numericLumens = parseFloat(lumens.replace(' ANSI Lumens', '').trim());
            const maxAnsiLumens = 1000;
            return Math.min(numericLumens / maxAnsiLumens, 1);
        } else if (lumens.includes("LM")) {
            const numericLumens = parseFloat(lumens.replace('LM', '').trim());
            const maxLmLumens = 30000;
            return Math.min(numericLumens / maxLmLumens, 1);
        } else if (lumens.includes("Lumens (LED)")) {
            const numericLumens = parseFloat(lumens.replace(' Lumens (LED)', '').trim());
            const maxLedLumens = 5000;
            return Math.min(numericLumens / maxLedLumens, 1);
        }
        return 0; // Default for unhandled or invalid luminosity
    }

    function normalizeResolution(resolution) {
        const resMap = {
            "854x480 (FWVGA)": 0.2, // FWVGA
            "1280x720 (HD)": 0.5, // HD
            "1920x1080 (Full HD natif, support 4K)": 1.0, // Full HD + 4K support
            "1920x1080 (Full HD native, décodage 4K)": 1.0, // Full HD + 4K decoding
            "1920x1080 (Full HD native, 60Hz)": 0.9, // Full HD
            "3840x2160 (4K UHD)": 1.0 // Added 4K native if it exists in your data
        };
        return resMap[resolution] || 0; // Default to 0 if resolution not found
    }

    function normalizeContraste(contraste) {
        if (!contraste || contraste === "Non spécifié" || !contraste.includes(':1')) return 0;
        const ratio = parseFloat(contraste.replace(':1', ''));
        return Math.min(ratio / 30000, 1); // Assuming a max contrast of 30000:1 based on your data
    }

    function normalizePrix(prix, maxPrice = 350) { // Find the max price from your dataset
        if (prix === null || isNaN(prix)) return 0; // If price is unknown, very low score or 0.
        return 1 - (prix / maxPrice); // Cheaper = higher score
    }

    function normalizeBoolean(value) {
        return value ? 1 : 0;
    }

    function normalizeBruit(bruit_db, minDb = 25, maxDb = 40) { // Adjusted range for more typical projector noise (25-40dB)
        if (!bruit_db || bruit_db.includes("non spécifié")) return 0.5; // Neutral if not specified
        const numericDb = parseFloat(bruit_db.replace(' dB', ''));
        if (isNaN(numericDb)) return 0.5; // Fallback
        // Invert logic: lower noise = higher score.
        // Clamp to ensure score stays between 0 and 1
        return Math.max(0, Math.min(1, 1 - ((numericDb - minDb) / (maxDb - minDb))));
    }

    function normalizeDureeVieLampe(duree) {
        if (!duree) return 0;
        const hours = parseFloat(duree.replace(' heures (LED)', ''));
        if (isNaN(hours)) return 0;
        return Math.min(hours / 80000, 1); // Max 80000 hours found in your data
    }

    function normalizeWifi(wifi) {
        if (wifi && wifi.includes("Wi-Fi 6")) return 1;
        if (wifi && (wifi.includes("Wi-Fi 5G") || wifi.includes("Wi-Fi 5"))) return 0.8;
        return 0; // Others or not specified
    }

    function normalizeBluetooth(bluetooth) {
        if (bluetooth && bluetooth.includes("5.2")) return 1;
        if (bluetooth && bluetooth.includes("5.0")) return 0.8;
        if (bluetooth && bluetooth.includes("4.2")) return 0.6;
        return 0; // Others or not specified
    }

    function normalizePorts(portsArray) {
        let hdmiCount = 0;
        let usbCount = 0;
        if (portsArray) {
            portsArray.forEach(port => {
                if (port.includes("HDMI")) {
                    const match = port.match(/x(\d+)/);
                    hdmiCount += match ? parseInt(match[1]) : 1;
                }
                if (port.includes("USB")) {
                    const match = port.match(/x(\d+)/);
                    usbCount += match ? parseInt(match[1]) : 1;
                }
            });
        }
        const maxExpectedPorts = 4;
        return Math.min((hdmiCount + usbCount) / maxExpectedPorts, 1);
    }

    // Function to calculate the score for a projector
    function calculateScore(projector) {
        let score = 0;

        score += normalizeLuminosite(projector.luminosite) * weights.luminosite;
        score += normalizeResolution(projector.resolution) * weights.resolution;
        score += normalizeContraste(projector.contraste) * weights.contraste;

        const maxPrice = 350;
        score += normalizePrix(projector.prix, maxPrice) * weights.prix;

        score += normalizeBoolean(projector.autofocus_auto) * weights.autofocus_auto;
        score += normalizeBoolean(projector.reglage_trapezoidal_auto) * weights.reglage_trapezoidal_auto;
        score += normalizeBruit(projector.bruit_db) * weights.bruit_db;
        score += normalizeDureeVieLampe(projector.duree_vie_lampe) * weights.duree_vie_lampe;

        if (projector.connectivite) {
            score += normalizeWifi(projector.connectivite.wifi) * weights.wifi;
            score += normalizeBluetooth(projector.connectivite.bluetooth) * weights.bluetooth;
            score += normalizePorts(projector.connectivite.ports) * weights.ports_hdmi;
        }

        score += normalizeBoolean(projector.os_smart || projector.android_tv) * weights.os_smart;
        if (projector.android_tv) {
            score += weights.android_tv;
        }

        const supFeatCount = projector.fonctionnalites_sup ? projector.fonctionnalites_sup.length : 0;
        score += Math.min(supFeatCount / 5, 1) * weights.fonctionnalites_sup_count;

        return Math.round(score * 100);
    }

    // --- END SCORE CALCULATION LOGIC ---

    // Function to load data
    async function loadProjectors() {
        try {
            const response = await fetch('data.json');
            allProjectors = await response.json();

            // Calculate score for each projector after loading
            allProjectors.forEach(projector => {
                projector.score = calculateScore(projector);
            });

            displayProjectors(allProjectors); // Initially display all projectors
        } catch (error) {
            console.error('Erreur lors du chargement des vidéoprojecteurs :', error);
            projectorContainer.innerHTML = '<p style="color: red; text-align: center;">Impossible de charger les vidéoprojecteurs. Veuillez réessayer plus tard.</p>';
        }
    }

    // Function to display projectors as cards
    function displayProjectors(projectorsToDisplay) {
        projectorContainer.innerHTML = ''; // Clear container
        if (projectorsToDisplay.length === 0) {
            noResultsMessage.style.display = 'block'; // Show no results message
            return;
        } else {
            noResultsMessage.style.display = 'none'; // Hide no results message
        }

        projectorsToDisplay.forEach(projector => {
            const card = document.createElement('div');
            card.classList.add('projector-card');
            card.setAttribute('data-id', projector.id);

            const osSmartHtml = projector.os_smart ? `<p><strong>OS Intelligent:</strong> ${projector.os_smart}</p>` : '';
            const autofocusText = projector.autofocus_auto ? 'Auto' : 'Manuel';
            const keystoneText = projector.reglage_trapezoidal_auto ? 'Auto' : 'Manuel';

            // Determine score class for coloring the progress bar
            let scoreClass = '';
            if (projector.score >= 75) {
                scoreClass = 'high';
            } else if (projector.score >= 50) {
                scoreClass = 'medium';
            } else {
                scoreClass = 'low';
            }

            card.innerHTML = `
                <img src="${projector.image}" alt="${projector.nom}">
                <div class="projector-card-content">
                    <h3>${projector.nom}</h3>
                    <p class="price">${projector.prix !== null ? `${projector.prix} €` : 'N/A'}</p>
                    <div class="score-display">
                        <p><strong>Note:</strong></p>
                        <div class="score-bar-container">
                            <div class="score-bar ${scoreClass}" style="width: ${projector.score}%;"></div>
                            <span class="score-text">${projector.score}/100</span>
                        </div>
                    </div>
                    <p>${projector.description}</p>
                    <p><strong>Connectivité:</strong> ${(projector.connectivite && projector.connectivite.wifi) || 'N/A'}, ${(projector.connectivite && projector.connectivite.bluetooth) || 'N/A'}, ${(projector.connectivite && projector.connectivite.ports && projector.connectivite.ports.join(', ')) || 'N/A'}</p>
                    <p><strong>Luminosité:</strong> ${projector.luminosite || 'N/A'}</p>
                    <p><strong>Contraste:</strong> ${projector.contraste || 'N/A'}</p>
                    <p><strong>Résolution:</strong> ${projector.resolution || 'N/A'}</p>
                    <p><strong>Technologie d'affichage:</strong> ${projector.technologie_affichage || 'N/A'}</p>
                    <p><strong>Taille d'image min:</strong> ${projector.taille_image_min || 'N/A'}</p>
                    <p><strong>Taille d'image max:</strong> ${projector.taille_image_max || 'N/A'}</p>
                    <p><strong>Rapport de projection:</strong> ${projector.rapport_projection || 'N/A'}</p>
                    <p><strong>Durée de vie lampe/source:</strong> ${projector.duree_vie_lampe || 'N/A'}</p>
                    <p><strong>Autofocus:</strong> ${autofocusText}</p>
                    <p><strong>Réglage Trapézoïdale:</strong> ${keystoneText}</p>
                    <p><strong>Bruit:</strong> ${projector.bruit_db || 'N/A'}</p>
                    <p><strong>Android TV:</strong> ${projector.android_tv ? 'Oui' : 'Non'}</p>
                    ${osSmartHtml}
                    <button class="add-to-compare">Ajouter à la comparaison</button>
                </div>
            `;
            projectorContainer.appendChild(card);
        });
        attachAddCompareListeners();
    }

    // Attach event listeners to "Add to comparison" buttons
    function attachAddCompareListeners() {
        document.querySelectorAll('.add-to-compare').forEach(button => {
            button.onclick = (event) => {
                const projectorId = event.target.closest('.projector-card').dataset.id;
                addProjectorToCompare(projectorId);
            };
        });
    }

    // Function to add a projector to comparison
    function addProjectorToCompare(id) {
        if (!projectorsToCompare.includes(id)) {
            if (projectorsToCompare.length < 3) { // Limit comparison to 3 items
                projectorsToCompare.push(id);
                updateComparisonTable();
                comparisonSection.style.display = 'block'; // Show comparison section
            } else {
                alert('Vous ne pouvez comparer que 3 vidéoprojecteurs maximum.');
            }
        } else {
            alert('Ce vidéoprojecteur est déjà dans la comparaison !');
        }
    }

    // Function to remove a projector from comparison
    function removeProjectorFromCompare(id) {
        projectorsToCompare = projectorsToCompare.filter(pId => pId !== id);
        updateComparisonTable();
        if (projectorsToCompare.length === 0) {
            comparisonSection.style.display = 'none'; // Hide if no products to compare
        }
    }

    // Function to update the comparison table
    function updateComparisonTable() {
        const selectedProjectors = allProjectors.filter(p => projectorsToCompare.includes(p.id));

        // Clear table
        comparisonTable.innerHTML = '';

        // Create table header
        const thead = comparisonTable.createTHead();
        const headerRow = thead.insertRow();
        headerRow.insertCell().textContent = 'Caractéristique'; // Empty cell for characteristics

        selectedProjectors.forEach(projector => {
            const th = document.createElement('th');
            th.innerHTML = `
                <div>
                    ${projector.nom}
                    <button class="remove-btn" data-id="${projector.id}">X</button>
                </div>
                <img src="${projector.image}" alt="${projector.nom}" style="max-width: 80px; height: auto; display: block; margin: 10px auto;">
            `;
            headerRow.appendChild(th);
        });

        const tbody = comparisonTable.createTBody();

        // Define characteristics to compare and their order
        const characteristics = [
            { label: 'Note Globale', key: 'score', type: 'score' }, // New: Score
            { label: 'Prix', key: 'prix', type: 'price' },
            { label: 'Description', key: 'description', type: 'text' },
            { label: 'Résolution', key: 'resolution', type: 'text' },
            { label: 'Luminosité', key: 'luminosite', type: 'text' },
            { label: 'Contraste', key: 'contraste', type: 'text' },
            { label: 'Technologie d\'affichage', key: 'technologie_affichage', type: 'text' },
            { label: 'Taille d\'image min', key: 'taille_image_min', type: 'text' },
            { label: 'Taille d\'image max', key: 'taille_image_max', type: 'text' },
            { label: 'Rapport de projection', key: 'rapport_projection', type: 'text' },
            { label: 'Durée de vie lampe/source', key: 'duree_vie_lampe', type: 'text' },
            { label: 'Wi-Fi', key: 'connectivite.wifi', type: 'nested' },
            { label: 'Bluetooth', key: 'connectivite.bluetooth', type: 'nested' },
            { label: 'Ports', key: 'connectivite.ports', type: 'nested-array' },
            { label: 'Autofocus', key: 'autofocus_auto', type: 'autofocus' }, // Custom type for Autofocus
            { label: 'Réglage Trapézoïdale', key: 'reglage_trapezoidal_auto', type: 'keystone' }, // Custom type for Keystone
            { label: 'Bruit (dB)', key: 'bruit_db', type: 'text' },
            { label: 'Android TV', key: 'android_tv', type: 'boolean' },
            { label: 'OS Intelligent', key: 'os_smart', type: 'text' },
            { label: 'Fonctionnalités Supplémentaires', key: 'fonctionnalites_sup', type: 'array-text' }
        ];

        characteristics.forEach(char => {
            const row = tbody.insertRow();
            row.insertCell().textContent = char.label;

            selectedProjectors.forEach(projector => {
                const cell = row.insertCell();
                let value;

                if (char.type === 'nested') {
                    const keys = char.key.split('.');
                    value = projector[keys[0]] && projector[keys[0]][keys[1]] ? projector[keys[0]][keys[1]] : 'N/A';
                } else if (char.type === 'nested-array') {
                    const keys = char.key.split('.');
                    value = projector[keys[0]] && projector[keys[0]][keys[1]] && projector[keys[0]][keys[1]].length > 0 ? projector[keys[0]][keys[1]].join(', ') : 'N/A';
                } else if (char.type === 'boolean') {
                    value = projector[char.key] ? 'Oui' : 'Non';
                } else if (char.type === 'price') {
                    value = `${projector[char.key] !== null ? `${projector[char.key]} €` : 'N/A'}`;
                } else if (char.type === 'array-text') {
                    value = projector[char.key] && projector[char.key].length > 0
                        ? projector[char.key].join(', ')
                        : 'N/A';
                } else if (char.type === 'autofocus') {
                    value = projector[char.key] ? 'Auto' : 'Manuel';
                } else if (char.type === 'keystone') {
                    value = projector[char.key] ? 'Auto' : 'Manuel';
                } else if (char.type === 'score') {
                    // This is where we inject the visual score for the comparison table
                    let scoreClass = '';
                    if (projector.score >= 75) {
                        scoreClass = 'high';
                    } else if (projector.score >= 50) {
                        scoreClass = 'medium';
                    } else {
                        scoreClass = 'low';
                    }
                    cell.innerHTML = `
                        <div class="score-bar-container-comparison">
                            <div class="score-bar ${scoreClass}" style="width: ${projector.score}%;"></div>
                            <span class="score-text">${projector.score}/100</span>
                        </div>
                    `;
                    return; // Skip setting textContent as innerHTML is already set
                } else {
                    value = projector[char.key] || 'N/A';
                }
                cell.textContent = value;
            });
        });

        // Attach listeners for remove buttons
        document.querySelectorAll('.remove-btn').forEach(button => {
            button.onclick = (event) => {
                const idToRemove = event.target.dataset.id;
                removeProjectorFromCompare(idToRemove);
            };
        });
    }

    // Clear all comparison
    clearComparisonButton.addEventListener('click', () => {
        projectorsToCompare = [];
        updateComparisonTable();
        comparisonSection.style.display = 'none';
    });

    // --- Search and Filter Logic ---

    // Function to apply all filters and search
    function applyAllFilters() {
        const searchTerm = searchBar.value.toLowerCase().trim();
        const minPrice = parseFloat(minPriceInput.value);
        const maxPrice = parseFloat(maxPriceInput.value);
        const selectedResolution = resolutionFilter.value;
        const selectedBrightness = brightnessFilter.value;
        const selectedTechnology = technologyFilter.value;

        let filteredProjectors = allProjectors.filter(projector => {
            const matchesSearch = !searchTerm ||
                                    (projector.nom && projector.nom.toLowerCase().includes(searchTerm)) ||
                                    (projector.description && projector.description.toLowerCase().includes(searchTerm));

            const matchesPrice = (projector.prix === null || isNaN(projector.prix) || (!isNaN(minPrice) ? projector.prix >= minPrice : true)) &&
                                 (projector.prix === null || isNaN(projector.prix) || (!isNaN(maxPrice) ? projector.prix <= maxPrice : true));

            const matchesResolution = !selectedResolution ||
                (projector.resolution && projector.resolution.includes(selectedResolution));

            let matchesBrightness = true;
            if (selectedBrightness && projector.luminosite) {
                let projectorBrightnessNumeric;
                if (projector.luminosite.includes("ANSI Lumens")) {
                    projectorBrightnessNumeric = parseFloat(projector.luminosite.replace(' ANSI Lumens', '').trim());
                } else if (projector.luminosite.includes("LM")) {
                    projectorBrightnessNumeric = parseFloat(projector.luminosite.replace('LM', '').trim()) / 50;
                } else if (projector.luminosite.includes("Lumens (LED)")) {
                    projectorBrightnessNumeric = parseFloat(projector.luminosite.replace(' Lumens (LED)', '').trim()) / 20;
                } else {
                    projectorBrightnessNumeric = NaN;
                }

                if (!isNaN(projectorBrightnessNumeric)) {
                    if (selectedBrightness === '<1000') {
                        matchesBrightness = projectorBrightnessNumeric < 1000;
                    } else if (selectedBrightness === '1000-2000') {
                        matchesBrightness = projectorBrightnessNumeric >= 1000 && projectorBrightnessNumeric <= 2000;
                    } else if (selectedBrightness === '>2000') {
                        matchesBrightness = projectorBrightnessNumeric > 2000;
                    }
                } else {
                    matchesBrightness = false;
                }
            }

            const matchesTechnology = !selectedTechnology ||
                (projector.technologie_affichage && projector.technologie_affichage.toLowerCase() === selectedTechnology.toLowerCase());

            return matchesSearch && matchesPrice && matchesResolution && matchesBrightness && matchesTechnology;
        });

        displayProjectors(filteredProjectors);
    }

    // Event listeners for filters and search
    applyFiltersButton.addEventListener('click', applyAllFilters);
    searchBar.addEventListener('input', applyAllFilters);
    minPriceInput.addEventListener('input', applyAllFilters);
    maxPriceInput.addEventListener('input', applyAllFilters);
    resolutionFilter.addEventListener('change', applyAllFilters);
    brightnessFilter.addEventListener('change', applyAllFilters);
    technologyFilter.addEventListener('change', applyAllFilters);

    // Reset filters
    resetFiltersButton.addEventListener('click', () => {
        searchBar.value = '';
        minPriceInput.value = '';
        maxPriceInput.value = '';
        resolutionFilter.value = '';
        brightnessFilter.value = '';
        technologyFilter.value = '';
        displayProjectors(allProjectors); // Display all original projectors
    });

    // Initial load of projectors
    loadProjectors();
});