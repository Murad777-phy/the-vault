# THE VAULT — real-time multiplayer heist party game

A browser-based, mobile-friendly party game for **2–8 people on separate devices**. Friends join by a six-character room code. With 3–8 players, a secret saboteur tries to derail the crew; with two players, the game is cooperative.

## Quick start

Requires Node.js 20 or later; no third-party npm packages are needed.

```bash
npm start
```

Open http://localhost:3000 on your computer. To simulate two people on one computer, create a room in one browser, then join with the displayed code in a different browser or incognito window (sessions are stored in separate secure cookies).

For two devices on the same Wi-Fi, find your computer's LAN IPv4 address and open `http://YOUR_LAN_IP:3000` on the second device. For friends on different networks, deploy to Render and share the public HTTPS URL.

Run automated tests:

```bash
npm test
```

## How to play

- The host creates a room; 1–7 friends join with the room code. The host starts once 2–8 players are present.
- Play **three heists**, each with 15 seconds to discover your role, **3:30** of action, a **15-second** suspicion vote (in 3–8 player rooms), and **15 seconds** of results before the next heist.
- Complete Camera Room, Laser Grid and Vault Lock puzzles. Solve wires, memory sequences, laser mirrors and the cooperative Split Code terminal. The required number of completions scales with the group size.
- Short random events interrupt the heist: dodge laser sweeps, exploit bonus periods, and manage power surges. Raise the alarm to 100% or run out of time and the crew loses.
- After all three stations are cleared, **two players must engage the final lock simultaneously for eight seconds**.
- With 3–8 players, one randomly chosen saboteur has two one-use hidden gadgets (15-second cooldown between uses). They can raise alarm, scramble an active puzzle, lock a station or fake station progress. The saboteur wins if the crew fails the heist.
- At the end, identify the saboteur or skip. Nobody is eliminated. The role changes across heists when possible.
- Scoring: +150 winning side; +15 successful puzzle (first 4/heist); +25 alarm repair (first 2/heist); +30 each gadget use; +40 correct suspect vote or for the saboteur escaping majority suspicion. Scores accumulate through three heists; ties share first place.

## Deploy to Render

1. Make a **new GitHub repository** and upload the **contents** of this folder, not the ZIP file itself. Do not include `node_modules`, `.env` or test screenshots.
2. In [Render](https://dashboard.render.com), choose **New → Web Service**, connect the GitHub repository, and select its default branch.
3. Use Node runtime, `npm install` as the build command, and `npm start` as the start command. Choose the free plan if available. Health check path: `/health`. (Alternatively use `render.yaml` with a Render Blueprint.)
4. Deploy. When the service reports **Live**, visit your new `https://...onrender.com` address, create a room, and share the invite link with friends.
5. Test from your computer and a phone using separate browsers and networks. Have a third person join to test saboteur roles, gadget secrecy and voting.

**Hosting note:** Game rooms and scores live in server memory. They are lost when the process restarts or a free Render instance sleeps; this demo is designed for a single running server instance. For production multi-instance deployment, move room and session state to a shared data store and add inter-instance event propagation. A free instance may take time to wake after idling.

## Project structure

- `game.js` — authoritative game state, puzzles, timers, roles, events and scoring
- `server.js` — HTTP server, session cookies, live server-sent events and REST endpoints
- `public/` — responsive browser UI and SVG artwork
- `test/` — Node test suite, including simulated independent HTTP sessions and state-based browser UI tests
- `render.yaml` — single-instance Render deployment blueprint

## Limitations

No persistent user accounts, voice chat or payments. Player rooms are private by random code but not encrypted end-to-end; avoid sharing personal information. The automated UI tests use a simulated DOM; do a manual browser/phone play-test before inviting a large group.
