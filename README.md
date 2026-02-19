# QUIZARD — Real-Time Bidding Trivia Game

## Setup

1. Make sure you have **Node.js** installed (v16+)
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```

4. (Optional) Run with Docker + nginx (recommended for testing the same proxy setup as production):
   ```
   npm run docker:up
   # app -> http://localhost:3000  (node)
   # nginx proxy -> http://localhost:8080
   ```

5. Expose your local nginx (port 8080) using ngrok for remote/device testing:
   ```
   npm run tunnel
   # open the printed ngrok URL + /host.html and /player.html
   ```

6. Open your browser:
   - **Landing page:** `http://localhost:3000/` or `http://localhost:8080/` (shows `index.html`)
   - **Host:** `http://localhost:3000/host.html` (or via nginx `http://localhost:8080/host.html`)
   - **Players:** `http://localhost:3000/player.html` (or via nginx `http://localhost:8080/player.html`)

> When testing across devices or via the ngrok URL, the client will attempt to connect to the same origin by default. You can also force the client to use a backend URL with the `?server=` query (e.g. `https://abcd.ngrok.io/host.html?server=https://abcd.ngrok.io`).

---

Deployment note: the front-end is published on Vercel (project `quizard`) and the landing page will be served at the project root.

---

## Full Game Flow

### Host
1. Open `host.html` → Add your questions (no answers needed, you'll mark them live)
2. Click **Host The Game** → A room code appears
3. Share the code with players
4. Click **Start Game** once everyone has joined
5. Each round:
   - Players bid → you see bids live
   - Click **Lock Bids** → players can now type answers
   - Click **Show Answers for Review** when ready
   - Mark each answer ✓ Correct or ✗ Wrong
6. Click **Next Question** to continue

### Players
1. Open `player.html` on their phone
2. Enter their name + the room code
3. Each round: place a bid → type their answer
4. See their result after host marks it

---

## Money Rules
- Everyone starts with **$1,000**
- **Correct answer:** bid amount is added (e.g. bet $200 → gain $200)
- **Wrong answer:** bid amount is lost (e.g. bet $200 → lose $200)
- **No bid (bid $0):** automatically **eliminated**
- Eliminated players watch the rest of the game
