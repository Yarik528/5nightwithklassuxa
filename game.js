// === НАСТРОЙКИ ===
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

// === МУЛЬТИПЛЕЕР ===
const SERVER_URL = 'https://5bb4cbfa-2c6d-4594-9e0e-a390b02aad22-00-1vfzoka5fshcd.sisko.replit.dev/'; // ЗАМЕНИ НА СВОЙ URL!
let socket = null;
let isConnected = false;
let currentRoom = 'room1';

function connectToServer() {
    socket = io(SERVER_URL);
    
    socket.on('connect', () => {
        console.log('✅ Подключено к серверу!');
        isConnected = true;
        document.getElementById('connection-status').textContent = '✅ Подключено!';
        document.getElementById('connection-status').style.color = '#0f0';
        document.getElementById('multiplayer-indicator').textContent = ' Онлайн';
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Отключено от сервера');
        isConnected = false;
        document.getElementById('connection-status').textContent = '❌ Отключено';
        document.getElementById('connection-status').style.color = '#f00';
        document.getElementById('multiplayer-indicator').textContent = '🔴 Офлайн';
    });
    
    socket.on('game-state', (state) => {
        console.log('📥 Получено состояние игры:', state);
        Object.assign(gameState, state);
    });
    
    socket.on('game-updated', (state) => {
        console.log('🔄 Игра обновлена:', state);
        Object.assign(gameState, state);
    });
    
    socket.on('player-joined', (playerId) => {
        console.log('👤 Игрок присоединился:', playerId);
    });
    
    socket.on('player-left', (playerId) => {
        console.log('👤 Игрок вышел:', playerId);
    });
}

function joinRoom(roomId) {
    if (socket) {
        currentRoom = roomId;
        socket.emit('join-room', roomId);
        console.log(' Присоединился к комнате:', roomId);
    }
}

function sendGameStateUpdate(updates) {
    if (socket && isConnected) {
        socket.emit('update-game', {
            roomId: currentRoom,
            state: updates
        });
    }
}

connectToServer();

// === ПЕРЕМЕННЫЕ МЕНЮ ===
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

