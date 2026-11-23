const { app, BrowserWindow, ipcMain, screen, globalShortcut, desktopCapturer, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');

// Размеры островка для каждого состояния (ширина, высота) — как в island.html
const STATE_SIZES = {
  idle:    { w: 168, h: 56 },  // 32px pill + место для эластичного выгиба
  notif:   { w: 320, h: 58 },
  menu:    { w: 372, h: 292 },
  shot:    { w: 340, h: 112 },
  time:    { w: 300, h: 132 },
  weather: { w: 360, h: 252 },
  sw:      { w: 300, h: 152 },
  calc:    { w: 300, h: 276 },
  music:   { w: 256, h: 190 },
  game:    { w: 300, h: 286 }
};

const TOP_GAP = 8;      // отступ сверху у .isl (margin-top)
const COLLAPSE_MS = 560; // длительность анимации сворачивания

let mainWindow = null;
let tray = null;
let collapseTimer = null;
let cursorTimer = null;
let currentState = 'idle';
let mouseIgnored = null;
let lastCursor = null;

function applyStateSize(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const size = STATE_SIZES[state] || STATE_SIZES.idle;
  const w = size.w;
  const h = size.h + TOP_GAP;

  const display = mainWindow
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const area = display.workArea;

  const x = Math.round(area.x + (area.width - w) / 2);
  const y = area.y;

  mainWindow.setBounds({ x, y, width: w, height: h });
  if (state === 'idle') updateCursor();
}

function setMouseIgnored(ignore) {
  if (!mainWindow || mainWindow.isDestroyed() || mouseIgnored === ignore) return;
  mouseIgnored = ignore;
  mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
}

// Та же формула, что и в island.html: нижний край тянется к курсору.
function sagForCursor(pos) {
  const dx = pos.x - 84;
  if (pos.y <= 38) return 0;
  const dist = Math.max(0, pos.y - 38);
  const near = Math.max(0, 1 - Math.abs(dx) / 115);
  return Math.max(0, 13 - dist * 0.22) * near;
}

function updateCursor() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;

  const point = screen.getCursorScreenPoint();
  const bounds = mainWindow.getBounds();
  const pos = {
    x: Math.round(point.x - bounds.x),
    y: Math.round(point.y - bounds.y)
  };

  if (!lastCursor || lastCursor.x !== pos.x || lastCursor.y !== pos.y) {
    lastCursor = pos;
    mainWindow.webContents.send('cursor', pos);
  }

  if (currentState !== 'idle') {
    setMouseIgnored(false);
    return;
  }

  const sag = sagForCursor(pos);
  // Клик по самой капсуле работает, всё остальное (включая выгиб)
  // пропускает клики дальше, на рабочий стол.
  const inside =
    pos.x >= 1 &&
    pos.x <= STATE_SIZES.idle.w - 1 &&
    pos.y >= 8 &&
    pos.y <= 8 + 32 + Math.max(0, sag) + 3;

  setMouseIgnored(!inside);
}

function startCursorTracking() {
  clearInterval(cursorTimer);
  lastCursor = null;
  mouseIgnored = null;
  updateCursor();
  cursorTimer = setInterval(updateCursor, 16);
}

function setState(state) {
  clearTimeout(collapseTimer);
  currentState = state;
  if (state !== 'idle') setMouseIgnored(false);

  if (state === 'idle') {
    // Ждём, пока островок анимированно сожмётся, затем уменьшаем окно
    collapseTimer = setTimeout(() => applyStateSize('idle'), COLLAPSE_MS);
  } else {
    applyStateSize(state);
  }
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const w = STATE_SIZES.idle.w;
  const h = STATE_SIZES.idle.h + TOP_GAP;

  mainWindow = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(area.x + (area.width - w) / 2),
    y: area.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    focusable: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.loadFile('island.html');
  mainWindow.webContents.once('did-finish-load', () => {
    lastCursor = null;
    updateCursor();
  });
  startCursorTracking();

  mainWindow.on('closed', () => {
    clearInterval(cursorTimer);
    cursorTimer = null;
    mouseIgnored = null;
    lastCursor = null;
    mainWindow = null;
  });
}

function sendDemoNotification() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.webContents.send('notify', 'Загрузка завершена', 'presentation.pdf');
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'icon.ico');
    const image = nativeImage.createFromPath(iconPath);
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  } catch (err) {
    console.error('Tray icon error:', err);
    return;
  }

  tray.setToolTip('Al2z Island');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Показать / Скрыть',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Свернуть островок',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          mainWindow.webContents
            .executeJavaScript('window.al2zSetState && window.al2zSetState("idle")')
            .catch(() => {});
        }
      },
      {
        label: 'Тестовое уведомление',
        click: sendDemoNotification
      },
      { type: 'separator' },
      { label: 'Выход', click: () => app.quit() }
    ])
  );

  tray.on('double-click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Аварийный выход (окно скрыто из панели задач)
  globalShortcut.register('Control+Shift+Q', () => app.quit());
  globalShortcut.register('Control+Shift+N', sendDemoNotification);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Музыка -------------------------------------------------------------

function prettyTitle(fileName) {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/_+/g, ' ')
    .replace(/\s*\(mp3\.pm\)\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

ipcMain.handle('listMusic', async () => {
  // Сначала ищем встроенную папку music рядом с приложением,
  // иначе — папку в профиле пользователя.
  const bundledFolder = path.join(__dirname, 'music');
  const userFolder = path.join(process.env.USERPROFILE, 'Music', 'THE ULTRAKILL OST');
  const musicFolder = fs.existsSync(bundledFolder) ? bundledFolder : userFolder;

  try {
    const files = await fs.promises.readdir(musicFolder);
    return files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp3', '.ogg', '.wav', '.aac', '.flac', '.m4a', '.opus'].includes(ext);
      })
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map((file) => {
        const fullPath = path.join(musicFolder, file);
        const base = path.basename(file, path.extname(file));
        const lrcPath = path.join(musicFolder, `${base}.lrc`);
        return {
          title: prettyTitle(file),
          artist: 'ULTRAKILL',
          album: 'THE ULTRAKILL OST',
          url: pathToFileURL(fullPath).href,
          lrc: fs.existsSync(lrcPath) ? pathToFileURL(lrcPath).href : null,
          duration: 0
        };
      });
  } catch (err) {
    console.error('Error reading music folder:', err);
    return [];
  }
});

