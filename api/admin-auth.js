export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {
            return res.status(400).json({ message: 'Invalid JSON body' });
        }
    }

    const { action, payload, adminPassword } = body || {};

    if (!action) {
        return res.status(400).json({ message: "Missing required 'action' field." });
    }

    const BIN_ID = process.env.JSONBIN_BIN_ID;
    const ACCESS_KEY = process.env.JSONBIN_ACCESS_KEY;
    const SERVER_ADMIN_PASS = process.env.ADMIN_PASSWORD || 'bingbing';

    if (!BIN_ID || !ACCESS_KEY) {
        return res.status(500).json({ message: "Environment variables JSONBIN_BIN_ID or JSONBIN_ACCESS_KEY missing on Vercel." });
    }

    try {
        const fetchRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: { 'X-Access-Key': ACCESS_KEY }
        });

        if (!fetchRes.ok) {
            const errData = await fetchRes.json().catch(() => ({}));
            return res.status(fetchRes.status).json({ message: "Failed fetching JSONBin", error: errData });
        }

        const rawJson = await fetchRes.json();
        
        // Unwrap array safely from JSONBin v3 response
        let leaderboard = [];
        let record = rawJson.record;

        if (Array.isArray(record)) {
            leaderboard = record;
        } else if (record && Array.isArray(record.leaderboard)) {
            leaderboard = record.leaderboard;
        } else if (Array.isArray(rawJson)) {
            leaderboard = rawJson;
        }

        if (action === 'FETCH_ALL') {
            return res.status(200).json({ success: true, leaderboard });
        }

        if (action === 'SUBMIT_SCORE') {
            const { playerName, score, password } = payload || {};
            if (!playerName) return res.status(400).json({ message: "playerName required" });

            const numScore = parseInt(score, 10) || 0;
            const existingIdx = leaderboard.findIndex(e => (e.name || e.username) === playerName);

            if (existingIdx !== -1) {
                if (numScore > (leaderboard[existingIdx].score || 0)) {
                    leaderboard[existingIdx].score = numScore;
                    leaderboard[existingIdx].date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                }
            } else {
                leaderboard.push({
                    name: playerName,
                    score: numScore,
                    date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                });
            }

            leaderboard.sort((a, b) => (b.score || 0) - (a.score || 0));

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
                const errData = await updateRes.json().catch(() => ({}));
                return res.status(updateRes.status).json({ message: "Failed saving to JSONBin", error: errData });
            }

            return res.status(200).json({ success: true, leaderboard });
        }

        if (adminPassword !== SERVER_ADMIN_PASS) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (action === 'DELETE_PLAYER') {
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
            return res.status(500).json({ message: 'Admin save failed' });
        }

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}
