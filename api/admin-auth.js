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
