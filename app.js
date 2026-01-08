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
    // Expecting DD/MM/YYYY
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
};

// Safe Getter
const getVal = (row, key) => {
    // Handle case where keys might have trailing spaces (common in spreadsheets)
    const exact = row[key];
    if (exact !== undefined) return exact;

    // Fuzzy match key if needed
    const foundKey = Object.keys(row).find(k => k.trim() === key.trim());
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

        // Initial render with all data
        const grouped = groupDataByDate(rawData);
        renderData(grouped);
        updateKPIs(rawData); // KPIs still calculate based on total raw data usually, or visible? Let's use raw for "Total" unless filtered.

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
}

function renderData(groupedData) {
    ELEMENTS.tableBody.innerHTML = '';

    if (groupedData.length === 0) {
        ELEMENTS.tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary)">Không có dữ liệu</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();

    groupedData.forEach(item => {
        const tr = document.createElement('tr');

        // Format campaigns list
        // If too many, maybe show "X Chiến dịch"? Or list all? 
        // Let's list unique ones to avoid clutter if duplicate names exist (rare per day but possible)
        const uniqueCampaigns = [...new Set(item.campaigns)];
        let campaignHtml = uniqueCampaigns.join('<br>');

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
            <td style="color: var(--text-secondary); font-size: 0.9em;">
                ${item.campaigns.length} chiến dịch
                <div style="font-size: 0.8em; opacity: 0.7; margin-top: 4px;">${campaignHtml}</div>
            </td>
        `;
        fragment.appendChild(tr);
    });

    ELEMENTS.tableBody.appendChild(fragment);
}

// Search Filter
ELEMENTS.searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();

    // Filter RAW data first finds matching rows (either date match or campaign match)
    const filteredRaw = rawData.filter(item => {
        return item.dateStr.toLowerCase().includes(term) ||
            item.campaign.toLowerCase().includes(term);
    });

    // Then group the filtered results
    const grouped = groupDataByDate(filteredRaw);

    renderData(grouped);
    updateKPIs(filteredRaw); // Update KPIs based on what user sees (filtered subset)
});

// Refresh
ELEMENTS.refreshBtn.addEventListener('click', fetchData);

// Init
fetchData();
