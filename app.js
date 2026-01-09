const CONFIG = {
    API_URL: 'https://api.appsheet.com/api/v2/apps/cbefa96e-2b04-4aeb-82db-c46d22923d5b/tables/data_ads/Action',
    APP_ACCESS_KEY: 'V2-d4ex1-tT8s0-aK4S7-8wffG-cwUrk-48NOk-QRAEn-kwsyg',
    COLUMNS: {
        DATE: 'Bắt đầu báo cáo',
        SPEND: 'Số tiền đã chi tiêu (VND)',
        MESSAGES: 'Lượt bắt đầu cuộc trò chuyện qua tin nhắn',
        CAMPAIGN: 'Tên chiến dịch'
    }
};

const ELEMENTS = {
    totalSpend: document.getElementById('totalSpend'),
    totalMessages: document.getElementById('totalMessages'),
    avgPrice: document.getElementById('avgPrice'),
    monthFilter: document.getElementById('monthFilter'),
    tableBody: document.querySelector('#dataTable tbody'),
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorDetail: document.getElementById('errorDetail'),
    searchInput: document.getElementById('searchInput'),
    refreshBtn: document.getElementById('refreshBtn')
};

let rawData = []; // Store fetched data

// Utilities
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

const parseDate = (dateStr) => {
    if (!dateStr) return null;

    // Normalize separators
    const cleanStr = dateStr.trim().replace(/[-.]/g, '/');
    const parts = cleanStr.split('/');

    // Handle MM/DD/YYYY
    if (parts.length === 3) {
        const month = parseInt(parts[0], 10) - 1; // 0-indexed
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        // Basic validation
        if (year < 2000 || year > 2100) return null; // Ignore likely junk years
        if (month < 0 || month > 11) return null;
        if (day < 1 || day > 31) return null;

        return new Date(year, month, day);
    }

    // Fallback: try standard Date parse (ISO)
    const timestamp = Date.parse(cleanStr);
    if (!isNaN(timestamp)) {
        return new Date(timestamp);
    }

    return null;
};

// Safe Getter
const getVal = (row, key) => {
    // Handle case where keys might have trailing spaces (common in spreadsheets)
    if (row[key] !== undefined) return row[key];

    // Fuzzy match key
    const normalize = k => k.trim().toLowerCase();
    const target = normalize(key);

    const foundKey = Object.keys(row).find(k => normalize(k) === target);
    return foundKey ? row[foundKey] : null;
};

