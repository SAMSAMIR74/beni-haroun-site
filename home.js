// Register Service Worker for offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}

// Check authentication
window.addEventListener('DOMContentLoaded', async () => {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (!isLoggedIn) {
        window.location.href = 'login.html';
        return;
    }

    // Load table data immediately (show UI fast)
    loadData();

    // Load CSV data in background AFTER UI is ready (non-blocking)
    setTimeout(() => {
        loadCSVDataNonBlocking();
    }, 100); // Small delay to let UI render first
});

// Logout function
function logout() {
    localStorage.removeItem('isLoggedIn');
    window.location.href = 'login.html';
}

// Data storage key
const DATA_KEY = 'barrageData';

// CSV data storage (optimized)
let surfaceData = new Map();
let volumeData = new Map();
let isCSVLoaded = false;
let currentFilteredData = null; // Track current search results

// Pagination
let currentPage = 1;
const itemsPerPage = 50;

// Constants
const VOLUME_MAX_FOR_TAUX = 880.139; // Hm³ for Taux calculation

// Load CSV data in background (non-blocking)
async function loadCSVDataNonBlocking() {
    if (isCSVLoaded) return;

    try {
        // Use preloaded data from data.js if available
        if (typeof CSV_DATA !== 'undefined') {
            console.log('Loading embedded CSV data...');
            await processCSVInChunks(CSV_DATA.surface, surfaceData, 'surface');
            await processCSVInChunks(CSV_DATA.volume, volumeData, 'volume');
        } else {
            console.error('CSV_DATA Not found! Trying fetch fallback...');
            // Fallback to fetch (legacy)
            const surfaceResponse = await fetch('data/surface.csv');
            if (surfaceResponse.ok) {
                const text = await surfaceResponse.text();
                await processCSVInChunks(text, surfaceData, 'surface');
            }

            const volumeResponse = await fetch('data/volume.csv');
            if (volumeResponse.ok) {
                const text = await volumeResponse.text();
                await processCSVInChunks(text, volumeData, 'volume');
            }
        }

        isCSVLoaded = true;
        console.log('CSV data processed successfully');

        // Reload table to show calculated values now that data is loaded
        loadData(currentFilteredData);

    } catch (error) {
        console.error('Error processing CSV data:', error);
    }
}

