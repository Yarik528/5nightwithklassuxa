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
const ADMIN_PASSWORD = "abubaga67"; // МЕНЯЙ ПАРОЛЬ ЗДЕСЬ!

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);
    
    // Проверка пароля админа
    socket.on('check-admin-password', (pwd) => {
        socket.emit('admin-auth-result', pwd === ADMIN_PASSWORD);
    });
    
    // Запрос списка всех комнат
    socket.on('request-rooms-list', () => {
        const list = Object.keys(rooms).map(id => ({
            id,
            players: rooms[id].players.length,
            hasPassword: !!rooms[id].password,
            gameState: rooms[id].gameState
        }));
        socket.emit('rooms-list-update', list);
    });
    
    // Админ подключается к комнате для управления
    socket.on('admin-join-room', (roomId) => {
        if (rooms[roomId]) {
            socket.join(roomId);
            socket.emit('admin-joined', { 
                roomId, 
                gameState: rooms[roomId].gameState,
                players: rooms[roomId].players 
            });
            // Отправляем историю чата
            socket.emit('chat-history', rooms[roomId].chatLog || []);
        }
    });
    
    // Отправка сообщения в чат комнаты
    socket.on('send-chat-message', (data) => {
        const { roomId, message, type, nickname } = data;
        if (rooms[roomId]) {
            if (!rooms[roomId].chatLog) rooms[roomId].chatLog = [];
            const logEntry = { 
                text: message, 
                type: type || 'player',
                nickname: nickname || 'Unknown',
                time: new Date().toLocaleTimeString() 
            };
            rooms[roomId].chatLog.push(logEntry);
            if (rooms[roomId].chatLog.length > 100) {
                rooms[roomId].chatLog.shift();
            }
            io.to(roomId).emit('new-chat-message', logEntry);
        }
    });
    
    // Проверка существования комнаты
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
    
    // Создание комнаты
    socket.on('create-room', (data) => {
        const { roomId, password, nickname } = data;
        if (rooms[roomId]) {
            socket.emit('create-failed', { reason: 'Комната уже существует!' });
            return;
        }
        rooms[roomId] = {
            players: [socket.id],
            nicknames: { [socket.id]: nickname || 'Player' },
            password: password || null,
            gameState: {
                power: 100, catHunger: 0, gameTime: 0,
                klassukhaPosition: 0, doorLeftClosed: false,
                doorRightClosed: false, aiSpeed: 1, foodInventory: 0,
                lightLeft: false, lightRight: false
            },
            chatLog: []
        };
        socket.join(roomId);
        socket.emit('create-success', { roomId });
        socket.to(roomId).emit('player-joined', { 
            playerId: socket.id, 
            nickname: nickname || 'Player' 
        });
        socket.emit('send-chat-message', {
            roomId,
            message: `${nickname || 'Player'} создал комнату`,
            type: 'system',
            nickname: 'System'
        });
        console.log(`Комната ${roomId} создана`);
    });
    
    // Вход в комнату
    socket.on('join-room', (data) => {
        const { roomId, password, nickname } = data;
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
        room.nicknames[socket.id] = nickname || 'Player';
        socket.emit('join-success', { roomId, gameState: room.gameState });
        socket.to(roomId).emit('player-joined', {
            playerId: socket.id,
            nickname: nickname || 'Player'
        });
        socket.emit('send-chat-message', {
            roomId,
            message: `${nickname || 'Player'} присоединился`,
            type: 'system',
            nickname: 'System'
        });
        console.log(`Игрок ${nickname} вошел в ${roomId}`);
    });
    
    // Обновление состояния игры
    socket.on('update-game', (data) => {
        const { roomId, state, nickname } = data;
        if (rooms[roomId]) {
            rooms[roomId].gameState = { ...rooms[roomId].gameState, ...state };
            io.to(roomId).emit('game-updated', rooms[roomId].gameState);
            
            // Логирование действий
            let actionText = '';
            if (state.doorLeftClosed !== undefined) {
                actionText = `${nickname || 'Игрок'} ${state.doorLeftClosed ? 'закрыл' : 'открыл'} ЛЕВУЮ дверь`;
            } else if (state.doorRightClosed !== undefined) {
                actionText = `${nickname || 'Игрок'} ${state.doorRightClosed ? 'закрыл' : 'открыл'} ПРАВУЮ дверь`;
            } else if (state.lightLeft !== undefined) {
                actionText = `${nickname || 'Игрок'} ${state.lightLeft ? 'включил' : 'выключил'} свет слева`;
            } else if (state.lightRight !== undefined) {
                actionText = `${nickname || 'Игрок'} ${state.lightRight ? 'включил' : 'выключил'} свет справа`;
            } else if (state.aiSpeed !== undefined) {
                actionText = `${nickname || 'Admin'} изменил сложность на ${state.aiSpeed}`;
            } else if (state.catHunger !== undefined) {
                actionText = `${nickname || 'Игрок'} покормил кота`;
            } else if (state.foodInventory !== undefined) {
                actionText = `${nickname || 'Игрок'} взял еду`;
            }
            
            if (actionText) {
                socket.emit('send-chat-message', {
                    roomId,
                    message: actionText,
                    type: 'system',
                    nickname: nickname || 'System'
                });
            }
        }
    });
    
    // Админ-команды
    socket.on('admin-command', (data) => {
        const { roomId, action, value, nickname } = data;
        if (rooms[roomId]) {
            if (action === 'set-difficulty') {
                rooms[roomId].gameState.aiSpeed = value;
                io.to(roomId).emit('game-updated', rooms[roomId].gameState);
            } else if (action === 'trigger-jumpscare') {
                io.to(roomId).emit('trigger-jumpscare');
            } else if (action === 'instant-win') {
                rooms[roomId].gameState.gameTime = 59.9;
                io.to(roomId).emit('game-updated', rooms[roomId].gameState);
            } else if (action === 'toggle-all-doors') {
                const newState = !rooms[roomId].gameState.doorLeftClosed;
                rooms[roomId].gameState.doorLeftClosed = newState;
                rooms[roomId].gameState.doorRightClosed = newState;
                io.to(roomId).emit('game-updated', rooms[roomId].gameState);
            }
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Игрок отключился:', socket.id);
        for (let roomId in rooms) {
            const roomIndex = rooms[roomId].players.indexOf(socket.id);
            if (roomIndex > -1) {
                const nickname = rooms[roomId].nicknames[socket.id] || 'Player';
                rooms[roomId].players.splice(roomIndex, 1);
                delete rooms[roomId].nicknames[socket.id];
                socket.to(roomId).emit('player-left', {
                    playerId: socket.id,
                    nickname: nickname
                });
                socket.emit('send-chat-message', {
                    roomId,
                    message: `${nickname} покинул комнату`,
                    type: 'system',
                    nickname: 'System'
                });
                if (rooms[roomId].players.length === 0) {
                    delete rooms[roomId];
                    console.log(`Комната ${roomId} удалена`);
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`🎮 Сервер запущен на порту ${PORT}`);
    console.log(`🔐 Пароль админа: ${ADMIN_PASSWORD}`);
});