let gameState = {
    power: 100, doorLeftClosed: false, doorRightClosed: false,
    lightLeft: false, lightRight: false, cameraOpen: false,
    currentCamera: 0, catHunger: 0, gameTime: 0,
    night: 1, klassukhaPosition: 0, isGameOver: false,
    catInRoom: true, aiSpeed: 1,
    playerRotation: 0, foodInventory: 0,
    isCooking: false, cookProgress: 0, cookTime: 100
};

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
        if (assets.bg.complete && assets.bg.naturalWidth > 0) {
            ctx.drawImage(assets.bg, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#16213e';
            ctx.fillRect(0, 0, canvas.width, canvas.height * 0.6);
            ctx.fillStyle = '#0f3460';
            ctx.fillRect(0, canvas.height * 0.6, canvas.width, canvas.height * 0.4);
            ctx.fillStyle = '#2d5016';
            ctx.fillRect(canvas.width/2 - 200, 80, 400, 180);
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 8;
            ctx.strokeRect(canvas.width/2 - 200, 80, 400, 180);
            ctx.fillStyle = '#fff';
            ctx.font = '20px "Press Start 2P"';
            ctx.fillText('НЕ СМОТРИ', canvas.width/2 - 130, 160);
            ctx.fillText('ОНА СМОТРИТ', canvas.width/2 - 180, 210);
            ctx.fillStyle = '#8B4513';
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    ctx.fillRect(150 + i * 200, 350 + j * 120, 120, 80);
                }
            }
        }
    } else if (gameState.playerRotation === -1) {
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width * 0.3, canvas.height);
        ctx.fillStyle = '#34495e';
        ctx.fillRect(0, canvas.height * 0.2, canvas.width * 0.3, canvas.height * 0.6);
        ctx.fillStyle = '#fff';
        ctx.font = '30px "Press Start 2P"';
        ctx.fillText('ЛЕВАЯ ДВЕРЬ', 50, canvas.height / 2);
    } else if (gameState.playerRotation === 1) {
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(canvas.width * 0.7, 0, canvas.width * 0.3, canvas.height);
        ctx.fillStyle = '#34495e';
        ctx.fillRect(canvas.width * 0.7, canvas.height * 0.2, canvas.width * 0.3, canvas.height * 0.6);
        ctx.fillStyle = '#fff';
        ctx.font = '30px "Press Start 2P"';
        ctx.fillText('ПРАВАЯ ДВЕРЬ', canvas.width - 350, canvas.height / 2);
    } else if (gameState.playerRotation === 2) {
        if (assets.kitchen.complete && assets.kitchen.naturalWidth > 0) {
            ctx.drawImage(assets.kitchen, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#34495e';
            ctx.fillRect(0, canvas.height * 0.5, canvas.width, canvas.height * 0.5);
            ctx.fillStyle = '#7f8c8d';
            ctx.fillRect(canvas.width/2 - 150, canvas.height * 0.6, 300, 150);
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(canvas.width/2 - 100, canvas.height * 0.65, 80, 80);
            ctx.fillRect(canvas.width/2 + 20, canvas.height * 0.65, 80, 80);
            ctx.fillStyle = '#fff';
            ctx.font = '30px "Press Start 2P"';
            ctx.fillText('КУХНЯ', canvas.width/2 - 100, canvas.height * 0.4);
        }
    }
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!gameStarted) return;

    if (gameState.cameraOpen) {
        ctx.fillStyle = '#0a1a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < 100; i++) {
            ctx.fillStyle = `rgba(0,255,0,${Math.random()*0.1})`;
            ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 10, 5);
        }
        ctx.fillStyle = '#0f0';
        ctx.font = 'bold 32px "Press Start 2P"';
        ctx.fillText(cameras[gameState.currentCamera].name, 50, 80);
        if (cameras[gameState.currentCamera].hasCat && assets.cat.complete) {
            ctx.drawImage(assets.cat, canvas.width/2-100, canvas.height/2-100, 200, 200);
        }
        if (gameState.klassukhaPosition > 0 && assets.klassukha.complete) {
            ctx.drawImage(assets.klassukha, 100, 200, 200, 300);
        }
    } else {
        drawBackground();
        if (gameState.playerRotation === 0 && !gameState.lightLeft && !gameState.lightRight) {
            ctx.fillStyle = 'rgba(0,0,0,0.9)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(0,50,0,0.3)';
            ctx.fillRect(canvas.width/2 - 150, canvas.height/2 - 80, 300, 160);
        }
        if (gameState.playerRotation === 0 && gameState.catInRoom && assets.cat.complete) {
            ctx.drawImage(assets.cat, canvas.width/2-100, canvas.height-300, 200, 200);
        }
        if (gameState.playerRotation === -1 && gameState.lightLeft && gameState.klassukhaPosition >= 4 && assets.klassukha.complete) {
            ctx.drawImage(assets.klassukha, 50, 100, 200, 400);
        }
        if (gameState.playerRotation === 1 && gameState.lightRight && gameState.klassukhaPosition === 5 && assets.klassukha.complete) {
            ctx.drawImage(assets.klassukha, canvas.width-250, 100, 200, 400);
        }
        if (gameState.playerRotation === -1 && gameState.doorLeftClosed) {
            ctx.fillStyle = '#34495e';
            ctx.fillRect(0, 0, canvas.width * 0.3, canvas.height);
        }
        if (gameState.playerRotation === 1 && gameState.doorRightClosed) {
            ctx.fillStyle = '#34495e';
            ctx.fillRect(canvas.width * 0.7, 0, canvas.width * 0.3, canvas.height);
        }
        if (gameState.isCooking) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(canvas.width/2 - 200, 50, 400, 60);
            ctx.fillStyle = '#0f0';
            ctx.fillRect(canvas.width/2 - 190, 60, 380 * (gameState.cookProgress / gameState.cookTime), 40);
            ctx.fillStyle = '#fff';
            ctx.font = '20px "Press Start 2P"';
            ctx.fillText('ГОТОВКА...', canvas.width/2 - 100, 90);
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
    setTimeout(() => {
        alert(`🎉 6:00 AM!\n\nТЫ ВЫЖИЛ! Ночь ${currentNight} пройдена!`);
        showMenu('main-menu');
    }, 1000);
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function showMenu(menuId) {
    document.querySelectorAll('.menu-screen').forEach(m => m.classList.add('hidden'));
    document.getElementById('game-screen').classList.add('hidden');
    if (menuId) document.getElementById(menuId).classList.remove('hidden');
}

function startGame(night, isCustom = false) {
    currentNight = night;
    gameStarted = true;
    gamePaused = false;
    
    const settings = isCustom ? customSettings : nightSettings[night];
    gameState = {
        power: settings.power, doorLeftClosed: false, doorRightClosed: false,
        lightLeft: false, lightRight: false, cameraOpen: false,
        currentCamera: 0, catHunger: isCustom ? settings.hunger : 0,
        gameTime: 0, night: night, klassukhaPosition: 0,
        isGameOver: false, catInRoom: true, aiSpeed: settings.speed,
        playerRotation: 0, foodInventory: 0,
        isCooking: false, cookProgress: 0, cookTime: 100
    };
    
    document.querySelectorAll('.menu-screen').forEach(m => m.classList.add('hidden'));
    document.getElementById('game-screen').classList.remove('hidden');
    nightDisplay.textContent = isCustom ? 'КАСТОМНАЯ НОЧЬ' : settings.name;
    
    document.getElementById('door-left-btn').textContent = ' ДВЕРЬ';
    document.getElementById('door-right-btn').textContent = '🚪 ДВЕРЬ';
    document.getElementById('door-left-btn').classList.remove('active');
    document.getElementById('door-right-btn').classList.remove('active');
    document.getElementById('light-left-btn').classList.remove('active');
    document.getElementById('light-right-btn').classList.remove('active');
    
    if (!loopStarted) {
        loopStarted = true;
        gameLoop();
    }
}

function unlockNight(night) {
    if (night > maxNightUnlocked) {
        maxNightUnlocked = night;
        localStorage.setItem('maxNightUnlocked', maxNightUnlocked);
    }
}

document.addEventListener('keydown', (e) => {
    if (!gameStarted || gamePaused || gameState.cameraOpen) return;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') gameState.playerRotation = -1;
    else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') gameState.playerRotation = 1;
    else if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') gameState.playerRotation = 0;
    else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') gameState.playerRotation = 2;
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft' || 
        e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight' ||
        e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp' ||
        e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        gameState.playerRotation = 0;
    }
});