// Process CSV in chunks to avoid blocking
async function processCSVInChunks(csvData, targetMap, type) {
    const lines = csvData.split(/\r?\n/);
    const chunkSize = 10000; // Larger chunks for faster loading

    for (let i = 0; i < lines.length; i += chunkSize) {
        const chunk = lines.slice(i, i + chunkSize);
        chunk.forEach(line => {
            if (!line.trim()) return;

            // Handle both semicolon and comma delimiters (Preference for semicolon now)
            let parts;
            if (line.includes(';')) {
                parts = line.trim().split(';');
            } else {
                parts = line.trim().split(',');
            }

            if (parts.length >= 2) {
                // IMPORTANT: Replace comma with dot for decimal parsing
                // Example: "105,00" -> "105.00"
                const keyStr = parts[0].replace(/,/g, '.').trim();
                const valStr = parts[1].replace(/,/g, '.').trim();

                const key = parseFloat(keyStr);
                const value = parseFloat(valStr);

                if (!isNaN(key) && !isNaN(value)) {
                    // Store key as string with 2 decimal places for consistent matching
                    targetMap.set(key.toFixed(2), value);
                }
            }
        });

        // Allow UI to breathe only for very large files (removed unnecessary delays)
        if (i > 0 && i % 30000 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}

// Get surface value from CSV data
function getSurface(cote) {
    if (!isCSVLoaded || !cote) return 0;
    // Normalize input: replace comma with dot, verify it's a number
    let val = typeof cote === 'string' ? cote.replace(/,/g, '.') : cote;
    // Format to 2 decimal places to match map keys (e.g., "105.00")
    const key = parseFloat(val).toFixed(2);
    return surfaceData.get(key) || 0;
}

// Get volume value from CSV data
function getVolume(cote) {
    if (!isCSVLoaded || !cote) return 0;
    // Normalize input: replace comma with dot, verify it's a number
    let val = typeof cote === 'string' ? cote.replace(/,/g, '.') : cote;
    // Format to 2 decimal places to match map keys (e.g., "105.00")
    const key = parseFloat(val).toFixed(2);
    return volumeData.get(key) || 0;
}

// Get all stored data
function getData() {
    const data = localStorage.getItem(DATA_KEY);
    return data ? JSON.parse(data) : [];
}

// Save data
function saveData(data) {
    const json = JSON.stringify(data);
    localStorage.setItem(DATA_KEY, json);
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
}

// Load and display data with Pagination
function loadData(filteredData = null) {
    currentFilteredData = filteredData;
    const fullDB = getData(); // Read once for performance
    const data = filteredData || fullDB;

    const tbody = document.getElementById('dataTableBody');
    tbody.innerHTML = '';

    // Show/Hide Reset Button
    const resetContainer = document.getElementById('resetSearchContainer');
    if (filteredData) {
        resetContainer.classList.remove('hidden');
    } else {
        resetContainer.classList.add('hidden');
    }

    // Check if no data
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="16" class="text-center">Aucune donnée disponible</td></tr>';
        renderPaginationControls(0);
        return;
    }

    // Sort by date descending
    data.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Pagination
    const totalPages = Math.ceil(data.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = data.slice(startIndex, endIndex);

    // Render Rows
    pageData.forEach(entry => {
        const surface = parseFloat(getSurface(entry.cote));
        const volume = parseFloat(getVolume(entry.cote));

        // Calculate Gains
        const currentDate = new Date(entry.date);
        const previousDate = new Date(currentDate);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateString = previousDate.toISOString().split('T')[0];
        const previousEntry = fullDB.find(e => e.date === previousDateString);

        let gains = 0;
        if (previousEntry) {
            const previousVolume = parseFloat(getVolume(previousEntry.cote));
            gains = volume - previousVolume;
        }

        const evaporation = ((surface * parseFloat(entry.lectureBac)) / 1000) * 0.78;
        const defluent = evaporation + parseFloat(entry.vdf) + parseFloat(entry.dvr) +
            parseFloat(entry.fuites) + parseFloat(entry.transfert);
        const affluent = gains + defluent;
        const taux = (volume * 100) / VOLUME_MAX_FOR_TAUX;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(entry.date)}</td>
            <td>${parseFloat(entry.cote).toFixed(2)}</td>
            <td>${surface.toFixed(3)}</td>
            <td>${volume.toFixed(3)}</td>
            <td>${gains.toFixed(3)}</td>
            <td>${evaporation.toFixed(3)}</td>
            <td>${parseFloat(entry.vdf).toFixed(3)}</td>
            <td>${parseFloat(entry.dvr).toFixed(3)}</td>
            <td>${parseFloat(entry.fuites).toFixed(3)}</td>
            <td>${parseFloat(entry.transfert).toFixed(3)}</td>
            <td>${affluent.toFixed(3)}</td>
            <td>${defluent.toFixed(3)}</td>
            <td>${parseFloat(entry.pluie).toFixed(1)}</td>
            <td>${parseFloat(entry.lectureBac).toFixed(1)}</td>
            <td>${taux.toFixed(2)}%</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-small btn-edit" onclick="editEntry('${entry.date}')" title="Modifier">✏️</button>
                    <button type="button" class="btn-small btn-delete" onclick="deleteEntry('${entry.date}')" title="Supprimer">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    renderPaginationControls(totalPages);
}

// Render Pagination Controls
function renderPaginationControls(totalPages) {
    const container = document.getElementById('paginationControls');
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-pagination';
    prevBtn.innerText = '◀';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { currentPage--; loadData(currentFilteredData); };
    container.appendChild(prevBtn);

    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.innerText = `Page ${currentPage} / ${totalPages}`;
    container.appendChild(info);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-pagination';
    nextBtn.innerText = '▶';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { currentPage++; loadData(currentFilteredData); };
    container.appendChild(nextBtn);
}

// Delete entry
function deleteEntry(date) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette entrée?')) {
        let data = getData();
        data = data.filter(e => e.date !== date);
        saveData(data);
        loadData(currentFilteredData); // Reload current view
        alert('Entrée supprimée avec succès!');
    }
}

// Edit entry - Populate form fields with entry data
function editEntry(date) {
    const data = getData();
    const entry = data.find(d => d.date === date);

    if (!entry) {
        console.error('Entry not found for date:', date);
        alert('Entrée non trouvée!');
        return;
    }

    console.log('Editing entry:', entry);

    document.getElementById('date').value = entry.date || '';
    document.getElementById('cote').value = entry.cote || '';
    document.getElementById('vdf').value = entry.vdf || '0';
    document.getElementById('dvr').value = entry.dvr || '0';
    document.getElementById('fuites').value = entry.fuites || '0';
    document.getElementById('transfert').value = entry.transfert || '0';
    document.getElementById('pluie').value = entry.pluie || '0';
    document.getElementById('lectureBac').value = entry.lectureBac || '0';

    const submitBtn = document.querySelector('#dataEntryForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = '✏️ Modifier';
    }

    const form = document.getElementById('dataEntryForm');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
            const coteInput = document.getElementById('cote');
            if (coteInput) {
                coteInput.focus();
                coteInput.select();
            }
        }, 300);
    }
}

// Search functions
function searchByDate() {
    const searchDate = document.getElementById('searchDate').value;
    if (!searchDate) return alert('Veuillez sélectionner une date');
    const data = getData();
    const filtered = data.filter(entry => entry.date === searchDate);
    if (filtered.length === 0) alert('Aucune donnée trouvée');
    currentPage = 1;
    loadData(filtered.length > 0 ? filtered : null);
}

function searchByMonth() {
    const searchMonth = document.getElementById('searchMonth').value;
    if (!searchMonth) return alert('Veuillez sélectionner un mois');
    const data = getData();
    const filtered = data.filter(entry => entry.date.startsWith(searchMonth));
    if (filtered.length === 0) alert('Aucune donnée trouvée');
    currentPage = 1;
    loadData(filtered.length > 0 ? filtered : null);
}

function searchByPeriod() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    if (!startDate || !endDate) return alert('Veuillez sélectionner les dates');
    const data = getData();
    const filtered = data.filter(entry => entry.date >= startDate && entry.date <= endDate);
    if (filtered.length === 0) alert('Aucune donnée trouvée');
    currentPage = 1;
    loadData(filtered.length > 0 ? filtered : null);
}

function resetSearch() {
    document.getElementById('searchDate').value = '';
    document.getElementById('searchMonth').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    currentPage = 1;
    loadData(null);
}