ipcMain.handle('readLyrics', async (event, url) => {
  try {
    if (!url) return '';
    const filePath = fileURLToPath(url);
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size > 1024 * 1024) return '';
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (err) {
    return '';
  }
});

// --- Погода -------------------------------------------------------------

let weatherCache = { at: 0, data: null };
const WEATHER_TTL = 15 * 60 * 1000;

const CITY_RU = {
  Moscow: 'Москва',
  Pushkino: 'Пушкино',
  Mytishchi: 'Мытищи',
  Korolev: 'Королёв',
  Khimki: 'Химки',
  Odintsovo: 'Одинцово',
  Balashikha: 'Балашиха',
  Lyubertsy: 'Люберцы',
  Krasnogorsk: 'Красногорск',
  Podolsk: 'Подольск',
  'Saint Petersburg': 'Санкт-Петербург',
  'Nizhny Novgorod': 'Нижний Новгород',
  'Yekaterinburg': 'Екатеринбург',
  Kazan: 'Казань',
  Novosibirsk: 'Новосибирск',
  Samara: 'Самара',
  Omsk: 'Омск',
  Rostov: 'Ростов-на-Дону',
  Krasnodar: 'Краснодар'
};

// Москва — источник погоды; город берём по IP только если он рядом.
const WEATHER_LAT = 55.7558;
const WEATHER_LON = 37.6173;

function isNearMoscow(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  const dLat = (lat - WEATHER_LAT) * 111;
  const dLon = (lon - WEATHER_LON) * 111 * Math.cos((WEATHER_LAT * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon) < 90;
}

ipcMain.handle('getWeather', async () => {
  if (weatherCache.data && Date.now() - weatherCache.at < WEATHER_TTL) {
    return weatherCache.data;
  }

  try {
    let city = 'Москва';

    // Геолокация по IP — необязательный бонус, без неё просто Москва.
    try {
      const geoRes = await fetch('https://ipwho.is/', {
        signal: AbortSignal.timeout(4000)
      });
      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo.success && isNearMoscow(geo.latitude, geo.longitude) && geo.city) {
          city = CITY_RU[geo.city] || geo.city;
        }
      }
    } catch (err) {
      // остаёмся на Москве
    }

    // Gismeteo отдаёт текущую погоду прямо в HTML (open-meteo и wttr.in
    // в РФ периодически недоступны).
    const res = await fetch('https://www.gismeteo.ru/weather-moscow-4368/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return weatherCache.data;

    const html = await res.text();
    const match = html.match(
      /"cw":\{"temperature":(-?\d+(?:\.\d+)?),"icon":"([^"]+)","description":"([^"]*)"/
    );
    if (!match) return weatherCache.data;

    const temp = Math.round(Number(match[1]));
    const kind = match[2].split('_').pop();
    const desc = match[3] || '';

    let type = 'cloud';
    if (kind.startsWith('c0')) type = 'sun';
    else if (kind.startsWith('c1') || kind.startsWith('c2')) type = 'partly';
    else if (kind.startsWith('c3')) type = 'cloud';
    else if (kind.startsWith('r')) type = 'rain';
    else if (kind.startsWith('s')) type = 'snow';
    else if (kind.startsWith('t')) type = 'storm';
    else if (kind.startsWith('f')) type = 'fog';

    const data = { temp, type, desc, city };
    weatherCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    return weatherCache.data;
  }
});

ipcMain.handle('screenshot', async () => {
  try {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;
    const scale = display.scaleFactor || 1;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(width * scale),
        height: Math.round(height * scale)
      }
    });

    if (!sources.length) return { error: 'No screen source' };

    const image = sources[0].thumbnail.toPNG();
    const savePath = path.join(
      process.env.USERPROFILE,
      'Desktop',
      `screenshot_${Date.now()}.png`
    );
    fs.writeFileSync(savePath, image);

    return {
      dataUrl: `data:image/png;base64,${image.toString('base64')}`,
      path: savePath
    };
  } catch (err) {
    console.error('Error taking screenshot:', err);
    return { error: 'Failed to take screenshot' };
  }
});

// --- Подстройка окна под состояние островка -----------------------------

ipcMain.on('island-state', (event, state) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow) return;
  setState(state);
});
