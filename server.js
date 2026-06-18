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
    
    socket.on('check-room', (data) => {
        const { roomId } = data;
        const room = rooms[roomId];
        
        if (room) {
            socket.emit('room-exists', { 
                exists: true, 
                hasPassword: !!room.password,
                playersCount: room.players.length 
            });
        } else {
            socket.emit('room-exists', { exists: false });
        }
    });
    
    socket.on('create-room', (data) => {
        const { roomId, password } = data;
        
        if (rooms[roomId]) {
            socket.emit('create-failed', { reason: 'Комната уже существует!' });
            return;
        }
        
        rooms[roomId] = {
            players: [socket.id],
            password: password || null,
            gameState: {
                power: 100, catHunger: 0, gameTime: 0,
                klassukhaPosition: 0, doorLeftClosed: false,
                doorRightClosed: false, aiSpeed: 1, foodInventory: 0
            }
        };
        
        socket.join(roomId);
        socket.emit('create-success', { roomId });
        console.log(`Комната ${roomId} создана ${password ? '(с паролем)' : '(без пароля)'}`);
    });
    
    socket.on('join-room', (data) => {
        const { roomId, password } = data;
        const room = rooms[roomId];
        
        if (!room) {
            socket.emit('join-failed', { reason: 'Комната не найдена!' });
            return;
        }
        
        if (room.password && room.password !== password) {
            socket.emit('join-failed', { reason: 'Неверный пароль!' });
            return;
        }
        
        socket.join(roomId);
        room.players.push(socket.id);
        
        socket.emit('join-success', { roomId, gameState: room.gameState });
        socket.to(roomId).emit('player-joined', socket.id);
        console.log(`Игрок ${socket.id} вошел в ${roomId}`);
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