// Print Preview Logic
function openPrintPreview() {
    const modal = document.getElementById('printModal');
    const previewBody = document.getElementById('printPreviewBody');

    // Determine what data to print
    // If filtered, print filtered. If not, print ALL data (sorted).
    const dataToPrint = currentFilteredData || getData();

    if (dataToPrint.length === 0) return alert('Aucune donnée à imprimer');

    // Sort by date
    dataToPrint.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Generate Dynamic Title
    let title = 'Tableau des Données Journalières';
    const searchMonth = document.getElementById('searchMonth').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const searchDate = document.getElementById('searchDate').value;

    if (currentFilteredData) {
        if (searchMonth) {
            const [year, month] = searchMonth.split('-');
            title = `Tableau de remplissage du mois ${month}/${year}`;
        } else if (startDate && endDate) {
            title = `Tableau de remplissage de la période du ${formatDate(startDate)} au ${formatDate(endDate)}`;
        } else if (searchDate) {
            title = `Tableau de remplissage du ${formatDate(searchDate)}`;
        }
    }

    // Generate Table HTML
    let tableHTML = `
    <div class="print-header" style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #1a5f7a; margin-bottom: 5px;">${title}</h2>
        <p style="color: #666;">Barrage Beni Haroun</p>
    </div>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Cote (m)</th>
                <th>Surface (ha)</th>
                <th>Volume (Hm³)</th>
                <th>Gains (Hm³)</th>
                <th>Évaporation (Hm³)</th>
                <th>VDF (Hm³)</th>
                <th>DVR (Hm³)</th>
                <th>Fuites (Hm³)</th>
                <th>Transfert (Hm³)</th>
                <th>Affluent (Hm³)</th>
                <th>Défluent (Hm³)</th>
                <th>Pluie (mm)</th>
            </tr>
        </thead>
        <tbody>
`;

    // We need to generate rows manually here, similar to createTableRow but returning string
    // and we need to calculate values again.
    const fullDB = getData();

    dataToPrint.forEach(entry => {
        const surface = parseFloat(getSurface(entry.cote));
        const volume = parseFloat(getVolume(entry.cote));

        const currentDate = new Date(entry.date);
        const previousDate = new Date(currentDate);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateString = previousDate.toISOString().split('T')[0];
        const previousEntry = fullDB.find(e => e.date === previousDateString);

        let gains = 0;
        if (previousEntry) {
            const previousVolume = parseFloat(getVolume(previousEntry.cote));
            gains = volume - previousVolume;
        }

        const evaporation = ((surface * parseFloat(entry.lectureBac)) / 1000) * 0.78;
        const defluent = evaporation + parseFloat(entry.vdf) + parseFloat(entry.dvr) +
            parseFloat(entry.fuites) + parseFloat(entry.transfert);
        const affluent = gains + defluent;

        tableHTML += `
        <tr>
            <td>${formatDate(entry.date)}</td>
            <td>${parseFloat(entry.cote).toFixed(2)}</td>
            <td>${surface.toFixed(3)}</td>
            <td>${volume.toFixed(3)}</td>
            <td>${gains.toFixed(3)}</td>
            <td>${evaporation.toFixed(3)}</td>
            <td>${parseFloat(entry.vdf).toFixed(3)}</td>
            <td>${parseFloat(entry.dvr).toFixed(3)}</td>
            <td>${parseFloat(entry.fuites).toFixed(3)}</td>
            <td>${parseFloat(entry.transfert).toFixed(3)}</td>
            <td>${affluent.toFixed(3)}</td>
            <td>${defluent.toFixed(3)}</td>
            <td>${parseFloat(entry.pluie).toFixed(1)}</td>
        </tr>
    `;
    });

    tableHTML += `</tbody></table>`;

    previewBody.innerHTML = tableHTML;

    // Add summary rows to the preview table (without Lecture Bac and Taux columns)
    const previewTableBody = previewBody.querySelector('tbody');
    addSummaryRowsForPrint(dataToPrint, previewTableBody);

    modal.classList.add('active');
}

function closePrintPreview() {
    document.getElementById('printModal').classList.remove('active');
}

function confirmPrint() {
    window.print();
}

// Add summary rows (Total and Average) to print table
function addSummaryRowsForPrint(data, tbody) {
    if (data.length === 0) return;

    const fullDB = getData();
    const count = data.length;

    // Initialize sums
    const sums = {
        evaporation: 0, vdf: 0, dvr: 0, fuites: 0, transfert: 0,
        affluent: 0, defluent: 0, pluie: 0, gains: 0
    };

    // Calculate sums
    data.forEach(entry => {
        const surface = parseFloat(getSurface(entry.cote));
        const volume = parseFloat(getVolume(entry.cote));

        // Calculate Gains
        const currentDate = new Date(entry.date);
        const previousDate = new Date(currentDate);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateString = previousDate.toISOString().split('T')[0];
        const previousEntry = fullDB.find(e => e.date === previousDateString);

        let gains = 0;
        if (previousEntry) {
            const previousVolume = parseFloat(getVolume(previousEntry.cote));
            gains = volume - previousVolume;
        }

        const evaporation = ((surface * parseFloat(entry.lectureBac)) / 1000) * 0.78;
        const defluent = evaporation + parseFloat(entry.vdf) + parseFloat(entry.dvr) +
            parseFloat(entry.fuites) + parseFloat(entry.transfert);
        const affluent = gains + defluent;

        sums.gains += gains;
        sums.evaporation += evaporation;
        sums.vdf += parseFloat(entry.vdf);
        sums.dvr += parseFloat(entry.dvr);
        sums.fuites += parseFloat(entry.fuites);
        sums.transfert += parseFloat(entry.transfert);
        sums.affluent += affluent;
        sums.defluent += defluent;
        sums.pluie += parseFloat(entry.pluie);
    });

    // Calculate averages
    const avgs = {};
    for (let key in sums) {
        avgs[key] = sums[key] / count;
    }

    // Create summary rows
    const createRow = (label, values) => {
        return `
        <tr style="font-weight: bold; background-color: #f0f0f0;">
            <td colspan="4" class="text-right"><strong>${label}</strong></td>
            <td>${values.gains.toFixed(3)}</td>
            <td>${values.evaporation.toFixed(3)}</td>
            <td>${values.vdf.toFixed(3)}</td>
            <td>${values.dvr.toFixed(3)}</td>
            <td>${values.fuites.toFixed(3)}</td>
            <td>${values.transfert.toFixed(3)}</td>
            <td>${values.affluent.toFixed(3)}</td>
            <td>${values.defluent.toFixed(3)}</td>
            <td>${values.pluie.toFixed(1)}</td>
        </tr>
        `;
    };

    // Add rows to table
    tbody.insertAdjacentHTML('beforeend', createRow('TOTAL', sums));
    tbody.insertAdjacentHTML('beforeend', createRow('MOYENNE', avgs));
}

