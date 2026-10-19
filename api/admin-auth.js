export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    const { adminPassword, action, payload } = req.body || {};
    const BIN_ID = process.env.JSONBIN_BIN_ID;
    const ACCESS_KEY = process.env.JSONBIN_ACCESS_KEY;
    const SERVER_ADMIN_PASS = process.env.ADMIN_PASSWORD || 'bingbing';

    try {
        // Fetch current bin record
        const fetchRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: { 'X-Access-Key': ACCESS_KEY }
        });
        const json = await fetchRes.json();
        
        // Extract array regardless of whether JSONBin wrapped it in record or leaderboard
        let leaderboard = [];
        if (Array.isArray(json.record)) {
            leaderboard = json.record;
        } else if (json.record && Array.isArray(json.record.leaderboard)) {
            leaderboard = json.record.leaderboard;
        } else if (Array.isArray(json)) {
            leaderboard = json;
        }

        // Action: Fetch All
        if (action === 'FETCH_ALL') {
            return res.status(200).json({ leaderboard });
        }

        // Action: Submit Score
        if (action === 'SUBMIT_SCORE') {
            const { playerName, score, password } = payload || {};
            if (!playerName) return res.status(400).json({ message: "Player name required" });

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

            // Sort descending
            leaderboard.sort((a, b) => (b.score || 0) - (a.score || 0));

            // Save back to JSONBin with explicit versioning disabled
            const updateRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Access-Key': ACCESS_KEY,
                    'X-Bin-Versioning': 'false'
                },
                body: JSON.stringify(leaderboard)
            });

            if (!updateRes.ok) {
                const errData = await updateRes.json();
                return res.status(updateRes.status).json({ message: "JSONBin save failed", error: errData });
            }

            return res.status(200).json({ success: true, leaderboard });
        }

        // Protected Admin Actions
        if (adminPassword !== SERVER_ADMIN_PASS) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (action === 'UPDATE_SCORE') {
            const { playerName, newScore } = payload || {};
            const idx = leaderboard.findIndex(e => (e.name || e.username) === playerName);
            if (idx !== -1) leaderboard[idx].score = parseInt(newScore, 10);
        } else if (action === 'RESET_PASS') {
            const { playerName, newPassword } = payload || {};
            const idx = leaderboard.findIndex(e => (e.name || e.username) === playerName);
            if (idx !== -1) leaderboard[idx].password = newPassword;
        } else if (action === 'DELETE_PLAYER') {
            const { playerName } = payload || {};
            leaderboard = leaderboard.filter(e => (e.name || e.username) !== playerName);
        } else if (action === 'CLEAR_ALL') {
            leaderboard = [];
        }

        leaderboard.sort((a, b) => (b.score || 0) - (a.score || 0));

        const adminUpdateRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': ACCESS_KEY,
                'X-Bin-Versioning': 'false'
            },
            body: JSON.stringify(leaderboard)
        });

        if (adminUpdateRes.ok) {
            return res.status(200).json({ success: true, leaderboard });
        } else {
            return res.status(500).json({ message: 'Failed to update JSONBin' });
        }

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}
