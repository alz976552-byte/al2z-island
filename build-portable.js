const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'Al2z Island');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist');
const MUSIC_GUIDE = path.join(ROOT, 'music', 'HOW_TO_ADD_MUSIC.txt');

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

async function main() {
  if (!fs.existsSync(ELECTRON)) {
    throw new Error('Electron dist not found. Run "npm install" first.');
  }

  rm(DIST);
  fs.mkdirSync(OUT, { recursive: true });

  console.log('Copying Electron runtime...');
  fs.cpSync(ELECTRON, OUT, { recursive: true });

  const oldExe = path.join(OUT, 'electron.exe');
  const newExe = path.join(OUT, 'Al2z Island.exe');
  if (fs.existsSync(oldExe)) fs.renameSync(oldExe, newExe);

  const defApp = path.join(OUT, 'resources', 'default_app.asar');
  if (fs.existsSync(defApp)) fs.rmSync(defApp);

  console.log('Copying app files...');
  const appDir = path.join(OUT, 'resources', 'app');
  fs.mkdirSync(appDir, { recursive: true });

  const files = [
    'package.json',
    'main.js',
    'preload.js',
    'island.html',
    'icon.ico',
    'icon-mascot.png'
  ];
  for (const f of files) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(appDir, f));
  }

  console.log('Adding music guide (no audio bundled)...');
  const musicDir = path.join(appDir, 'music');
  fs.mkdirSync(musicDir, { recursive: true });
  if (fs.existsSync(MUSIC_GUIDE)) {
    fs.copyFileSync(MUSIC_GUIDE, path.join(musicDir, 'HOW_TO_ADD_MUSIC.txt'));
  }

  // README for the friend
  const readme = [
    'Al2z Island - портативная версия',
    '',
    '1. Распакуйте эту папку целиком в любое место (например, на рабочий стол).',
    '2. Запустите "Al2z Island.exe".',
    '3. Островок появится сверху по центру экрана.',
    '',
    'Управление:',
    '- Клик по островку — быстрые действия (скриншот, музыка, погода и другое).',
    '- Нижний край тянется к курсору, лицо следует за ним.',
    '- В шапке или быстрых действиях можно переключить лицо: глаза / Claude Code.',
    '- Тема (палитра в шапке или точки в меню): тёмная, жидкое стекло, красный, зелёный, оранжевый.',
    '- Сворачивается автоматически, если не наводить мышь.',
    '- Тестовое уведомление о загрузке: Ctrl+Shift+N или пункт в трее.',
    '- Выход: значок в трее -> "Выход" либо Ctrl+Shift+Q.',
    '',
    'Музыка НЕ встроена. См. resources\\app\\music\\HOW_TO_ADD_MUSIC.txt',
    ''
  ].join('\r\n');
  fs.writeFileSync(path.join(OUT, 'Как запустить.txt'), readme, 'utf8');

  // Set exe icon / metadata if rcedit is available
  try {
    const { rcedit } = require('rcedit');
    await rcedit(newExe, {
      icon: path.join(ROOT, 'icon.ico'),
      'version-string': {
        ProductName: 'Al2z Island',
        FileDescription: 'Al2z Island',
        CompanyName: 'Al2z',
        OriginalFilename: 'Al2z Island.exe'
      }
    });
    console.log('Exe icon and metadata set.');
  } catch (err) {
    console.warn('rcedit skipped:', err.message);
  }

  console.log('DONE ->', OUT);
}

main().catch((err) => {
  console.error('BUILD FAILED:', err);
  process.exit(1);
});