// Export functions
function exportToExcel() {
    const data = currentFilteredData || getData();
    if (data.length === 0) return alert('Aucune donnée à exporter');

    data.sort((a, b) => new Date(a.date) - new Date(b.date));

    const exportData = data.map((entry) => {
        const surface = parseFloat(getSurface(entry.cote));
        const volume = parseFloat(getVolume(entry.cote));

        const currentDate = new Date(entry.date);
        const previousDate = new Date(currentDate);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateString = previousDate.toISOString().split('T')[0];
        const fullDB = getData();
        const previousEntry = fullDB.find(e => e.date === previousDateString);

        let gains = 0;
        if (previousEntry) {
            const previousVolume = parseFloat(getVolume(previousEntry.cote));
            gains = volume - previousVolume;
        }

        const evaporation = ((surface * parseFloat(entry.lectureBac)) / 1000) * 0.78;
        const defluent = evaporation + parseFloat(entry.vdf) + parseFloat(entry.dvr) +
            parseFloat(entry.fuites) + parseFloat(entry.transfert);
        const affluent = gains + defluent;
        const taux = (volume * 100) / VOLUME_MAX_FOR_TAUX;

        return {
            'Date': formatDate(entry.date),
            'Cote (m)': parseFloat(entry.cote).toFixed(2),
            'Surface (ha)': surface.toFixed(3),
            'Volume (Hm³)': volume.toFixed(3),
            'Gains (Hm³)': gains.toFixed(3),
            'Évaporation (Hm³)': evaporation.toFixed(3),
            'VDF (Hm³)': parseFloat(entry.vdf).toFixed(3),
            'DVR (Hm³)': parseFloat(entry.dvr).toFixed(3),
            'Fuites (Hm³)': parseFloat(entry.fuites).toFixed(3),
            'Transfert (Hm³)': parseFloat(entry.transfert).toFixed(3),
            'Affluent (Hm³)': affluent.toFixed(3),
            'Défluent (Hm³)': defluent.toFixed(3),
            'Pluie (mm)': parseFloat(entry.pluie).toFixed(1),
            'Lecture Bac (mm)': parseFloat(entry.lectureBac).toFixed(1),
            'Taux (%)': taux.toFixed(2)
        };
    });

    const headers = Object.keys(exportData[0]);
    const csvContent = [headers.join(','), ...exportData.map(row => headers.map(header => row[header]).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `barrage_data_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert('Données exportées avec succès!');
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';

    // Calculate totals
    let sumEvap = 0, sumVDF = 0, sumDVR = 0, sumTransfert = 0, sumPluie = 0, sumAffluent = 0, sumDefluent = 0;
    sortedData.forEach(entry => {
        const surface = parseFloat(getSurface(entry.cote));
        const volume = parseFloat(getVolume(entry.cote));

        const currentDate = new Date(entry.date);
        const previousDate = new Date(currentDate);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateString = previousDate.toISOString().split('T')[0];
        const fullDB = getData();
        const previousEntry = fullDB.find(e => e.date === previousDateString);

        let gains = 0;
        if (previousEntry) {
            const previousVolume = parseFloat(getVolume(previousEntry.cote));
            gains = volume - previousVolume;
        }

        const evaporation = ((surface * parseFloat(entry.lectureBac)) / 1000) * 0.78;
        const defluent = evaporation + parseFloat(entry.vdf) + parseFloat(entry.dvr) +
            parseFloat(entry.fuites) + parseFloat(entry.transfert);
        const affluent = gains + defluent;

        sumEvap += evaporation;
        sumVDF += parseFloat(entry.vdf);
        sumDVR += parseFloat(entry.dvr);
        sumTransfert += parseFloat(entry.transfert);
        sumPluie += parseFloat(entry.pluie);
        sumAffluent += affluent;
        sumDefluent += defluent;
    });

    let title = 'RAPPORT - Barrage Beni Haroun';
    const searchMonth = document.getElementById('searchMonth').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (currentFilteredData) {
        if (searchMonth) title += ` - Mois ${searchMonth}`;
        else if (startDate && endDate) title += ` - Période du ${formatDate(startDate)} au ${formatDate(endDate)}`;
    }

    // Generate Report Text
    let reportText = "";
    const maxRows = 30;
    const rowsToShare = sortedData.slice(0, maxRows);

    rowsToShare.forEach((entry, index) => {
        const surface = parseFloat(getSurface(entry.cote));
        const volume = parseFloat(getVolume(entry.cote));

        const currentDate = new Date(entry.date);
        const previousDate = new Date(currentDate);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateString = previousDate.toISOString().split('T')[0];
        const fullDB = getData();
        const previousEntry = fullDB.find(e => e.date === previousDateString);

        let gains = 0;
        if (previousEntry) {
            const previousVolume = parseFloat(getVolume(previousEntry.cote));
            gains = volume - previousVolume;
        }

        const evaporation = ((surface * parseFloat(entry.lectureBac)) / 1000) * 0.78;
        const defluent = evaporation + parseFloat(entry.vdf) + parseFloat(entry.dvr) +
            parseFloat(entry.fuites) + parseFloat(entry.transfert);
        const affluent = gains + defluent;

        reportText += `━━━ Jour ${index + 1} - ${formatDate(entry.date)} ━━━\n`;
        reportText += `• Cote: ${parseFloat(entry.cote).toFixed(2)} m\n`;
        reportText += `• Surface: ${surface.toFixed(2)} ha\n`;
        reportText += `• Volume: ${volume.toFixed(2)} Hm³\n`;
        reportText += `• Évaporation: ${evaporation.toFixed(2)} Hm³\n`;
        reportText += `• VDF: ${parseFloat(entry.vdf).toFixed(2)} Hm³\n`;
        reportText += `• DVR: ${parseFloat(entry.dvr).toFixed(2)} Hm³\n`;
        reportText += `• Transfert: ${parseFloat(entry.transfert).toFixed(2)} Hm³\n`;
        reportText += `• Pluie: ${parseFloat(entry.pluie).toFixed(1)} mm\n`;
        reportText += `• Affluent: ${affluent.toFixed(2)} Hm³\n`;
        reportText += `• Défluent: ${defluent.toFixed(2)} Hm³\n`;
        reportText += `\n`;
    });

    if (sortedData.length > maxRows) {
        reportText += `... (+${sortedData.length - maxRows} jours non inclus dans ce rapport)\n`;
    }

    let body = `
╔═══════════════════════════════════╗
    ${title}
╚═══════════════════════════════════╝

📊 DONNÉES DÉTAILLÉES:
${reportText}`;

    // Only add totals section if more than 1 day
    if (sortedData.length > 1) {
        body += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 TOTAUX DE LA PÉRIODE (${sortedData.length} jours):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Évaporation: ${sumEvap.toFixed(3)} Hm³
• VDF: ${sumVDF.toFixed(3)} Hm³
• DVR: ${sumDVR.toFixed(3)} Hm³
• Transfert: ${sumTransfert.toFixed(3)} Hm³
• Pluie: ${sumPluie.toFixed(1)} mm
• Affluent: ${sumAffluent.toFixed(3)} Hm³
• Défluent: ${sumDefluent.toFixed(3)} Hm³
`;
    }

    body += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Généré le: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    body = body.trim();

    window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, '_blank');
}


