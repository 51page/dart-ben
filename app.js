document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const companySelect = document.getElementById('company-select');
    const chartSection = document.getElementById('chart-section');
    const tableSection = document.getElementById('table-section');
    const btnChartView = document.getElementById('btn-chart-view');
    const btnTableView = document.getElementById('btn-table-view');
    
    // State
    // Adding a timestamp as a cache buster to ensure the latest data is fetched
    const CSV_BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRUpubog4ZtVHeIA3Z8W7XJhlaG5izk4tsszrvX15vynQ2Z9SaQ0uq63UjF0Ox36Iok_4kmJGB9txPB/pub?output=csv';
    let financialData = {}; 
    let companyDisplayOrder = [];
    let chartInstance = null;
    
    // Initialization
    async function init() {
        try {
            const cacheBuster = `&t=${new Date().getTime()}`;
            const result = await fetchAndParseData(CSV_BASE_URL + cacheBuster);
            financialData = result.data;
            // Spread to create a new array then reverse
            companyDisplayOrder = [...result.companyOrder].reverse(); 
            
            console.log('Order:', companyDisplayOrder);

            // Calculate YoY%
            Object.keys(financialData).forEach(comp => {
                const years = financialData[comp];
                if (years['2025'] && years['2024']) {
                    const v25r = years['2025'].rev;
                    const v24r = years['2024'].rev;
                    if (v24r !== 0) years['2025'].rev_yoy = (v25r - v24r) / Math.abs(v24r);
                    
                    const v25p = years['2025'].prof;
                    const v24p = years['2024'].prof;
                    if (v24p !== 0) years['2025'].prof_yoy = (v25p - v24p) / Math.abs(v24p);
                }
            });

            if (Object.keys(financialData).length === 0) {
                showToast('데이터를 불러오는 중 오류가 발생했거나 데이터가 비어있습니다.', true);
                return;
            }
            
            if (companyDisplayOrder.length > 0) {
                populateCompanySelect();
                // Force select the first company (most recent)
                companySelect.value = companyDisplayOrder[0];
                updateDashboard();
            } else {
                showToast('데이터를 불러오는 데 실패했습니다 (비어있음).', true);
            }
        } catch (error) {
            console.error(error);
            showToast('데이터 로드 실패: ' + error.message, true);
        }
    }

    init();

    // Event Listeners
    companySelect.addEventListener('change', () => {
        updateDashboard();
    });

    btnChartView.addEventListener('click', () => {
        btnChartView.classList.add('active');
        btnTableView.classList.remove('active');
        chartSection.style.display = 'block';
        tableSection.style.display = 'none';
        if (chartInstance) chartInstance.resize();
    });

    btnTableView.addEventListener('click', () => {
        btnTableView.classList.add('active');
        btnChartView.classList.remove('active');
        chartSection.style.display = 'none';
        tableSection.style.display = 'block';
        renderTable();
    });
    
    async function fetchAndParseData(url) {
        const response = await fetch(url);
        const text = await response.text();
        const rows = text.split(/\r?\n/).map(row => row.split(','));
        
        const data = {};
        const companyOrder = []; // To preserve original spreadsheet order
        let lastCompany = null;
        
        // Skip header row[0]
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i];
            if (cells.length < 4) continue;
            
            let company = cells[0]?.trim();
            const year = cells[1]?.trim();
            const revStr = cells[2]?.trim();
            const profStr = cells[3]?.trim();
            
            if (!company && !year) continue; 
            
            if (company) {
                lastCompany = company;
                if (!companyOrder.includes(company)) {
                    companyOrder.push(company);
                }
            } else {
                company = lastCompany;
            }
            
            if (!company || !year) continue;
            
            const rev = parseKoreanCurrency(revStr);
            const prof = parseKoreanCurrency(profStr);
            
            if (!data[company]) data[company] = {};
            data[company][year] = { rev, prof };
        }
        
        // Return both data and the original order
        return { data, companyOrder };
    }

    function parseKoreanCurrency(str) {
        if (!str) return 0;
        let s = str.replace(/,/g, '');
        let val = 0;
        
        const joMatch = s.match(/(-?\d+(?:\.\d+)?)조/);
        if (joMatch) val += parseFloat(joMatch[1]) * 1000000000000;
        
        const ukMatch = s.match(/(-?\d+(?:\.\d+)?)억/);
        if (ukMatch) val += parseFloat(ukMatch[1]) * 100000000;
        
        const manMatch = s.match(/(-?\d+(?:\.\d+)?)만/);
        if (manMatch) val += parseFloat(manMatch[1]) * 10000;
        
        // If it's a simple number without units
        if (!joMatch && !ukMatch && !manMatch) {
            val = parseFloat(s) || 0;
        }

        if (s.includes('손실')) {
            val = -Math.abs(val);
        }
        
        return val;
    }

    function formatKoreanCurrency(amount) {
        if (amount === 0) return '0원';
        const isNegative = amount < 0;
        let absVal = Math.abs(amount);
        
        const jo = Math.floor(absVal / 1000000000000);
        const uk = Math.floor((absVal % 1000000000000) / 100000000);
        const man = Math.floor((absVal % 100000000) / 10000);
        
        let result = '';
        if (jo > 0) result += jo + '조 ';
        if (uk > 0) result += uk + '억 ';
        if (jo === 0 && uk === 0 && man > 0) result += man + '만 ';
        
        result = result.trim();
        if (result === '') {
            result = new Intl.NumberFormat('ko-KR').format(absVal);
        }
        
        return (isNegative ? '-' : '') + result + (result.endsWith('억') || result.endsWith('조') || result.endsWith('만') ? '' : '원');
    }

    function populateCompanySelect() {
        companySelect.innerHTML = '';
        // No .sort() to keep the spreadsheet order (most recent first)
        companyDisplayOrder.forEach(company => {
            const option = document.createElement('option');
            option.value = company;
            option.textContent = company;
            companySelect.appendChild(option);
        });
    }
    
    function updateDashboard() {
        const company = companySelect.value;
        if (!company || !financialData[company]) return;
        const data = financialData[company];
        let years = Object.keys(data).filter(y => y >= '2021' && y <= '2025').sort();
        if (years.length === 0) years = ['2021', '2022', '2023', '2024', '2025'];
        
        const revenues = years.map(y => data[y] ? data[y].rev : 0);
        const profits = years.map(y => data[y] ? data[y].prof : 0);
        
        updateSummary(years, data);
        updateChart(years, revenues, profits);
    }
    
    function updateChart(labels, revenues, profits) {
        const ctx = document.getElementById('financialChart').getContext('2d');
        
        // Excel-like colors: Green for Revenue, Grey/Dark for Profit
        const revColor = '#217346'; // Excel Green
        const profColor = '#444444'; // Dark Grey
        
        if (chartInstance) chartInstance.destroy();
        Chart.defaults.color = '#666666';
        Chart.defaults.font.family = "'Segoe UI', Tahoma, sans-serif";
        if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
        
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: '영업이익',
                        data: profits,
                        borderColor: profColor,
                        backgroundColor: profColor,
                        borderWidth: 2,
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: profColor,
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        tension: 0, // Straight lines for professional look
                        yAxisID: 'y'
                    },
                    {
                        type: 'bar',
                        label: '매출액',
                        data: revenues,
                        backgroundColor: revColor,
                        borderColor: 'transparent',
                        borderRadius: 0, // Square bars for Excel look
                        barPercentage: 0.6,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { top: 30 } },
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        color: '#444',
                        font: { size: 10, weight: 600 },
                        formatter: (val) => val ? formatKoreanCurrency(val) : ''
                    },
                    legend: { 
                        position: 'top', 
                        align: 'end',
                        labels: { boxWidth: 12, padding: 20, font: { size: 12 } } 
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                scales: {
                    x: { 
                        grid: { display: false }, 
                        border: { color: '#ccc' },
                        ticks: { font: { size: 12 } } 
                    },
                    y: { 
                        beginAtZero: true, 
                        border: { display: false },
                        grid: { color: '#f0f0f0' }, 
                        ticks: { 
                            callback: (val) => formatKoreanCurrency(val), 
                            font: { size: 11 } 
                        } 
                    }
                }
            }
        });
    }
    
    function updateSummary(years, data) {
        let latestYear = years[years.length - 1] || '2025';
        const latestData = data[latestYear] || { rev: 0, prof: 0 };
        const revVal = latestData.rev;
        const profVal = latestData.prof;
        const margin = revVal > 0 ? ((profVal / revVal) * 100).toFixed(1) : 0;
        
        document.getElementById('label-revenue').textContent = `${latestYear}년 매출`;
        document.getElementById('label-profit').textContent = `${latestYear}년 영업이익`;
        document.getElementById('summary-revenue').textContent = formatKoreanCurrency(revVal);
        document.getElementById('summary-profit').textContent = formatKoreanCurrency(profVal);
        document.getElementById('summary-margin').textContent = margin + '%';
        
        function updateYoyEl(elId, val) {
            const el = document.getElementById(elId);
            if (val === null || val === undefined || isNaN(val)) {
                el.style.display = 'none';
                return;
            }
            el.style.display = 'inline-block';
            const percent = (val * 100).toFixed(1);
            if (val > 0) {
                el.textContent = `▲ ${percent}% YoY`;
                el.className = 'summary-yoy yoy-pos';
            } else if (val < 0) {
                el.textContent = `▼ ${Math.abs(percent)}% YoY`;
                el.className = 'summary-yoy yoy-neg';
            } else {
                el.textContent = `-`;
                el.className = 'summary-yoy';
            }
        }
        
        updateYoyEl('yoy-revenue', latestData.rev_yoy);
        updateYoyEl('yoy-profit', latestData.prof_yoy);
        
        const profEl = document.getElementById('summary-profit');
        profEl.style.color = profVal < 0 ? '#ef4444' : 'var(--text-color)';
    }
    
    function renderTable() {
        const tableObj = document.getElementById('financial-table');
        const thead = tableObj.querySelector('thead');
        const tbody = tableObj.querySelector('tbody');
        const companies = companyDisplayOrder;
        
        // Excel column headers (A, B, C, D)
        let headerHtml = `
            <tr>
                <th class="excel-col-label"></th>
                <th class="excel-col-label">A</th>
                <th class="excel-col-label">B</th>
                <th class="excel-col-label">C</th>
                <th class="excel-col-label">D</th>
            </tr>
            <tr>
                <th class="excel-col-label">1</th>
                <th class="sticky-col">기업명</th>
                <th style="width: 100px; text-align: center;">연도</th>
                <th style="text-align: right;">매출액</th>
                <th style="text-align: right;">영업이익</th>
            </tr>
        `;
        thead.innerHTML = headerHtml;
        
        let trsBody = '';
        let rowCounter = 2; // Starting from row 2 in Excel labels
        
        companies.forEach((company) => {
            const rowData = financialData[company];
            // Sort years in descending order (2025, 2024...)
            const years = Object.keys(rowData).filter(y => y >= '2021' && y <= '2025').sort().reverse();
            
            years.forEach((year, yIdx) => {
                const isFirstYear = yIdx === 0;
                const pClass = rowData[year].prof < 0 ? 'profit-neg' : '';
                const rowClass = isFirstYear ? 'company-start-row' : '';
                
                trsBody += `
                    <tr class="${rowClass}">
                        <td class="excel-col-label">${rowCounter++}</td>
                        <td class="sticky-col">${isFirstYear ? `<strong>${company}</strong>` : ''}</td>
                        <td style="text-align: center; color: #666;">${year}년</td>
                        <td style="text-align: right; font-variant-numeric: tabular-nums;">${formatKoreanCurrency(rowData[year].rev)}</td>
                        <td style="text-align: right; font-variant-numeric: tabular-nums;" class="${pClass}">${formatKoreanCurrency(rowData[year].prof)}</td>
                    </tr>
                `;
            });
        });
        tbody.innerHTML = trsBody;
    }

    function showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = isError ? 'toast show error' : 'toast show';
        setTimeout(() => toast.classList.remove('show'), 4000);
    }
});
