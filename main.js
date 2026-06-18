const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        fullscreen: true,
        title: '5 Ночей с Классухой',
        icon: path.join(__dirname, 'icon.ico'),
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            devTools: false
        },
        show: false
    });

    win.loadFile('index.html');
    win.setMenuBarVisibility(false);
    Menu.setApplicationMenu(null);
    
    win.once('ready-to-show', () => {
        win.show();
    });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { app.quit(); });
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});