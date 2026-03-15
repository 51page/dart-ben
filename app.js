document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const companySelect = document.getElementById('company-select');
    const chartSection = document.getElementById('chart-section');
    const tableSection = document.getElementById('table-section');
    const btnChartView = document.getElementById('btn-chart-view');
    const btnTableView = document.getElementById('btn-table-view');
    
    // State
    const financialData = window.FINANCIAL_DATA || {}; 
    let chartInstance = null;
    
    // Initialization
    if (Object.keys(financialData).length === 0) {
        showToast('데이터가 없습니다. 하드코딩된 파일(data.js)을 확인해주세요.', true);
        return;
    }
    
    populateCompanySelect();
    
    // Set initial dashboard
    setTimeout(() => {
        updateDashboard();
        showToast('데이터를 성공적으로 불러왔습니다.');
    }, 100);

    // Event Listeners
    companySelect.addEventListener('change', () => {
        updateDashboard();
    });

    btnChartView.addEventListener('click', () => {
        btnChartView.classList.add('active');
        btnTableView.classList.remove('active');
        chartSection.style.display = 'flex';
        tableSection.style.display = 'none';
        
        // Hide company select when in table view? No, keep it visible, but it only affects chart.
        // Actually, let's keep it visible so they know what it is. Or maybe hide it?
        // Wait, companySelect disables itself or hides its container? Let's just switch sections.
    });

    btnTableView.addEventListener('click', () => {
        btnTableView.classList.add('active');
        btnChartView.classList.remove('active');
        chartSection.style.display = 'none';
        tableSection.style.display = 'block';
        
        renderTable();
    });
    
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
        const companies = Object.keys(financialData).sort();
        
        companies.forEach(company => {
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
        
        // Collect all available years for this company and sort them
        let years = Object.keys(data).filter(y => y >= '2021' && y <= '2025').sort();
        if (years.length === 0) {
            // Fallback to exactly 2021-2025 if missing entirely
            years = ['2021', '2022', '2023', '2024', '2025'];
        }
        
        const revenues = years.map(y => data[y] ? data[y].rev : 0);
        const profits = years.map(y => data[y] ? data[y].prof : 0);
        
        updateSummary(years, data);
        updateChart(years, revenues, profits);
    }
    
    function updateChart(labels, revenues, profits) {
        const ctx = document.getElementById('financialChart').getContext('2d');
        
        // Dynamic Gradient for Revenue Bars
        const revGradient = ctx.createLinearGradient(0, 0, 0, 500);
        revGradient.addColorStop(0, 'rgba(59, 130, 246, 0.9)');
        revGradient.addColorStop(1, 'rgba(59, 130, 246, 0.1)');

        const highlightRevGradient = ctx.createLinearGradient(0, 0, 0, 500);
        highlightRevGradient.addColorStop(0, 'rgba(236, 72, 153, 0.9)'); // Pinkish highlight for 2025
        highlightRevGradient.addColorStop(1, 'rgba(236, 72, 153, 0.1)');
        
        const revColors = labels.map(l => l === '2025' ? highlightRevGradient : revGradient);
        const profColors = labels.map(l => l === '2025' ? '#ec4899' : '#10b981');
        
        if (chartInstance) {
            chartInstance.destroy();
        }
        
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Inter', sans-serif";
        
        // Register DataLabels
        if (typeof ChartDataLabels !== 'undefined') {
            Chart.register(ChartDataLabels);
        }
        
        chartInstance = new Chart(ctx, {
            type: 'bar', // Mixed chart
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: '영업이익',
                        data: profits,
                        borderColor: '#10b981', // line color stays consistent
                        backgroundColor: profColors,
                        borderWidth: 3,
                        pointBackgroundColor: '#0f172a',
                        pointBorderColor: profColors,
                        pointBorderWidth: 3,
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        tension: 0.4, // smooth curve
                        yAxisID: 'y'
                    },
                    {
                        type: 'bar',
                        label: '매출액',
                        data: revenues,
                        backgroundColor: revColors,
                        borderColor: 'transparent',
                        borderRadius: 8,
                        barPercentage: 0.5,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                layout: {
                    padding: { top: 30 }
                },
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        color: function(context) {
                             if (context.dataset.type === 'line') return '#10b981'; // Green for profit
                             return '#94a3b8'; // grey for rev
                        },
                        font: { size: 11, weight: 600 },
                        formatter: function(value) {
                            if (value === 0 || value === null) return '';
                            // To prevent overlap, we might format compactly
                            const formatted = formatKoreanCurrency(value);
                            // Strip "원" at the end to save space if desired, or keep it
                            return formatted;
                        }
                    },
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: { size: 14, weight: 600 }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 14, weight: 600 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    const actualValue = context.parsed.y;
                                    label += formatKoreanCurrency(actualValue);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'transparent',
                            drawBorder: false
                        },
                        ticks: {
                            font: { size: 13 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            callback: function(value) {
                                return formatKoreanCurrency(value);
                            },
                            font: { size: 12 }
                        }
                    }
                }
            }
        });
    }
    
    function updateSummary(years, data) {
        // Find latest valid year
        let latestYear = years[years.length - 1];
        if (!latestYear) latestYear = '2025';

        const latestData = data[latestYear] || { rev: 0, prof: 0 };
        
        const revVal = latestData.rev;
        const profVal = latestData.prof;
        const margin = revVal > 0 ? ((profVal / revVal) * 100).toFixed(1) : 0;
        
        document.getElementById('label-revenue').textContent = `${latestYear}년 매출`;
        document.getElementById('label-profit').textContent = `${latestYear}년 영업이익`;

        document.getElementById('summary-revenue').textContent = formatKoreanCurrency(latestData.rev);
        document.getElementById('summary-profit').textContent = formatKoreanCurrency(latestData.prof);
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
        
        // Dynamic coloring for profit amount (loss = red)
        const profEl = document.getElementById('summary-profit');
        if (profVal < 0) {
            profEl.style.color = '#ef4444'; // Red
        } else {
            profEl.style.color = 'var(--text-color)'; // Standard
        }
    }
    
    function showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        if (isError) {
            toast.classList.add('error');
        } else {
            toast.classList.remove('error');
        }
        
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    function renderTable() {
        const tableObj = document.getElementById('financial-table');
        const thead = tableObj.querySelector('thead');
        const tbody = tableObj.querySelector('tbody');
        
        const companies = Object.keys(financialData).sort();
        // Determine all available years across all companies
        const allYearsSet = new Set();
        companies.forEach(company => {
            Object.keys(financialData[company]).forEach(y => allYearsSet.add(y));
        });
        
        let years = Array.from(allYearsSet).sort().reverse();
        if (years.length === 0) years = ['2025', '2024', '2023', '2022', '2021'];
        
        // Generate Header
        let trHead1 = '<tr><th rowspan="2">기업명</th>';
        let trHead2 = '<tr>';
        years.forEach(y => {
            trHead1 += `<th colspan="2" style="text-align: center; border-bottom: 1px solid var(--glass-border);">${y}년</th>`;
            trHead2 += `<th>매출</th><th>영업이익</th>`;
        });
        trHead1 += '</tr>';
        trHead2 += '</tr>';
        thead.innerHTML = trHead1 + trHead2;
        
        // Generate Body
        let trsBody = '';
        companies.forEach(company => {
            const rowData = financialData[company];
            let rowHtml = `<tr><td>${company}</td>`;
            
            years.forEach(y => {
                if (rowData[y]) {
                    const profClass = rowData[y].prof < 0 ? 'profit-neg' : '';
                    rowHtml += `<td>${formatKoreanCurrency(rowData[y].rev)}</td>`;
                    rowHtml += `<td class="${profClass}">${formatKoreanCurrency(rowData[y].prof)}</td>`;
                } else {
                    rowHtml += `<td>-</td><td>-</td>`;
                }
            });
            rowHtml += '</tr>';
            trsBody += rowHtml;
        });
        
        tbody.innerHTML = trsBody;
    }
});
