const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// Serve host and player HTML from project root so README paths work
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'host.html')));
app.get('/host.html', (req, res) => res.sendFile(path.join(__dirname, 'host.html')));
app.get('/player.html', (req, res) => res.sendFile(path.join(__dirname, 'player.html')));

// In-memory game state
const rooms = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on("connection", (socket) => {
  // HOST: Create a new room
  socket.on("host:create", ({ questions }) => {
    const code = generateCode();
    rooms[code] = {
      code,
      hostId: socket.id,
      questions,
      currentQuestion: -1,
      phase: "lobby", // lobby | bidding | answering | review | finished
      players: {}, // { id: { name, money, bid, answer, correct } }
      eliminated: [],
    };
    socket.join(code);
    socket.emit("host:created", { code });
  });

  // PLAYER: Join a room
  socket.on("player:join", ({ code, name }) => {
    const room = rooms[code];
    if (!room) return socket.emit("error", { msg: "Room not found" });
    if (room.phase !== "lobby") return socket.emit("error", { msg: "Game already started" });

    const nameTaken = Object.values(room.players).some((p) => p.name === name);
    if (nameTaken) return socket.emit("error", { msg: "Name already taken" });

    room.players[socket.id] = {
      id: socket.id,
      name,
      money: 1000,
      bid: 0,
      answer: null,
      correct: null,
    };
    socket.join(code);
    socket.data.code = code;
    socket.data.name = name;

    // Notify host and all players
    io.to(code).emit("room:players", { players: Object.values(room.players) });
    socket.emit("player:joined", { name, money: 1000, code });
  });

  // HOST: Start game
  socket.on("host:start", ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    room.phase = "active";
    nextQuestion(room);
  });

  // HOST: Advance to next question
  socket.on("host:next", ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    nextQuestion(room);
  });

  function nextQuestion(room) {
    room.currentQuestion++;
    if (room.currentQuestion >= room.questions.length) {
      room.phase = "finished";
      const standings = Object.values(room.players)
        .filter((p) => !room.eliminated.includes(p.id))
        .sort((a, b) => b.money - a.money);
      io.to(room.code).emit("game:finished", { standings, eliminated: room.eliminated.map(id => room.players[id]?.name || id) });
      return;
    }

    // Reset per-round state
    Object.values(room.players).forEach((p) => {
      p.bid = 0;
      p.answer = null;
      p.correct = null;
    });

    room.phase = "bidding";
    const q = room.questions[room.currentQuestion];
    io.to(room.code).emit("round:start", {
      questionIndex: room.currentQuestion,
      total: room.questions.length,
      question: q.text,
      players: Object.values(room.players).map((p) => ({
        id: p.id, name: p.name, money: p.money,
      })),
    });
  }

  // PLAYER: Submit bid
  socket.on("player:bid", ({ bid }) => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room || room.phase !== "bidding") return;

    const player = room.players[socket.id];
    if (!player) return;

    const amount = parseInt(bid);
    if (isNaN(amount) || amount < 0 || amount > player.money) {
      return socket.emit("error", { msg: "Invalid bid" });
    }

    player.bid = amount;
    player.answer = null;

    // Notify host of bid status
    io.to(room.code).emit("room:bids", {
      bids: Object.values(room.players).map((p) => ({
        id: p.id, name: p.name, hasBid: p.bid > 0 || p.bid === 0 && p.answer === null,
        bid: p.bid,
      })),
    });
    socket.emit("player:bid_confirmed", { bid: amount });
  });

  // HOST: Lock bids and open answers
  socket.on("host:lock_bids", ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    room.phase = "answering";
    io.to(code).emit("round:answer_phase");
  });

  // PLAYER: Submit answer
  socket.on("player:answer", ({ answer }) => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room || room.phase !== "answering") return;

    const player = room.players[socket.id];
    if (!player) return;

    player.answer = answer;

    // Check if all non-eliminated players answered
    const activePlayers = Object.values(room.players).filter(
      (p) => !room.eliminated.includes(p.id)
    );
    const answered = activePlayers.filter((p) => p.answer !== null).length;

    io.to(code).emit("room:answers_progress", {
      answered,
      total: activePlayers.length,
    });

    if (answered === activePlayers.length) {
      io.to(code).emit("round:all_answered");
    }

    socket.emit("player:answer_confirmed");
  });

  // HOST: End round and show all answers for review
  socket.on("host:end_round", ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    room.phase = "review";

    const answers = Object.values(room.players)
      .filter((p) => !room.eliminated.includes(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        bid: p.bid,
        answer: p.answer || "(no answer)",
        correct: null,
        money: p.money,
      }));

    socket.emit("host:review", { answers });
    io.to(code).emit("round:review");
  });

  // HOST: Mark answer correct or incorrect
  socket.on("host:mark", ({ code, playerId, correct }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    const player = room.players[playerId];
    if (!player) return;

    player.correct = correct;

    // Resolve money
    if (player.bid === 0) {
      // Didn't bid — eliminate
      if (!room.eliminated.includes(playerId)) {
        room.eliminated.push(playerId);
      }
      player.money = 0;
    } else if (correct) {
      player.money += player.bid; // doubles the bid portion
    } else {
      player.money -= player.bid;
      if (player.money <= 0) {
        player.money = 0;
        if (!room.eliminated.includes(playerId)) {
          room.eliminated.push(playerId);
        }
      }
    }

    // Tell the player their result
    const playerSocket = io.sockets.sockets.get(playerId);
    if (playerSocket) {
      playerSocket.emit("player:result", {
        correct,
        bid: player.bid,
        money: player.money,
        eliminated: room.eliminated.includes(playerId),
      });
    }

    // Send updated review state to host
    const answers = Object.values(room.players)
      .filter((p) => !room.eliminated.includes(p.id) || p.correct !== null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        bid: p.bid,
        answer: p.answer || "(no answer)",
        correct: p.correct,
        money: p.money,
      }));

    socket.emit("host:review_update", {
      answers,
      eliminated: room.eliminated.map((id) => room.players[id]?.name || id),
      standings: Object.values(room.players)
        .filter((p) => !room.eliminated.includes(p.id))
        .sort((a, b) => b.money - a.money)
        .map((p) => ({ name: p.name, money: p.money })),
    });
  });

  socket.on("disconnect", () => {
    const code = socket.data.code;
    if (!code) return;
    const room = rooms[code];
    if (!room) return;

    if (room.hostId === socket.id) {
      io.to(code).emit("error", { msg: "Host disconnected. Game over." });
      delete rooms[code];
    } else {
      const player = room.players[socket.id];
      if (player) {
        delete room.players[socket.id];
        io.to(code).emit("room:players", {
          players: Object.values(room.players),
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Trivia server running on http://localhost:${PORT}`));