// Мультиплеер меню
document.getElementById('join-room-btn').onclick = () => {
    const roomId = document.getElementById('room-input').value;
    joinRoom(roomId);
    document.getElementById('multiplayer-menu').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    gameStarted = true;
};

document.getElementById('create-room-btn').onclick = () => {
    const roomId = 'room-' + Math.random().toString(36).substr(2, 6);
    document.getElementById('room-input').value = roomId;
    joinRoom(roomId);
    document.getElementById('multiplayer-menu').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    gameStarted = true;
};

document.getElementById('play-single-btn').onclick = () => {
    document.getElementById('multiplayer-menu').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
};

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
        btn.onclick = function() {
            if (!this.classList.contains('locked')) startGame(parseInt(this.dataset.night));
        };
    });
    
    document.getElementById('speed-slider').oninput = function() {
        customSettings.speed = parseInt(this.value);
        document.getElementById('speed-val').textContent = this.value;
    };
    document.getElementById('power-slider').oninput = function() {
        customSettings.power = parseInt(this.value);
        document.getElementById('power-val').textContent = this.value;
    };
    document.getElementById('hunger-slider').oninput = function() {
        customSettings.hunger = parseInt(this.value);
        document.getElementById('hunger-val').textContent = this.value;
    };
    document.getElementById('start-custom-btn').onclick = () => startGame(0, true);
    document.getElementById('back-to-menu-1').onclick = () => showMenu('main-menu');
    document.getElementById('back-to-menu-2').onclick = () => showMenu('main-menu');
    
    document.getElementById('menu-btn').onclick = () => {
        gamePaused = true;
        showMenu('pause-menu');
    };
    document.getElementById('resume-btn').onclick = () => {
        gamePaused = false;
        showMenu(null);
    };
    document.getElementById('restart-btn').onclick = () => {
        gameStarted = false;
        showMenu('main-menu');
    };
    document.getElementById('quit-btn').onclick = () => location.reload();
});

document.getElementById('door-left-btn').onclick = function() {
    if (!gameStarted || gamePaused || gameState.power <= 0 || gameState.isGameOver) return;
    gameState.doorLeftClosed = !gameState.doorLeftClosed;
    playSound('door');
    this.textContent = gameState.doorLeftClosed ? '🚪 ОТКРЫТЬ' : ' ДВЕРЬ';
    this.classList.toggle('active', gameState.doorLeftClosed);
    sendGameStateUpdate({ doorLeftClosed: gameState.doorLeftClosed });
};

document.getElementById('door-right-btn').onclick = function() {
    if (!gameStarted || gamePaused || gameState.power <= 0 || gameState.isGameOver) return;
    gameState.doorRightClosed = !gameState.doorRightClosed;
    playSound('door');
    this.textContent = gameState.doorRightClosed ? '🚪 ОТКРЫТЬ' : ' ДВЕРЬ';
    this.classList.toggle('active', gameState.doorRightClosed);
    sendGameStateUpdate({ doorRightClosed: gameState.doorRightClosed });
};

