const xlsx = require('xlsx');
const fs = require('fs');

try {
    const workbook = xlsx.readFile('data.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    if (rows.length < 2) {
        console.error("Not enough data rows.");
        process.exit(1);
    }
    
    // Treat header row
    const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
    
    // Find company col
    let companyColIdx = headers.findIndex(h => h.includes('기업') || h.includes('회사') || h.includes('종목') || h === 'company' || h === 'name');
    if (companyColIdx === -1) companyColIdx = 0; // fallback to 1st column
    
    const parsedData = {};
    
    // Check if long form (Year column exists)
    const yearColIdx = headers.findIndex(h => h.includes('연도') || h.includes('년도') || h === 'year');
    const revColIdx = headers.findIndex(h => h.includes('매출') || h === 'revenue' || h === 'sales');
    const profColIdx = headers.findIndex(h => h.includes('영업이익') || h === 'profit' || h === 'operating profit');
    
    if (yearColIdx !== -1 && revColIdx !== -1 && profColIdx !== -1) {
        // Long form structure detected
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[companyColIdx]) continue;
            
            const company = String(row[companyColIdx]).trim();
            const yearMatch = String(row[yearColIdx] || '').match(/(20\d{2})/);
            if (!yearMatch) continue;
            const year = yearMatch[1];

            const rev = parseFloat(String(row[revColIdx] || 0).replace(/,/g, '')) || 0;
            const prof = parseFloat(String(row[profColIdx] || 0).replace(/,/g, '')) || 0;
            
            if (!parsedData[company]) parsedData[company] = {};
            parsedData[company][year] = { rev, prof };
        }
    } else {
        // Wide form fallback
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[companyColIdx]) continue;
            
            const company = String(row[companyColIdx]).trim();
            if (!company) continue;
            if (!parsedData[company]) parsedData[company] = {};
            
            for (let j = 0; j < headers.length; j++) {
                if (j === companyColIdx) continue;
                
                const header = headers[j];
                let val = String(row[j] || 0).replace(/,/g, '');
                val = parseFloat(val) || 0;
                
                // Extract year from column header (e.g. "2021 매출액")
                const yearMatch = header.match(/(20\d{2})/);
                if (!yearMatch) continue;
                const year = yearMatch[1];
                
                if (!parsedData[company][year]) parsedData[company][year] = { rev: 0, prof: 0 };
                
                if (header.includes('매출') || header.includes('sales') || header.includes('rev')) {
                    parsedData[company][year].rev = val;
                } else if (header.includes('이익') || header.includes('profit')) {
                    parsedData[company][year].prof = val;
                }
            }
        }
    }
    
    const outputContent = `window.FINANCIAL_DATA = ${JSON.stringify(parsedData, null, 2)};`;
    fs.writeFileSync('data.js', outputContent);
    console.log("Successfully wrote data.js");
} catch (err) {
    console.error("Error parsing file:", err);
    process.exit(1);
}