// Helper to calculate metrics for a single entry
function calculateEntryMetrics(entry, fullDB) {
    const surface = parseFloat(getSurface(entry.cote));
    const volume = parseFloat(getVolume(entry.cote));

    // Calculate Gains
    const currentDate = new Date(entry.date);
    const previousDate = new Date(currentDate);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateString = previousDate.toISOString().split('T')[0];
    const previousEntry = fullDB.find(e => e.date === previousDateString);

    let gains = 0;
    if (previousEntry) {
        const previousVolume = parseFloat(getVolume(previousEntry.cote));
        gains = volume - previousVolume;
    }

    const evaporation = ((surface * parseFloat(entry.lectureBac)) / 1000) * 0.78;
    const defluent = evaporation + parseFloat(entry.vdf) + parseFloat(entry.dvr) +
        parseFloat(entry.fuites) + parseFloat(entry.transfert);
    const affluent = gains + defluent;

    return {
        date: entry.date,
        cote: parseFloat(entry.cote),
        surface: surface,
        volume: volume,
        evaporation: evaporation,
        vdf: parseFloat(entry.vdf),
        dvr: parseFloat(entry.dvr),
        transfert: parseFloat(entry.transfert),
        fuites: parseFloat(entry.fuites), // Needed for calculation but not display
        pluie: parseFloat(entry.pluie),
        affluent: affluent,
        defluent: defluent
    };
}

