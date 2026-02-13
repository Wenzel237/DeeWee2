const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve Vite build
app.use(express.static(path.join(__dirname, "dist")));

app.get((req, res) => {
  res.sendFile(path.join(__dirname, "dist/index.html"));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on", PORT);
});

// --- Load Level Data ---
let spawnPoints = [];
try {
    const filePath = path.join(__dirname, 'public', 'assets', 'jsons', 'firstFloor.json');
    const levelData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (levelData && levelData.spawnPoints) {
        spawnPoints = levelData.spawnPoints.map(sp => ({ ...sp, occupied: false }));
        console.log('Spawn points loaded successfully.');
    }
} catch (error) {
    console.error("!!! CRITICAL: Error loading level data. Spawning will not work.", error);
}

// --- Spawn Point Management ---
function getAvailableSpawnPoint() {
    const availablePoints = spawnPoints.filter(p => !p.occupied);
    if (availablePoints.length === 0) {
        return null;
    }
    const randomIndex = Math.floor(Math.random() * availablePoints.length);
    const point = availablePoints[randomIndex];
    point.occupied = true;
    return point;
}

function releaseSpawnPoint(spawnPointToRelease) {
    if (!spawnPointToRelease) return;
    const point = spawnPoints.find(p => p.x === spawnPointToRelease.x && p.y === spawnPointToRelease.y);
    if (point) {
        point.occupied = false;
    }
}

// --- Player Joining Logic ---
function handleJoin(socket, roomCode, ack) {
    const raccoonsInRoom = Object.values(raccoons).filter(r => r.roomCode === roomCode);

    if (raccoonsInRoom.length >= 2) {
        console.log(`Room ${roomCode} is full. Denying entry to ${socket.id}`);
        if (ack) ack({ error: "This room is full 💔" });
        return;
    }

    console.log(`Player ${socket.id} joining room ${roomCode}`);
    socket.join(roomCode);

    const spawnPoint = getAvailableSpawnPoint();
    if (!spawnPoint) {
        if (ack) ack({ error: "No spawn points available 💔" });
        return;
    }

    const newRaccoon = {
        id: socket.id,
        character: raccoonsInRoom.some(p => p.character === 'Dee') ? 'Wee' : 'Dee',
        x: spawnPoint.x,
        y: spawnPoint.y,
        spawnPoint: spawnPoint,
        roomCode: roomCode
    };
    raccoons[socket.id] = newRaccoon;
    
    if (ack) ack({ joined: true });

    // If room is now full, tell everyone in it to start the game with the full player list
    const raccoonsInRoomNow = Object.values(raccoons).filter(p => p.roomCode === roomCode);
    if (raccoonsInRoomNow.length === 2) {
        console.log(`Room ${roomCode} is now full. Emitting 'startGame'.`);
        io.to(roomCode).emit('startGame', raccoonsInRoomNow);
    }
}

const raccoons = {}; // Single source of truth for all player states

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("joinRoom", (roomCode, ack) => {
    handleJoin(socket, roomCode, ack);
  });
  
  socket.on('joinRandom', (ack) => {
    // Group raccoons by roomCode
    const rooms = Object.values(raccoons).reduce((acc, raccoon) => {
      acc[raccoon.roomCode] = acc[raccoon.roomCode] || [];
      acc[raccoon.roomCode].push(raccoon);
      return acc;
    }, {});

    // Find rooms with exactly one player
    const availableRooms = Object.keys(rooms).filter(roomCode => rooms[roomCode].length === 1);

    if (availableRooms.length > 0) {
      // Pick a random room and join
      const randomRoomCode = availableRooms[Math.floor(Math.random() * availableRooms.length)];
      console.log(`Player ${socket.id} is randomly joining room ${randomRoomCode}`);
      handleJoin(socket, randomRoomCode, ack);
    } else {
      // No rooms available
      if (ack) ack({ error: "No available rooms to join 💔" });
    }
  });

  socket.on("raccoonMove", (data) => {
    const raccoon = raccoons[socket.id];
    if (raccoon && raccoon.roomCode) {
        raccoon.x = data.x;
        raccoon.y = data.y;
        socket.to(raccoon.roomCode).emit("raccoonMoved", {
            id: socket.id,
            x: data.x,
            y: data.y
        });
    }
  });

  socket.on("disconnect", () => {
    const disconnectedRaccoon = raccoons[socket.id];
    if (disconnectedRaccoon) {
        const roomCode = disconnectedRaccoon.roomCode;
        // Count players in the room *before* removing the disconnected one
        const raccoonsInRoom = Object.values(raccoons).filter(r => r.roomCode === roomCode);
        
        console.log(`Raccoon ${socket.id} from room ${roomCode} left.`);
        releaseSpawnPoint(disconnectedRaccoon.spawnPoint);
        delete raccoons[socket.id];

        if (roomCode) {
            // If the room had 2 players, the game was in progress. End it for the other player.
            if (raccoonsInRoom.length === 2) {
                console.log(`Game in room ${roomCode} ended due to disconnect.`);
                socket.to(roomCode).emit("gameEnded", { message: "The other raccoon left 😭. Try joining a new room." });
            } else {
                // Otherwise, just notify that a player left (e.g. from the lobby)
                io.to(roomCode).emit("raccoonLeft", socket.id);
            }
        }
    }
  });
});

