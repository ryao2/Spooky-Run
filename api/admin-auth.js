export default async function handler(req, res) {
    // Enable CORS for browser requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { adminPassword, action, payload } = req.body || {};
    const BIN_ID = process.env.JSONBIN_BIN_ID;
    const ACCESS_KEY = process.env.JSONBIN_ACCESS_KEY;
    const SERVER_ADMIN_PASS = process.env.ADMIN_PASSWORD || 'bingbing';

    try {
        // Fetch current leaderboard state from JSONBin
        const fetchRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: { 'X-Access-Key': ACCESS_KEY }
        });
        const json = await fetchRes.json();
        let leaderboard = Array.isArray(json.record) ? json.record : [];

        // Public score fetching
        if (action === 'FETCH_ALL') {
            return res.status(200).json({ leaderboard });
        }

        // Public score submission
        if (action === 'SUBMIT_SCORE') {
            const { playerName, score, password } = payload || {};
            const existingIdx = leaderboard.findIndex(e => (e.name || e.username) === playerName);

            if (existingIdx !== -1) {
                if (score > (leaderboard[existingIdx].score || 0)) {
                    leaderboard[existingIdx].score = score;
                    leaderboard[existingIdx].date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                }
            } else {
                leaderboard.push({
                    name: playerName,
                    password: password,
                    score: score,
                    date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                });
            }

            leaderboard.sort((a, b) => (b.score || 0) - (a.score || 0));

            await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Access-Key': ACCESS_KEY,
                    'X-Bin-Versioning': 'false'
                },
                body: JSON.stringify(leaderboard)
            });

            return res.status(200).json({ success: true, leaderboard });
        }

        // Protected Admin operations (Requires ADMIN_PASSWORD validation)
        if (adminPassword !== SERVER_ADMIN_PASS) {
            return res.status(401).json({ message: 'Unauthorized: Invalid Admin Password' });
        }

        if (action === 'UPDATE_SCORE') {
            const { playerName, newScore } = payload || {};
            const idx = leaderboard.findIndex(e => (e.name || e.username) === playerName);
            if (idx !== -1) {
                leaderboard[idx].score = parseInt(newScore, 10);
                leaderboard.sort((a, b) => (b.score || 0) - (a.score || 0));
            }
        } else if (action === 'RESET_PASS') {
            const { playerName, newPassword } = payload || {};
            const idx = leaderboard.findIndex(e => (e.name || e.username) === playerName);
            if (idx !== -1) {
                leaderboard[idx].password = newPassword;
            }
        } else if (action === 'DELETE_PLAYER') {
            const { playerName } = payload || {};
            leaderboard = leaderboard.filter(e => (e.name || e.username) !== playerName);
        } else if (action === 'CLEAR_ALL') {
            leaderboard = [];
        }

        const updateRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': ACCESS_KEY,
                'X-Bin-Versioning': 'false'
            },
            body: JSON.stringify(leaderboard)
        });

        if (updateRes.ok) {
            return res.status(200).json({ success: true, leaderboard });
        } else {
            return res.status(500).json({ message: `JSONBin error HTTP ${updateRes.status}` });
        }

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}
