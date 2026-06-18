const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const rooms = {};

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);
    
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [socket.id],
                gameState: {
                    power: 100, catHunger: 0, gameTime: 0,
                    klassukhaPosition: 0, doorLeftClosed: false,
                    doorRightClosed: false, aiSpeed: 1, foodInventory: 0
                }
            };
            console.log(`Комната ${roomId} создана`);
        } else {
            rooms[roomId].players.push(socket.id);
            console.log(`Игрок ${socket.id} присоединился к ${roomId}`);
        }
        socket.emit('game-state', rooms[roomId].gameState);
        socket.to(roomId).emit('player-joined', socket.id);
    });
    
    socket.on('update-game', (data) => {
        const roomId = data.roomId;
        if (rooms[roomId]) {
            rooms[roomId].gameState = { ...rooms[roomId].gameState, ...data.state };
            io.to(roomId).emit('game-updated', rooms[roomId].gameState);
        }
    });
    
    socket.on('admin-command', (data) => {
        const roomId = data.roomId;
        if (rooms[roomId] && data.isAdmin) {
            if (data.action === 'set-difficulty') {
                rooms[roomId].gameState.aiSpeed = data.value;
                io.to(roomId).emit('game-updated', rooms[roomId].gameState);
            }
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Игрок отключился:', socket.id);
        for (let roomId in rooms) {
            const roomIndex = rooms[roomId].players.indexOf(socket.id);
            if (roomIndex > -1) {
                rooms[roomId].players.splice(roomIndex, 1);
                if (rooms[roomId].players.length === 0) {
                    delete rooms[roomId];
                    console.log(`Комната ${roomId} удалена`);
                } else {
                    socket.to(roomId).emit('player-left', socket.id);
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`🎮 Сервер запущен на порту ${PORT}`);
});