function shareWhatsApp() {
    const data = currentFilteredData || getData();
    if (data.length === 0) return alert('Aucune donnée à partager');

    // Sort by date
    const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    const fullDB = getData();

    // Calculate all metrics once
    const processedData = sortedData.map(entry => calculateEntryMetrics(entry, fullDB));

    let body = '';
    let title = 'RAPPORT - Barrage Beni Haroun';

    // Determine Report Type
    if (processedData.length === 1) {
        // === DAILY REPORT ===
        const d = processedData[0];
        title = `📊 RAPPORT JOURNALIER - ${formatDate(d.date)}`;

        body += `*${title}*\n`;
        body += `Barrage Beni Haroun\n\n`;

        body += `━━━━━━━━━━━━━━━━━━\n`;
        body += `📈 *DONNÉES PRINCIPALES:*\n`;
        body += `━━━━━━━━━━━━━━━━━━\n`;
        body += `🌊 Cote: *${d.cote.toFixed(2)} m*\n`;
        body += `📏 Surface: *${d.surface.toFixed(3)} ha*\n`;
        body += `💧 Volume: *${d.volume.toFixed(3)} Hm³*\n\n`;

        body += `━━━━━━━━━━━━━━━━━━\n`;
        body += `💨 *BILAN HYDRIQUE:*\n`;
        body += `━━━━━━━━━━━━━━━━━━\n`;
        body += `⬆️ Affluent: *${d.affluent.toFixed(3)} Hm³*\n`;
        body += `⬇️ Défluent: *${d.defluent.toFixed(3)} Hm³*\n`;
        body += `   • Évaporation: ${d.evaporation.toFixed(3)} Hm³\n`;
        body += `   • VDF: ${d.vdf.toFixed(3)} Hm³\n`;
        body += `   • DVR: ${d.dvr.toFixed(3)} Hm³\n`;
        body += `   • Transfert: ${d.transfert.toFixed(3)} Hm³\n`;
        body += `🌧️ Pluie: *${d.pluie.toFixed(1)} mm*\n`;

    } else {
        // === PERIOD/MONTHLY REPORT ===
        const searchMonth = document.getElementById('searchMonth').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        if (searchMonth) {
            const [year, month] = searchMonth.split('-');
            title = `📊 RAPPORT MENSUEL - ${month}/${year}`;
        }
        else if (startDate && endDate) title = `📊 RAPPORT PÉRIODE\nDu ${formatDate(startDate)} au ${formatDate(endDate)}`;
        else title = `📊 RAPPORT PÉRIODE (${processedData.length} jours)`;

        // Calculate Totals
        let totals = {
            evaporation: 0, vdf: 0, dvr: 0, transfert: 0,
            pluie: 0, affluent: 0, defluent: 0
        };

        processedData.forEach(d => {
            totals.evaporation += d.evaporation;
            totals.vdf += d.vdf;
            totals.dvr += d.dvr;
            totals.transfert += d.transfert;
            totals.pluie += d.pluie;
            totals.affluent += d.affluent;
            totals.defluent += d.defluent;
        });

        body += `*${title}*\n`;
        body += `Barrage Beni Haroun\n\n`;

        body += `━━━━━━━━━━━━━━━━━━\n`;
        body += `📈 *TOTAUX (${processedData.length} jours):*\n`;
        body += `━━━━━━━━━━━━━━━━━━\n`;
        body += `⬆️ Affluent Total: *${totals.affluent.toFixed(3)} Hm³*\n`;
        body += `⬇️ Défluent Total: *${totals.defluent.toFixed(3)} Hm³*\n`;
        body += `💨 Évaporation: ${totals.evaporation.toFixed(3)} Hm³\n`;
        body += `⚡ VDF: ${totals.vdf.toFixed(3)} Hm³\n`;
        body += `🔄 DVR: ${totals.dvr.toFixed(3)} Hm³\n`;
        body += `↔️ Transfert: ${totals.transfert.toFixed(3)} Hm³\n`;
        body += `🌧️ Pluie Totale: *${totals.pluie.toFixed(1)} mm*\n\n`;

        body += `━━━━━━━━━━━━━━━━━━\n`;
        body += `📋 *DÉTAILS JOURNALIERS:*\n`;
        body += `━━━━━━━━━━━━━━━━━━\n`;

        processedData.forEach(d => {
            body += `📅 *${formatDate(d.date)}*\n`;
            body += `🌊 ${d.cote.toFixed(2)} m | 📏 ${d.surface.toFixed(3)} ha\n`;
            body += `💧 ${d.volume.toFixed(3)} Hm³\n`;
            body += `⬆️ Aff: ${d.affluent.toFixed(3)} | ⬇️ Def: ${d.defluent.toFixed(3)}\n`;
            body += `💨 Evap: ${d.evaporation.toFixed(3)} | 🌧️ Pluie: ${d.pluie.toFixed(1)}\n`;
            body += `⚡ VDF: ${d.vdf.toFixed(3)} | 🔄 DVR: ${d.dvr.toFixed(3)} | ↔️ Trans: ${d.transfert.toFixed(3)}\n`;
            body += `──────────────────\n`;
        });
    }

    body += `\nGénéré le: ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, '_blank');
}

function shareEmail() {
    const data = currentFilteredData || getData();
    if (data.length === 0) return alert('Aucune donnée à partager');

    // Sort by date
    const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    const fullDB = getData();

    // Calculate all metrics once
    const processedData = sortedData.map(entry => calculateEntryMetrics(entry, fullDB));

    let body = '';
    let subject = 'RAPPORT - Barrage Beni Haroun';

    // Determine Report Type
    if (processedData.length === 1) {
        // === DAILY REPORT ===
        const d = processedData[0];
        subject = `RAPPORT JOURNALIER - ${formatDate(d.date)} - Barrage Beni Haroun`;

        body += `RAPPORT JOURNALIER - ${formatDate(d.date)}\n`;
        body += `Barrage Beni Haroun\n\n`;

        body += `--------------------------------\n`;
        body += `DONNÉES PRINCIPALES:\n`;
        body += `--------------------------------\n`;
        body += `Cote: ${d.cote.toFixed(2)} m\n`;
        body += `Surface: ${d.surface.toFixed(3)} ha\n`;
        body += `Volume: ${d.volume.toFixed(3)} Hm³\n\n`;

        body += `--------------------------------\n`;
        body += `BILAN HYDRIQUE:\n`;
        body += `--------------------------------\n`;
        body += `Affluent: ${d.affluent.toFixed(3)} Hm³\n`;
        body += `Défluent: ${d.defluent.toFixed(3)} Hm³\n`;
        body += `   - Évaporation: ${d.evaporation.toFixed(3)} Hm³\n`;
        body += `   - VDF: ${d.vdf.toFixed(3)} Hm³\n`;
        body += `   - DVR: ${d.dvr.toFixed(3)} Hm³\n`;
        body += `   - Transfert: ${d.transfert.toFixed(3)} Hm³\n`;
        body += `Pluie: ${d.pluie.toFixed(1)} mm\n`;

    } else {
        // === PERIOD/MONTHLY REPORT ===
        const searchMonth = document.getElementById('searchMonth').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        if (searchMonth) {
            const [year, month] = searchMonth.split('-');
            subject = `RAPPORT MENSUEL - ${month}/${year} - Barrage Beni Haroun`;
        }
        else if (startDate && endDate) subject = `RAPPORT PÉRIODE (${formatDate(startDate)} au ${formatDate(endDate)}) - Barrage Beni Haroun`;
        else subject = `RAPPORT PÉRIODE (${processedData.length} jours) - Barrage Beni Haroun`;

        // Calculate Totals
        let totals = {
            evaporation: 0, vdf: 0, dvr: 0, transfert: 0,
            pluie: 0, affluent: 0, defluent: 0
        };

        processedData.forEach(d => {
            totals.evaporation += d.evaporation;
            totals.vdf += d.vdf;
            totals.dvr += d.dvr;
            totals.transfert += d.transfert;
            totals.pluie += d.pluie;
            totals.affluent += d.affluent;
            totals.defluent += d.defluent;
        });

        body += `${subject}\n\n`;

        body += `--------------------------------\n`;
        body += `TOTAUX (${processedData.length} jours):\n`;
        body += `--------------------------------\n`;
        body += `Affluent Total: ${totals.affluent.toFixed(3)} Hm³\n`;
        body += `Défluent Total: ${totals.defluent.toFixed(3)} Hm³\n`;
        body += `Évaporation: ${totals.evaporation.toFixed(3)} Hm³\n`;
        body += `VDF: ${totals.vdf.toFixed(3)} Hm³\n`;
        body += `DVR: ${totals.dvr.toFixed(3)} Hm³\n`;
        body += `Transfert: ${totals.transfert.toFixed(3)} Hm³\n`;
        body += `Pluie Totale: ${totals.pluie.toFixed(1)} mm\n\n`;

        body += `--------------------------------\n`;
        body += `DÉTAILS JOURNALIERS:\n`;
        body += `--------------------------------\n`;

        processedData.forEach(d => {
            body += `Date: ${formatDate(d.date)}\n`;
            body += `Cote: ${d.cote.toFixed(2)} m | Surface: ${d.surface.toFixed(3)} ha | Volume: ${d.volume.toFixed(3)} Hm³\n`;
            body += `Aff: ${d.affluent.toFixed(3)} | Def: ${d.defluent.toFixed(3)}\n`;
            body += `Evap: ${d.evaporation.toFixed(3)} | Pluie: ${d.pluie.toFixed(1)}\n`;
            body += `VDF: ${d.vdf.toFixed(3)} | DVR: ${d.dvr.toFixed(3)} | Trans: ${d.transfert.toFixed(3)}\n`;
            body += `--------------------------------\n`;
        });
    }

    body += `\nGénéré le: ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
}