document.getElementById('light-left-btn').onclick = function() {
    if (!gameStarted || gamePaused || gameState.power <= 0 || gameState.isGameOver) return;
    gameState.lightLeft = !gameState.lightLeft;
    gameState.lightRight = false;
    playSound('light');
    this.classList.toggle('active', gameState.lightLeft);
    document.getElementById('light-right-btn').classList.remove('active');
    sendGameStateUpdate({ lightLeft: gameState.lightLeft, lightRight: gameState.lightRight });
};

document.getElementById('light-right-btn').onclick = function() {
    if (!gameStarted || gamePaused || gameState.power <= 0 || gameState.isGameOver) return;
    gameState.lightRight = !gameState.lightRight;
    gameState.lightLeft = false;
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
    if (gameState.cameraOpen) playSound('static');
};

document.getElementById('exit-camera-btn').onclick = function() {
    if (gameState.cameraOpen) {
        gameState.cameraOpen = false;
        document.getElementById('camera-btn').classList.remove('active');
        document.getElementById('camera-system').classList.add('hidden');
    }
};

document.getElementById('feed-cat-btn').onclick = function() {
    if (!gameStarted || gameState.isGameOver) return;
    if (gameState.foodInventory > 0) {
        gameState.catHunger = Math.max(0, gameState.catHunger - 40);
        gameState.foodInventory--;
        playSound('cat');
        sendGameStateUpdate({ catHunger: gameState.catHunger, foodInventory: gameState.foodInventory });
    } else {
        alert('Нет еды! Повернись назад (S) и приготовь еду на кухне!');
    }
};

document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.onclick = function() {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        gameState.currentCamera = parseInt(this.dataset.cam);
        document.getElementById('camera-label').textContent = cameras[gameState.currentCamera].name;
        playSound('static');
    };
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && gameState.cameraOpen) {
        document.getElementById('exit-camera-btn').onclick();
    }
    if (e.key === 'F1') {
        e.preventDefault();
        document.getElementById('admin-panel').classList.toggle('hidden');
    }
});

document.addEventListener('click', () => {
    if (gameStarted && !gamePaused) sounds.ambient.play().catch(() => {});
}, { once: true });

// Админ панель
const adminPanel = document.getElementById('admin-panel');
const adminToggleBtn = document.createElement('button');
adminToggleBtn.id = 'admin-toggle-btn';
adminToggleBtn.textContent = 'ADMIN';
document.body.appendChild(adminToggleBtn);

adminToggleBtn.onclick = () => adminPanel.classList.toggle('hidden');
document.getElementById('close-admin-btn').onclick = () => adminPanel.classList.add('hidden');

document.getElementById('admin-ai-slider').oninput = function() {
    gameState.aiSpeed = parseInt(this.value);
    document.getElementById('admin-ai-val').textContent = this.value;
    sendGameStateUpdate({ aiSpeed: gameState.aiSpeed });
};

document.getElementById('admin-hunger-slider').oninput = function() {
    gameState.catHunger = parseInt(this.value);
    document.getElementById('admin-hunger-val').textContent = this.value;
    sendGameStateUpdate({ catHunger: gameState.catHunger });
};

document.getElementById('admin-add-power').onclick = () => {
    gameState.power = Math.min(100, gameState.power + 50);
    sendGameStateUpdate({ power: gameState.power });
};

document.getElementById('admin-add-food').onclick = () => {
    gameState.foodInventory += 5;
    sendGameStateUpdate({ foodInventory: gameState.foodInventory });
};

document.getElementById('admin-full-feed').onclick = () => {
    gameState.catHunger = 0;
    playSound('cat');
    sendGameStateUpdate({ catHunger: gameState.catHunger });
};

document.getElementById('admin-kill').onclick = jumpscare;

document.getElementById('admin-win').onclick = () => {
    gameState.gameTime = 59.9;
};

document.getElementById('admin-toggle-doors').onclick = () => {
    gameState.doorLeftClosed = !gameState.doorLeftClosed;
    gameState.doorRightClosed = !gameState.doorRightClosed;
    playSound('door');
    const leftBtn = document.getElementById('door-left-btn');
    const rightBtn = document.getElementById('door-right-btn');
    leftBtn.textContent = gameState.doorLeftClosed ? '🚪 ОТКРЫТЬ' : '🚪 ДВЕРЬ';
    rightBtn.textContent = gameState.doorRightClosed ? '🚪 ОТКРЫТЬ' : '🚪 ДВЕРЬ';
    leftBtn.classList.toggle('active', gameState.doorLeftClosed);
    rightBtn.classList.toggle('active', gameState.doorRightClosed);
    sendGameStateUpdate({ doorLeftClosed: gameState.doorLeftClosed, doorRightClosed: gameState.doorRightClosed });
};