async function fetchData() {
    // Reset State
    ELEMENTS.loading.style.display = 'block';
    ELEMENTS.error.style.display = 'none';
    ELEMENTS.tableBody.innerHTML = '';

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: {
                'ApplicationAccessKey': CONFIG.APP_ACCESS_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "Action": "Find",
                "Properties": {
                    "Locale": "vi-VN",
                    "Timezone": "Asia/Ho_Chi_Minh",
                    "Selector": "Filter(data_ads, TRUE)"
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // AppSheet usually returns an array of rows or just []
        if (!Array.isArray(data)) {
            // Sometimes it comes nested, but usually top level array for "Find"
            console.warn("Unexpected data structure", data);
        }

        // Process Data
        rawData = (Array.isArray(data) ? data : []).map(row => {
            const dateStr = getVal(row, CONFIG.COLUMNS.DATE) || '';
            const spend = Number(getVal(row, CONFIG.COLUMNS.SPEND)) || 0;
            // Messages can be empty string if 0 or null
            let messages = getVal(row, CONFIG.COLUMNS.MESSAGES);
            messages = (messages === '' || messages === null) ? 0 : Number(messages);
            const campaign = getVal(row, CONFIG.COLUMNS.CAMPAIGN) || 'Không tên';

            return {
                originalRow: row,
                dateStr,
                dateObj: parseDate(dateStr),
                spend,
                messages,
                campaign
            };
        });

        // Sort by Date Descending
        rawData.sort((a, b) => {
            if (!a.dateObj) return 1;
            if (!b.dateObj) return -1;
            return b.dateObj - a.dateObj;
        });

        // Initial process
        populateMonthFilter(rawData);
        applyFilters();

    } catch (err) {
        console.error(err);
        ELEMENTS.error.style.display = 'block';
        ELEMENTS.errorDetail.textContent = err.message + ". (Check CORS if running locally)";
    } finally {
        ELEMENTS.loading.style.display = 'none';
    }
}

function groupDataByDate(data) {
    const groups = {};

    data.forEach(item => {
        const key = item.dateStr || 'Khác';
        if (!groups[key]) {
            groups[key] = {
                dateStr: key,
                dateObj: item.dateObj,
                spend: 0,
                messages: 0,
                campaigns: []
            };
        }
        groups[key].spend += item.spend;
        groups[key].messages += item.messages;
        if (item.campaign) {
            groups[key].campaigns.push(item.campaign);
        }
    });

    // Convert map to array and sort
    const result = Object.values(groups);
    result.sort((a, b) => {
        if (!a.dateObj) return 1;
        if (!b.dateObj) return -1;
        return b.dateObj - a.dateObj;
    });

    return result;
}

function updateKPIs(data) {
    // If data passed is grouped, we need to handle it, but usually KPIs are simple sums.
    // However, the previous "updateKPIs" took rawData array. 
    // If we pass grouped data, the keys are same (spend, messages).
    const totalSpend = data.reduce((sum, item) => sum + item.spend, 0);
    const totalMessages = data.reduce((sum, item) => sum + item.messages, 0);

    ELEMENTS.totalSpend.textContent = formatCurrency(totalSpend);
    ELEMENTS.totalMessages.textContent = totalMessages.toLocaleString('vi-VN');

    const avgPrice = totalMessages > 0 ? totalSpend / totalMessages : 0;
    ELEMENTS.avgPrice.textContent = formatCurrency(avgPrice);
}

function renderData(groupedData) {
    ELEMENTS.tableBody.innerHTML = '';

    if (groupedData.length === 0) {
        ELEMENTS.tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary)">Không có dữ liệu</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();

    groupedData.forEach((item, index) => {
        const tr = document.createElement('tr');

        // Format campaigns list
        const uniqueCampaigns = [...new Set(item.campaigns)];
        // Create HTML for the panel list
        const campaignListHtml = uniqueCampaigns.map(c => `<div class="camp-item">${c}</div>`).join('');
        const rowId = `row-${index}`;

        const pricePerMess = item.messages > 0 ? item.spend / item.messages : 0;

        tr.innerHTML = `
            <td style="white-space: nowrap;">${item.dateStr}</td>
            <td style="font-family: monospace; font-size: 1.1em;">${formatCurrency(item.spend)}</td>
            <td>
                <span style="
                    background: rgba(129, 140, 248, 0.1); 
                    color: #818cf8; 
                    padding: 2px 8px; 
                    border-radius: 99px; 
                    font-size: 0.9em; 
                    font-weight: 600;">
                    ${item.messages}
                </span>
            </td>
            <td style="font-family: monospace; font-size: 1.1em;">
                ${formatCurrency(pricePerMess)}
            </td>
            <td>
                <button class="camp-toggle" data-target="${rowId}">
                    ${uniqueCampaigns.length} chiến dịch <span class="chevron">▸</span>
                </button>
                <div id="${rowId}" class="camp-panel">
                    ${campaignListHtml}
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });

    ELEMENTS.tableBody.appendChild(fragment);
}

// Event Delegation for Campaign Toggles
ELEMENTS.tableBody.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.camp-toggle');
    if (!toggleBtn) return;

    const targetId = toggleBtn.dataset.target;
    const panel = document.getElementById(targetId);

    if (panel) {
        const isOpen = panel.classList.contains('open');

        // Toggle State
        panel.classList.toggle('open');
        toggleBtn.classList.toggle('active');

        // Update Chevron (Visual only, CSS handles rotation but let's be explicit if needed)
        // CSS handles rotation via .active class
    }
});

// Filter Implementation
function populateMonthFilter(data) {
    const months = new Set();
    data.forEach(item => {
        if (item.dateObj) {
            // Format: MM/YYYY
            const month = item.dateObj.getMonth() + 1; // 0-indexed
            const year = item.dateObj.getFullYear();
            const key = `${month}/${year}`;
            months.add(key);
        }
    });

    // Convert to array and sort descending (newest first)
    const sortedMonths = [...months].sort((a, b) => {
        const [m1, y1] = a.split('/').map(Number);
        const [m2, y2] = b.split('/').map(Number);
        if (y1 !== y2) return y2 - y1;
        return m2 - m1;
    });

    const selector = ELEMENTS.monthFilter;
    // Keep the "All" option
    selector.innerHTML = '<option value="all">Tất cả thời gian</option>';

    sortedMonths.forEach(m => {
        const option = document.createElement('option');
        option.value = m;
        option.textContent = `Tháng ${m}`;
        selector.appendChild(option);
    });

    // Default to the current month if available, otherwise latest
    const now = new Date();
    const currentKey = `${now.getMonth() + 1}/${now.getFullYear()}`;

    if (months.has(currentKey)) {
        selector.value = currentKey;
    } else if (sortedMonths.length > 0) {
        selector.value = sortedMonths[0];
    }
}

function applyFilters() {
    const term = ELEMENTS.searchInput.value.toLowerCase();
    const month = ELEMENTS.monthFilter.value;

    const filtered = rawData.filter(item => {
        // Text Search
        const matchesTerm = item.dateStr.toLowerCase().includes(term) ||
            item.campaign.toLowerCase().includes(term);

        // Month Filter
        let matchesMonth = true;
        if (month !== 'all') {
            if (!item.dateObj) matchesMonth = false;
            else {
                const m = item.dateObj.getMonth() + 1;
                const y = item.dateObj.getFullYear();
                const key = `${m}/${y}`;
                matchesMonth = (key === month);
            }
        }

        return matchesTerm && matchesMonth;
    });

    // Render
    const grouped = groupDataByDate(filtered);
    renderData(grouped);
    updateKPIs(filtered);
}

// Event Listeners
ELEMENTS.searchInput.addEventListener('input', applyFilters);
ELEMENTS.monthFilter.addEventListener('change', applyFilters);

// Refresh
ELEMENTS.refreshBtn.addEventListener('click', fetchData);

// Init
fetchData();