function shareSMS() {
    const data = currentFilteredData || getData();
    if (data.length === 0) return alert('Aucune donnée à partager');

    // Sort by date
    const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    const fullDB = getData();

    // Calculate all metrics once
    const processedData = sortedData.map(entry => calculateEntryMetrics(entry, fullDB));

    let body = '';
    let title = 'RAPPORT - Barrage Beni Haroun';

    // Determine Report Type
    if (processedData.length === 1) {
        // === DAILY REPORT ===
        const d = processedData[0];
        title = `RAPPORT JOURNALIER - ${formatDate(d.date)}`;

        body += `${title}\n`;
        body += `Barrage Beni Haroun\n\n`;

        body += `DONNÉES PRINCIPALES:\n`;
        body += `Cote: ${d.cote.toFixed(2)} m\n`;
        body += `Surface: ${d.surface.toFixed(3)} ha\n`;
        body += `Volume: ${d.volume.toFixed(3)} Hm³\n\n`;

        body += `BILAN HYDRIQUE:\n`;
        body += `Affluent: ${d.affluent.toFixed(3)} Hm³\n`;
        body += `Défluent: ${d.defluent.toFixed(3)} Hm³\n`;
        body += `   - Évaporation: ${d.evaporation.toFixed(3)} Hm³\n`;
        body += `   - VDF: ${d.vdf.toFixed(3)} Hm³\n`;
        body += `   - DVR: ${d.dvr.toFixed(3)} Hm³\n`;
        body += `   - Transfert: ${d.transfert.toFixed(3)} Hm³\n`;
        body += `Pluie: ${d.pluie.toFixed(1)} mm\n`;

    } else {
        // === PERIOD/MONTHLY REPORT ===
        const searchMonth = document.getElementById('searchMonth').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        if (searchMonth) {
            const [year, month] = searchMonth.split('-');
            title = `RAPPORT MENSUEL - ${month}/${year}`;
        }
        else if (startDate && endDate) title = `RAPPORT PÉRIODE (${formatDate(startDate)} au ${formatDate(endDate)})`;
        else title = `RAPPORT PÉRIODE (${processedData.length} jours)`;

        // Calculate Totals
        let totals = {
            evaporation: 0, vdf: 0, dvr: 0, transfert: 0,
            pluie: 0, affluent: 0, defluent: 0
        };

        processedData.forEach(d => {
            totals.evaporation += d.evaporation;
            totals.vdf += d.vdf;
            totals.dvr += d.dvr;
            totals.transfert += d.transfert;
            totals.pluie += d.pluie;
            totals.affluent += d.affluent;
            totals.defluent += d.defluent;
        });

        body += `${title}\n`;
        body += `Barrage Beni Haroun\n\n`;

        body += `TOTAUX (${processedData.length} jours):\n`;
        body += `Affluent: ${totals.affluent.toFixed(3)} Hm³\n`;
        body += `Défluent: ${totals.defluent.toFixed(3)} Hm³\n`;
        body += `Évaporation: ${totals.evaporation.toFixed(3)} Hm³\n`;
        body += `VDF: ${totals.vdf.toFixed(3)} Hm³\n`;
        body += `DVR: ${totals.dvr.toFixed(3)} Hm³\n`;
        body += `Transfert: ${totals.transfert.toFixed(3)} Hm³\n`;
        body += `Pluie: ${totals.pluie.toFixed(1)} mm\n\n`;

        body += `DÉTAILS:\n`;

        processedData.forEach(d => {
            body += `${formatDate(d.date)}: Cote ${d.cote.toFixed(2)} | Vol ${d.volume.toFixed(3)}\n`;
        });
    }

    body += `\nGénéré le: ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    // Open SMS app
    window.location.href = `sms:?body=${encodeURIComponent(body)}`;
}

// Copy Report to Clipboard
function copyReport() {
    const data = currentFilteredData || getData();
    if (data.length === 0) return alert('Aucune donnée à copier');

    // Sort by date
    const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    const fullDB = getData();

    // Calculate all metrics once
    const processedData = sortedData.map(entry => calculateEntryMetrics(entry, fullDB));

    let body = '';
    let title = 'RAPPORT - Barrage Beni Haroun';

    // Determine Report Type
    if (processedData.length === 1) {
        // === DAILY REPORT ===
        const d = processedData[0];
        title = `RAPPORT JOURNALIER - ${formatDate(d.date)}`;

        body += `${title}\n`;
        body += `Barrage Beni Haroun\n\n`;

        body += `--------------------------------\n`;
        body += `DONNÉES PRINCIPALES:\n`;
        body += `--------------------------------\n`;
        body += `Cote: ${d.cote.toFixed(2)} m\n`;
        body += `Surface: ${d.surface.toFixed(3)} ha\n`;
        body += `Volume: ${d.volume.toFixed(3)} Hm³\n\n`;

        body += `--------------------------------\n`;
        body += `BILAN HYDRIQUE:\n`;
        body += `--------------------------------\n`;
        body += `Affluent: ${d.affluent.toFixed(3)} Hm³\n`;
        body += `Défluent: ${d.defluent.toFixed(3)} Hm³\n`;
        body += `   - Évaporation: ${d.evaporation.toFixed(3)} Hm³\n`;
        body += `   - VDF: ${d.vdf.toFixed(3)} Hm³\n`;
        body += `   - DVR: ${d.dvr.toFixed(3)} Hm³\n`;
        body += `   - Transfert: ${d.transfert.toFixed(3)} Hm³\n`;
        body += `Pluie: ${d.pluie.toFixed(1)} mm\n`;

    } else {
        // === PERIOD/MONTHLY REPORT ===
        const searchMonth = document.getElementById('searchMonth').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        if (searchMonth) {
            const [year, month] = searchMonth.split('-');
            title = `RAPPORT MENSUEL - ${month}/${year}`;
        }
        else if (startDate && endDate) title = `RAPPORT PÉRIODE\nDu ${formatDate(startDate)} au ${formatDate(endDate)}`;
        else title = `RAPPORT PÉRIODE (${processedData.length} jours)`;

        // Calculate Totals
        let totals = {
            evaporation: 0, vdf: 0, dvr: 0, transfert: 0,
            pluie: 0, affluent: 0, defluent: 0
        };

        processedData.forEach(d => {
            totals.evaporation += d.evaporation;
            totals.vdf += d.vdf;
            totals.dvr += d.dvr;
            totals.transfert += d.transfert;
            totals.pluie += d.pluie;
            totals.affluent += d.affluent;
            totals.defluent += d.defluent;
        });

        body += `${title}\n`;
        body += `Barrage Beni Haroun\n\n`;

        body += `--------------------------------\n`;
        body += `TOTAUX (${processedData.length} jours):\n`;
        body += `--------------------------------\n`;
        body += `Affluent Total: ${totals.affluent.toFixed(3)} Hm³\n`;
        body += `Défluent Total: ${totals.defluent.toFixed(3)} Hm³\n`;
        body += `Évaporation: ${totals.evaporation.toFixed(3)} Hm³\n`;
        body += `VDF: ${totals.vdf.toFixed(3)} Hm³\n`;
        body += `DVR: ${totals.dvr.toFixed(3)} Hm³\n`;
        body += `Transfert: ${totals.transfert.toFixed(3)} Hm³\n`;
        body += `Pluie Totale: ${totals.pluie.toFixed(1)} mm\n\n`;

        body += `--------------------------------\n`;
        body += `DÉTAILS JOURNALIERS:\n`;
        body += `--------------------------------\n`;

        processedData.forEach(d => {
            body += `Date: ${formatDate(d.date)}\n`;
            body += `Cote: ${d.cote.toFixed(2)} m | Surface: ${d.surface.toFixed(3)} ha | Volume: ${d.volume.toFixed(3)} Hm³\n`;
            body += `Aff: ${d.affluent.toFixed(3)} | Def: ${d.defluent.toFixed(3)}\n`;
            body += `Evap: ${d.evaporation.toFixed(3)} | Pluie: ${d.pluie.toFixed(1)}\n`;
            body += `VDF: ${d.vdf.toFixed(3)} | DVR: ${d.dvr.toFixed(3)} | Trans: ${d.transfert.toFixed(3)}\n`;
            body += `--------------------------------\n`;
        });
    }

    body += `\nGénéré le: ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    navigator.clipboard.writeText(body).then(() => {
        alert('Rapport copié dans le presse-papiers !');
    }).catch(err => {
        console.error('Erreur lors de la copie :', err);
        alert('Erreur lors de la copie du rapport.');
    });
}

