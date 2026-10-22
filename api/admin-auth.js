export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {
                return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
            }
        }

        const { action, payload, adminPassword } = body || {};

        if (!action) {
            return res.status(400).json({ success: false, message: "Missing required 'action' field." });
        }

        const BIN_ID = (process.env.JSONBIN_BIN_ID || '').trim();
        const ACCESS_KEY = (process.env.JSONBIN_ACCESS_KEY || '').trim();
        const SERVER_ADMIN_PASS = process.env.ADMIN_PASSWORD || 'bingbing';

        if (!BIN_ID || !ACCESS_KEY) {
            return res.status(200).json({ 
                success: false, 
                message: "Missing JSONBIN_BIN_ID or JSONBIN_ACCESS_KEY on Vercel." 
            });
        }

        // 1. Fetch current leaderboard from JSONBin
        const fetchRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: { 'X-Access-Key': ACCESS_KEY }
        });

        const rawJson = await fetchRes.json().catch(() => ({}));

        if (!fetchRes.ok) {
            return res.status(200).json({ 
                success: false, 
                message: `JSONBin Fetch Failed (${fetchRes.status})`, 
                details: rawJson 
            });
        }

        let leaderboard = [];
        let record = rawJson.record;

        if (Array.isArray(record)) {
            leaderboard = record;
        } else if (record && Array.isArray(record.leaderboard)) {
            leaderboard = record.leaderboard;
        } else if (Array.isArray(rawJson)) {
            leaderboard = rawJson;
        }

        // Action: Fetch All Scores
        if (action === 'FETCH_ALL') {
            return res.status(200).json({ success: true, leaderboard });
        }

        // Action: Submit High Score
        if (action === 'SUBMIT_SCORE') {
            const { playerName, score, password } = payload || {};
            const name = (playerName || body.playerName || "ANONYMOUS").trim();
            const numScore = parseInt(score !== undefined ? score : body.score, 10) || 0;

            const existingIdx = leaderboard.findIndex(e => (e.name || e.username || e.playerName) === name);

            if (existingIdx !== -1) {
                if (numScore > (leaderboard[existingIdx].score || leaderboard[existingIdx].points || 0)) {
                    leaderboard[existingIdx].score = numScore;
                    leaderboard[existingIdx].date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                }
            } else {
                leaderboard.push({
                    name: name,
                    score: numScore,
                    date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    password: password || ''
                });
            }

            leaderboard.sort((a, b) => (b.score || b.points || 0) - (a.score || a.points || 0));

            // Keep top 100 entries to optimize payload size
            leaderboard = leaderboard.slice(0, 100);

            const updateRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Access-Key': ACCESS_KEY,
                    'X-Bin-Versioning': 'false'
                },
                body: JSON.stringify(leaderboard)
            });

            const updateData = await updateRes.json().catch(() => ({}));

            if (!updateRes.ok) {
                return res.status(200).json({ 
                    success: false, 
                    message: `JSONBin Save Failed (${updateRes.status})`, 
                    details: updateData 
                });
            }

            return res.status(200).json({ success: true, leaderboard });
        }

        // Admin Actions Validation
        if (adminPassword !== SERVER_ADMIN_PASS) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        if (action === 'DELETE_PLAYER') {
            const { playerName } = payload || {};
            leaderboard = leaderboard.filter(e => (e.name || e.username || e.playerName) !== playerName);
        } else if (action === 'CLEAR_ALL') {
            leaderboard = [];
        }

        leaderboard.sort((a, b) => (b.score || b.points || 0) - (a.score || a.points || 0));

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
            return res.status(500).json({ success: false, message: 'Admin save failed' });
        }

    } catch (err) {
        return res.status(200).json({ success: false, error: err.message });
    }
}
