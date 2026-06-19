// === НАСТРОЙКИ И ПЕРЕМЕННЫЕ ===
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const assets = { bg: new Image(), cat: new Image(), klassukha: new Image(), kitchen: new Image() };
assets.bg.src = 'assets/classroom.png';
assets.cat.src = 'assets/cat.png';
assets.klassukha.src = 'assets/klassukha.png';
assets.kitchen.src = 'assets/kitchen.png';

const sounds = {};
['door','light','camera','cat','jumpscare','ambient','static','cook'].forEach(n => {
    sounds[n] = new Audio('assets/sounds/' + n + '.mp3');
});
sounds.ambient.loop = true;
sounds.ambient.volume = 0.3;

function playSound(name) {
    if (sounds[name]) {
        sounds[name].currentTime = 0;
        sounds[name].play().catch(() => {});
    }
}

let myNickname = 'Player1';
let myPlayerId = '';
let isAdminAuthenticated = false;
let currentAdminRoom = null;

// Генерация ID при первом запуске
function generatePlayerId() {
    const saved = localStorage.getItem('playerId');
    if (saved) {
        myPlayerId = saved;
    } else {
        myPlayerId = Math.floor(10000 + Math.random() * 90000).toString();
        localStorage.setItem('playerId', myPlayerId);
    }
}
generatePlayerId();

let gameState = {
    power: 100, doorLeftClosed: false, doorRightClosed: false,
    lightLeft: false, lightRight: false, cameraOpen: false,
    currentCamera: 0, catHunger: 0, gameTime: 0,
    night: 1, klassukhaPosition: 0, isGameOver: false,
    catInRoom: true, aiSpeed: 1,
    playerRotation: 0, foodInventory: 0,
    isCooking: false, cookProgress: 0, cookTime: 100
};

// === МУЛЬТИПЛЕЕР И АДМИНКА ===
const SERVER_URL = 'https://5bb4cbfa-2c6d-4594-9e0e-a390b02aad22-00-1vfzoka5fshcd.sisko.replit.dev/'; // ТВОЙ URL!
let socket = null;
let isConnected = false;
let currentRoom = '';

function connectToServer() {
    // Обновляем отображение ID
    document.getElementById('player-id-display').textContent = `🆔 ${myPlayerId}`;
    document.getElementById('admin-current-id').textContent = myPlayerId;
    
    socket = io(SERVER_URL);
    
    socket.on('connect', () => {
        isConnected = true;
        document.getElementById('connection-status').textContent = '✅ Подключено!';
        document.getElementById('connection-status').style.color = '#0f0';
        document.getElementById('multiplayer-indicator').textContent = '🟢 Онлайн';
    });
    
    socket.on('disconnect', () => {
        isConnected = false;
        document.getElementById('connection-status').textContent = '❌ Отключено';
        document.getElementById('connection-status').style.color = '#f00';
        document.getElementById('multiplayer-indicator').textContent = '🔴 Офлайн';
    });

    // --- АДМИН СОБЫТИЯ ---
    socket.on('admin-auth-result', (success) => {
        if (success) {
            isAdminAuthenticated = true;
            document.getElementById('admin-login-modal').classList.add('hidden');
            document.getElementById('admin-panel').classList.remove('hidden');
            socket.emit('request-rooms-list');
        } else {
            alert(" НЕВЕРНЫЙ ПАРОЛЬ АДМИНА!");
            document.getElementById('admin-pass-input').value = '';
        }
    });

    socket.on('rooms-list-update', (rooms) => {
        const container = document.getElementById('rooms-container');
        container.innerHTML = '';
        if (rooms.length === 0) {
            container.innerHTML = '<p style="color:#666; font-size:10px;">Нет активных комнат</p>';
            return;
        }
        rooms.forEach(r => {
            const div = document.createElement('div');
            div.className = `room-item ${currentAdminRoom === r.id ? 'active' : ''}`;
            div.innerHTML = `📡 ${r.id} <br>👥 ${r.players} игроков ${r.hasPassword ? '🔒' : ''}`;
            div.onclick = () => selectAdminRoom(r.id);
            container.appendChild(div);
        });
    });

    socket.on('admin-joined', (data) => {
        gameState = data.gameState;
        updateUI();
        const playersList = document.getElementById('players-list');
        playersList.innerHTML = `<p style="color:#fff; font-size:10px;">В комнате: ${data.players} чел.</p>`;
    });

    // --- ЧАТ И ЛОГИ ---
    socket.on('chat-history', (logs) => {
        const chatLog = document.getElementById('chat-log');
        chatLog.innerHTML = '';
        logs.forEach(log => addChatMessage(log, 'chat-log'));
    });

    socket.on('new-chat-message', (log) => {
        addChatMessage(log, 'chat-log');
        addChatMessage(log, 'chat-messages');
    });

    // --- ИГРОВЫЕ СОБЫТИЯ ---
    socket.on('room-exists', (data) => {
        const info = document.getElementById('room-info');
        if (data.exists) {
            info.textContent = `Комната найдена! ${data.hasPassword ? ' С паролем' : ' Без пароля'} | 👥 ${data.playersCount} игроков`;
            info.style.color = '#0f0';
        } else {
            info.textContent = 'Комната не существует - можно создать';
            info.style.color = '#ff0';
        }
    });
    
    socket.on('create-success', (data) => {
        currentRoom = data.roomId;
        startMultiplayerGame();
    });
    socket.on('create-failed', (data) => showError('Не удалось создать', data.reason));
    
    socket.on('join-success', (data) => {
        currentRoom = data.roomId;
        if (data.gameState) Object.assign(gameState, data.gameState);
        startMultiplayerGame();
    });
    socket.on('join-failed', (data) => showError('Не удалось войти', data.reason));
    
    socket.on('game-state', (state) => Object.assign(gameState, state));
    socket.on('game-updated', (state) => Object.assign(gameState, state));
    
    socket.on('player-joined', (data) => {
        addChatMessage({ text: `👤 ${data.nickname} присоединился`, type: 'system', time: new Date().toLocaleTimeString() }, 'chat-messages');
    });
    socket.on('player-left', (data) => {
        addChatMessage({ text: `👋 ${data.nickname} покинул комнату`, type: 'system', time: new Date().toLocaleTimeString() }, 'chat-messages');
    });

    socket.on('trigger-jumpscare', () => jumpscare());
}