function openArchive() {
    window.electronAPI.navigate('archive.html');
}

// Form Submission Handler
// Toast Notification
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return alert(message); // Fallback

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'info') icon = 'ℹ️';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}

// Form Submission Handler
document.getElementById('dataEntryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const entry = Object.fromEntries(formData.entries());

    // Ensure numeric values
    for (let key in entry) {
        if (key !== 'date') {
            entry[key] = entry[key] || '0';
        }
    }

    let data = getData();
    const index = data.findIndex(d => d.date === entry.date);
    let message = '';

    if (index >= 0) {
        // Update existing entry
        data[index] = { ...data[index], ...entry };
        message = 'Données mises à jour avec succès!';
    } else {
        // Add new entry
        data.push(entry);
        message = 'Données ajoutées avec succès!';
    }

    // 1. Stringify once
    const json = JSON.stringify(data);

    // 2. Update LocalStorage immediately
    localStorage.setItem(DATA_KEY, json);

    // 3. Refresh Table immediately
    loadData(currentFilteredData);

    // 4. Reset form and button text immediately
    e.target.reset();
    const submitBtn = document.querySelector('#dataEntryForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = '💾 Enregistrer';
    }

    // 5. Restore focus to Date field (prevents "freeze" feeling)
    const dateInput = document.getElementById('date');
    if (dateInput) dateInput.focus();

    // 6. Show success toast (non-blocking)
    showToast(message, 'success');

    // 7. Save to file in background (don't await, reuse json string)
    window.electronAPI.saveData('barrage-home-data.json', json)
        .catch(e => {
            console.error('Background save failed:', e);
            showToast('Erreur lors de la sauvegarde fichier', 'error');
        });
});
