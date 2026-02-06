
const https = require('https');

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Mm-CytTHU59mqGk_oMuSMIGAG6eqYDt4/export?format=csv&gid=577884253';

// Proxies
const proxies = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(SHEET_URL)}`,
    `https://corsproxy.io/?${encodeURIComponent(SHEET_URL)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(SHEET_URL)}`
];

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Follow redirect
                fetchUrl(res.headers.location).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`Status: ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function run() {
    console.log('Fetching CSV...');
    let text = '';

    try {
        text = await fetchUrl(SHEET_URL);
        console.log('Fetched directly!');
    } catch (e) {
        console.log('Direct fetch failed:', e.message);
        console.log('Trying proxies...');
        for (const proxy of proxies) {
            try {
                text = await fetchUrl(proxy);
                console.log('Success with proxy!');
                break;
            } catch (err) {
                console.log(`Proxy failed:`, err.message);
            }
        }
    }

    if (!text) {
        console.error('Failed to fetch CSV');
        return;
    }

    const rows = text.split('\n').map(row => {
        // Simple CSV split, handling quotes loosely since we just want headers
        if (row.includes('"')) {
            return row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(',');
        }
        return row.split(',');
    });

    console.log('Total rows:', rows.length);

    // Find header
    let headerIdx = -1;
    for (let i = 0; i < 20; i++) {
        const rowStr = JSON.stringify(rows[i]).toLowerCase();
        if (rowStr.includes('fecha') && (rowStr.includes('competiciones') || rowStr.includes('localidad'))) {
            headerIdx = i;
            break;
        }
    }

    if (headerIdx !== -1) {
        console.log('Header found at row:', headerIdx);
        // Print clean headers
        const cleanHeader = rows[headerIdx].map(c => c.replace(/^"|"$/g, '').trim());
        console.log('Headers:', cleanHeader);
    } else {
        console.log('Header NOT found. Dump of first 10 rows:');
        rows.slice(0, 10).forEach((r, i) => console.log(i, r));
    }
}

run();