function addChatMessage(log, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const div = document.createElement('div');
    div.className = log.type === 'system' ? 'log-system' : 'log-player';
    div.innerHTML = `<span class="log-time">[${log.time}]</span> ${log.text}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function selectAdminRoom(roomId) {
    currentAdminRoom = roomId;
    document.getElementById('current-room-name').textContent = `📡 УПРАВЛЕНИЕ: ${roomId}`;
    document.getElementById('active-room-controls').classList.remove('hidden');
    socket.emit('admin-join-room', roomId);
    
    document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

function adminAction(action) {
    if (!currentAdminRoom) return;
    let updates = {};
    
    if (action === 'toggle-doors') updates = { doorLeftClosed: !gameState.doorLeftClosed, doorRightClosed: !gameState.doorRightClosed };
    else if (action === 'jumpscare') { 
        socket.emit('admin-command', { roomId: currentAdminRoom, action: 'trigger-jumpscare', nickname: myNickname, playerId: myPlayerId }); 
        return; 
    }
    else if (action === 'win') updates = { gameTime: 59.9 };
    else if (action === 'add-power') updates = { power: Math.min(100, gameState.power + 50) };
    else if (action === 'feed-cat') updates = { catHunger: 0 };
    
    socket.emit('update-game', { roomId: currentAdminRoom, state: updates, nickname: `[ADMIN] ${myNickname}`, playerId: myPlayerId });
}

function sendGameStateUpdate(updates) {
    if (socket && isConnected && currentRoom) {
        socket.emit('update-game', { roomId: currentRoom, state: updates, nickname: myNickname, playerId: myPlayerId });
    }
}

connectToServer();

// === МЕНЮ И ИГРА ===
let currentNight = 1;
let maxNightUnlocked = 1;
let gameStarted = false;
let gamePaused = false;
let loopStarted = false;

const nightSettings = {
    1: { name: 'НОЧЬ 1', speed: 1, power: 100 },
    2: { name: 'НОЧЬ 2', speed: 3, power: 100 },
    3: { name: 'НОЧЬ 3', speed: 5, power: 100 },
    4: { name: 'НОЧЬ 4', speed: 8, power: 100 },
    5: { name: 'НОЧЬ 5', speed: 12, power: 100 }
};
let customSettings = { speed: 5, power: 100, hunger: 0 };

const cameras = [
    { name: 'CAM 01 - КЛАСС', hasCat: true },
    { name: 'CAM 02 - КОРИДОР СЛЕВА', hasCat: false },
    { name: 'CAM 03 - КОРИДОР СПРАВА', hasCat: false },
    { name: 'CAM 04 - СТОЛОВАЯ', hasCat: true }
];

const timeDisplay = document.getElementById('time-display');
const powerDisplay = document.getElementById('power-display');
const nightDisplay = document.getElementById('night-display');
const catStatus = document.getElementById('cat-status');

function formatTime(min) {
    const h = Math.floor(min / 10) % 12 || 12;
    return `${h}:00 AM`;
}

function updateUI() {
    timeDisplay.textContent = formatTime(gameState.gameTime);
    powerDisplay.textContent = `⚡ ${Math.floor(gameState.power)}%`;
    if (gameState.catHunger < 30) {
        catStatus.textContent = `🐱 КОТ: СЫТ | 🍕 Еда: ${gameState.foodInventory}`;
        catStatus.style.color = '#0f0';
    } else if (gameState.catHunger < 70) {
        catStatus.textContent = `🐱 КОТ: ГОЛОДЕН | 🍕 Еда: ${gameState.foodInventory}`;
        catStatus.style.color = '#fa0';
    } else {
        catStatus.textContent = `🐱 КОТ: ОЧЕНЬ ГОЛОДЕН! | 🍕 Еда: ${gameState.foodInventory}`;
        catStatus.style.color = '#f00';
    }
}

function update() {
    if (!gameStarted || gamePaused || gameState.isGameOver) return;
    if (gameState.power <= 0) {
        setTimeout(() => { alert('НЕТ ЭНЕРГИИ! GAME OVER'); location.reload(); }, 500);
        gameState.isGameOver = true;
        return;
    }
    
    let usage = 0.5;
    if (gameState.doorLeftClosed) usage += 1.5;
    if (gameState.doorRightClosed) usage += 1.5;
    if (gameState.lightLeft) usage += 1;
    if (gameState.lightRight) usage += 1;
    if (gameState.cameraOpen) usage += 0.5;
    
    gameState.power -= usage * 0.016;
    if (gameState.power < 0) gameState.power = 0;
    
    gameState.gameTime += 0.005;
    gameState.catHunger = Math.min(100, gameState.catHunger + 0.01);
    
    if (gameState.isCooking) {
        gameState.cookProgress += 1;
        if (gameState.cookProgress >= gameState.cookTime) {
            gameState.foodInventory++;
            gameState.isCooking = false;
            gameState.cookProgress = 0;
            playSound('cook');
        }
    }
    
    const moveChance = 0.002 * gameState.aiSpeed;
    if (Math.random() < moveChance) {
        if (gameState.catHunger > 50) {
            gameState.klassukhaPosition += 2;
        } else {
            gameState.klassukhaPosition += Math.random() > 0.5 ? 1 : -1;
        }
        gameState.klassukhaPosition = Math.max(0, Math.min(5, gameState.klassukhaPosition));
    }
    
    if (gameState.klassukhaPosition >= 4 && !gameState.doorLeftClosed && gameState.playerRotation !== 2) {
        if (Math.random() < 0.02) jumpscare();
    }
    if (gameState.klassukhaPosition === 5 && !gameState.doorRightClosed && gameState.playerRotation !== 2) {
        if (Math.random() < 0.02) jumpscare();
    }
    
    if (gameState.gameTime >= 60) victory();
    updateUI();
}

function drawBackground() {
    if (gameState.playerRotation === 0) {
        if (assets.bg.complete && assets.bg.naturalWidth > 0) ctx.drawImage(assets.bg, 0, 0, canvas.width, canvas.height);
        else {
            ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff'; ctx.font = '20px "Press Start 2P"';
            ctx.fillText('НЕ СМОТРИ', canvas.width/2 - 130, canvas.height/2);
        }
    } else if (gameState.playerRotation === -1) {
        ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = '30px "Press Start 2P"'; ctx.fillText('ЛЕВАЯ ДВЕРЬ', 50, canvas.height / 2);
    } else if (gameState.playerRotation === 1) {
        ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = '30px "Press Start 2P"'; ctx.fillText('ПРАВАЯ ДВЕРЬ', canvas.width - 350, canvas.height / 2);
    } else if (gameState.playerRotation === 2) {
        ctx.fillStyle = '#2c3e50'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = '30px "Press Start 2P"'; ctx.fillText('КУХНЯ', canvas.width/2 - 100, canvas.height * 0.4);
    }
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!gameStarted) return;

    if (gameState.cameraOpen) {
        ctx.fillStyle = '#0a1a0a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f0'; ctx.font = 'bold 32px "Press Start 2P"';
        ctx.fillText(cameras[gameState.currentCamera].name, 50, 80);
    } else {
        drawBackground();
        if (gameState.playerRotation === -1 && gameState.doorLeftClosed) {
            ctx.fillStyle = '#34495e'; ctx.fillRect(0, 0, canvas.width * 0.3, canvas.height);
        }
        if (gameState.playerRotation === 1 && gameState.doorRightClosed) {
            ctx.fillStyle = '#34495e'; ctx.fillRect(canvas.width * 0.7, 0, canvas.width * 0.3, canvas.height);
        }
    }
}

function jumpscare() {
    gameState.isGameOver = true;
    playSound('jumpscare');
    const img = document.createElement('img');
    img.src = assets.klassukha.src;
    img.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:100vw;max-height:100vh;z-index:1000;';
    document.body.appendChild(img);
    setTimeout(() => { alert('КЛАССУХА ПОЙМАЛА ТЕБЯ!'); location.reload(); }, 2000);
}

function victory() {
    gameState.isGameOver = true;
    unlockNight(currentNight + 1);
    setTimeout(() => { alert(`🎉 6:00 AM!\n\nТЫ ВЫЖИЛ!`); showMenu('main-menu'); }, 1000);
}

function gameLoop() { update(); draw(); requestAnimationFrame(gameLoop); }

function showMenu(menuId) {
    document.querySelectorAll('.menu-screen').forEach(m => m.classList.add('hidden'));
    document.getElementById('game-screen').classList.add('hidden');
    if (menuId) document.getElementById(menuId).classList.remove('hidden');
}

function startMultiplayerGame() {
    document.getElementById('multiplayer-menu').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('player-nickname-display').textContent = `👤 ${myNickname}`;
    gameStarted = true;
    if (!loopStarted) { loopStarted = true; gameLoop(); }
}

function startGame(night, isCustom = false) {
    currentNight = night;
    gameStarted = true; gamePaused = false;
    const settings = isCustom ? customSettings : nightSettings[night];
    gameState = { ...gameState, power: settings.power, catHunger: isCustom ? settings.hunger : 0, gameTime: 0, aiSpeed: settings.speed };
    document.querySelectorAll('.menu-screen').forEach(m => m.classList.add('hidden'));
    document.getElementById('game-screen').classList.remove('hidden');
    nightDisplay.textContent = isCustom ? 'КАСТОМНАЯ НОЧЬ' : settings.name;
    if (!loopStarted) { loopStarted = true; gameLoop(); }
}

function unlockNight(night) {
    if (night > maxNightUnlocked) { maxNightUnlocked = night; localStorage.setItem('maxNightUnlocked', maxNightUnlocked); }
}

function showError(title, text) {
    document.getElementById('error-title').textContent = '❌ ' + title;
    document.getElementById('error-text').textContent = text;
    document.getElementById('error-modal').classList.remove('hidden');
}

// === ОБРАБОТЧИКИ ===
document.getElementById('nickname-input').addEventListener('input', (e) => { myNickname = e.target.value.trim() || 'Player1'; });
document.getElementById('room-input').addEventListener('input', (e) => {
    const roomId = e.target.value.trim();
    if (roomId && socket && isConnected) socket.emit('check-room', { roomId });
});

document.getElementById('create-room-btn').onclick = () => {
    const roomId = document.getElementById('room-input').value.trim();
    const password = document.getElementById('password-input').value;
    if (!roomId) return showError('Ошибка', 'Введите название комнаты!');
    socket.emit('create-room', { roomId, password, nickname: myNickname, playerId: myPlayerId });
};

document.getElementById('join-room-btn').onclick = () => {
    const roomId = document.getElementById('room-input').value.trim();
    const password = document.getElementById('password-input').value;
    if (!roomId) return showError('Ошибка', 'Введите название комнаты!');
    socket.emit('join-room', { roomId, password, nickname: myNickname, playerId: myPlayerId });
};

document.getElementById('play-single-btn').onclick = () => {
    document.getElementById('multiplayer-menu').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
};

document.getElementById('error-close-btn').onclick = () => document.getElementById('error-modal').classList.add('hidden');

// АДМИНКА
document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
        e.preventDefault();
        if (!isAdminAuthenticated) document.getElementById('admin-login-modal').classList.remove('hidden');
        else {
            document.getElementById('admin-panel').classList.remove('hidden');
            socket.emit('request-rooms-list');
        }
    }
    if (e.key === 'Escape') {
        document.getElementById('admin-panel').classList.add('hidden');
        document.getElementById('admin-login-modal').classList.add('hidden');
    }
});

document.getElementById('admin-login-btn').onclick = () => {
    const pass = document.getElementById('admin-pass-input').value;
    socket.emit('check-admin-password', pass);
};
document.getElementById('admin-cancel-login-btn').onclick = () => document.getElementById('admin-login-modal').classList.add('hidden');
document.getElementById('close-admin-btn').onclick = () => document.getElementById('admin-panel').classList.add('hidden');
document.getElementById('refresh-rooms-btn').onclick = () => socket.emit('request-rooms-list');

// Обработчик кастомного ID в админке
document.getElementById('admin-set-id-btn').onclick = () => {
    const newId = document.getElementById('admin-custom-id').value.trim();
    if (newId) {
        myPlayerId = newId;
        localStorage.setItem('playerId', myPlayerId);
        document.getElementById('player-id-display').textContent = `🆔 ${myPlayerId}`;
        document.getElementById('admin-current-id').textContent = myPlayerId;
        document.getElementById('admin-custom-id').value = '';
        alert(`✅ ID изменён на: ${myPlayerId}`);
    }
};

document.getElementById('admin-ai-slider').oninput = function() {
    document.getElementById('admin-ai-val').textContent = this.value;
    if (currentAdminRoom) socket.emit('admin-command', { roomId: currentAdminRoom, action: 'set-difficulty', value: parseInt(this.value), nickname: myNickname, playerId: myPlayerId });
};
document.getElementById('admin-hunger-slider').oninput = function() {
    document.getElementById('admin-hunger-val').textContent = this.value;
    if (currentAdminRoom) socket.emit('update-game', { roomId: currentAdminRoom, state: { catHunger: parseInt(this.value) }, nickname: myNickname, playerId: myPlayerId });
};

// ИГРОВЫЕ КНОПКИ
document.getElementById('door-left-btn').onclick = function() {
    if (!gameStarted || gamePaused || gameState.power <= 0 || gameState.isGameOver) return;
    gameState.doorLeftClosed = !gameState.doorLeftClosed;
    playSound('door');
    this.textContent = gameState.doorLeftClosed ? ' ОТКРЫТЬ' : '🚪 ДВЕРЬ';
    this.classList.toggle('active', gameState.doorLeftClosed);
    sendGameStateUpdate({ doorLeftClosed: gameState.doorLeftClosed });
};

document.getElementById('door-right-btn').onclick = function() {
    if (!gameStarted || gamePaused || gameState.power <= 0 || gameState.isGameOver) return;
    gameState.doorRightClosed = !gameState.doorRightClosed;
    playSound('door');
    this.textContent = gameState.doorRightClosed ? ' ОТКРЫТЬ' : '🚪 ДВЕРЬ';
    this.classList.toggle('active', gameState.doorRightClosed);
    sendGameStateUpdate({ doorRightClosed: gameState.doorRightClosed });
};

document.getElementById('light-left-btn').onclick = function() {
    if (!gameStarted || gamePaused || gameState.power <= 0 || gameState.isGameOver) return;
    gameState.lightLeft = !gameState.lightLeft; gameState.lightRight = false;
    playSound('light');
    this.classList.toggle('active', gameState.lightLeft);
    document.getElementById('light-right-btn').classList.remove('active');
    sendGameStateUpdate({ lightLeft: gameState.lightLeft, lightRight: gameState.lightRight });
};

document.getElementById('light-right-btn').onclick = function() {
    if (!gameStarted || gamePaused || gameState.power <= 0 || gameState.isGameOver) return;
    gameState.lightRight = !gameState.lightRight; gameState.lightLeft = false;
    playSound('light');
    this.classList.toggle('active', gameState.lightRight);
    document.getElementById('light-left-btn').classList.remove('active');
    sendGameStateUpdate({ lightLeft: gameState.lightLeft, lightRight: gameState.lightRight });
};

document.getElementById('camera-btn').onclick = function() {
    if (!gameStarted || gamePaused || gameState.power <= 0 || gameState.isGameOver) return;
    gameState.cameraOpen = !gameState.cameraOpen;
    playSound('camera');
    this.classList.toggle('active', gameState.cameraOpen);
    document.getElementById('camera-system').classList.toggle('hidden', !gameState.cameraOpen);
};
document.getElementById('exit-camera-btn').onclick = function() {
    gameState.cameraOpen = false;
    document.getElementById('camera-btn').classList.remove('active');
    document.getElementById('camera-system').classList.add('hidden');
};

document.getElementById('feed-cat-btn').onclick = function() {
    if (!gameStarted || gameState.isGameOver) return;
    if (gameState.foodInventory > 0) {
        gameState.catHunger = Math.max(0, gameState.catHunger - 40);
        gameState.foodInventory--;
        playSound('cat');
        sendGameStateUpdate({ catHunger: gameState.catHunger, foodInventory: gameState.foodInventory });
    }
};

document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.onclick = function() {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        gameState.currentCamera = parseInt(this.dataset.cam);
        document.getElementById('camera-label').textContent = cameras[gameState.currentCamera].name;
    };
});

// ЧАТ В ИГРЕ
document.getElementById('chat-toggle-btn').onclick = () => document.getElementById('game-chat').classList.toggle('hidden');
document.getElementById('close-chat-btn').onclick = () => document.getElementById('game-chat').classList.add('hidden');
document.getElementById('send-chat-btn').onclick = () => {
    const input = document.getElementById('chat-message-input');
    const msg = input.value.trim();
    if (msg && currentRoom) {
        socket.emit('send-chat-message', { roomId: currentRoom, message: msg, type: 'player', nickname: myNickname, playerId: myPlayerId });
        input.value = '';
    }
};
document.getElementById('chat-message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('send-chat-btn').click();
});

// СТАРТОВОЕ МЕНЮ
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('maxNightUnlocked');
    if (saved) {
        maxNightUnlocked = parseInt(saved);
        document.querySelectorAll('.night-btn').forEach(btn => {
            if (parseInt(btn.dataset.night) <= maxNightUnlocked) btn.classList.remove('locked');
        });
    }
    document.getElementById('new-game-btn').onclick = () => startGame(1);
    document.getElementById('continue-btn').onclick = () => startGame(maxNightUnlocked);
    document.getElementById('night-select-btn').onclick = () => showMenu('night-select-menu');
    document.getElementById('custom-night-btn').onclick = () => showMenu('custom-night-menu');
    document.querySelectorAll('.night-btn').forEach(btn => {
        btn.onclick = function() { if (!this.classList.contains('locked')) startGame(parseInt(this.dataset.night)); };
    });
    document.getElementById('speed-slider').oninput = function() { customSettings.speed = parseInt(this.value); document.getElementById('speed-val').textContent = this.value; };
    document.getElementById('power-slider').oninput = function() { customSettings.power = parseInt(this.value); document.getElementById('power-val').textContent = this.value; };
    document.getElementById('hunger-slider').oninput = function() { customSettings.hunger = parseInt(this.value); document.getElementById('hunger-val').textContent = this.value; };
    document.getElementById('start-custom-btn').onclick = () => startGame(0, true);
    document.getElementById('back-to-menu-1').onclick = () => showMenu('main-menu');
    document.getElementById('back-to-menu-2').onclick = () => showMenu('main-menu');
    document.getElementById('menu-btn').onclick = () => { gamePaused = true; showMenu('pause-menu'); };
    document.getElementById('resume-btn').onclick = () => { gamePaused = false; showMenu(null); };
    document.getElementById('restart-btn').onclick = () => { gameStarted = false; showMenu('main-menu'); };
    document.getElementById('quit-btn').onclick = () => location.reload();
});

document.addEventListener('keydown', (e) => {
    if (!gameStarted || gamePaused || gameState.cameraOpen) return;
    if (e.key === 'a' || e.key === 'ArrowLeft') gameState.playerRotation = -1;
    else if (e.key === 'd' || e.key === 'ArrowRight') gameState.playerRotation = 1;
    else if (e.key === 'w' || e.key === 'ArrowUp') gameState.playerRotation = 0;
    else if (e.key === 's' || e.key === 'ArrowDown') gameState.playerRotation = 2;
});
document.addEventListener('keyup', (e) => {
    if (['a','d','w','s','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) gameState.playerRotation = 0;
});

document.addEventListener('click', () => { if (gameStarted && !gamePaused) sounds.ambient.play().catch(() => {}); }, { once: true });