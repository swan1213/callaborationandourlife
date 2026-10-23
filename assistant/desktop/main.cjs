// Interview Assistant for Windows (the installed app). Runs the assistant's local server (server/index.cjs) in the
// background with a tray icon, starts with Windows and updates itself from GitHub Releases. The UI itself opens in
// the browser (Chrome or Edge: "On top" needs it), at the address TailorBid's Interview Assistant button opens.
const path = require('node:path');
const fs = require('node:fs');
const { app, dialog, Menu, nativeImage, shell, Tray } = require('electron');

// Electron's own files (cache, first-run mark) in a subfolder: the folder named after the app already holds the
// assistant's settings and prep sheets (server/paths.cjs).
app.setPath('userData', path.join(app.getPath('appData'), 'Interview Assistant', 'desktop'));

// One copy only: a second launch (Start menu, installer) just opens the assistant.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let tray = null;
  let url = '';
  const openUi = () => url && shell.openExternal(url);

  // Started with Windows: stay in the tray. Opened by the person: show the assistant.
  const startedHidden = process.argv.includes('--hidden');
  const firstRunMark = () => path.join(app.getPath('userData'), 'first-run-done');

  function setStartWithWindows(on) {
    app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
    buildMenu();
  }

  function buildMenu() {
    const startsWithWindows = app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Interview Assistant', click: openUi },
        { type: 'separator' },
        {
          label: 'Start with Windows',
          type: 'checkbox',
          checked: startsWithWindows,
          click: (item) => setStartWithWindows(item.checked),
        },
        { label: 'Check for updates', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { label: `Version ${app.getVersion()}`, enabled: false },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
  }

  // Updates come from the GitHub releases this app is published to (electron-builder.yml). They download in the
  // background and install when the app quits (or right away when the person chooses to restart).
  function checkForUpdates(manual = false) {
    if (!app.isPackaged) return;
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.once('update-downloaded', async (info) => {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Interview Assistant',
        message: `Version ${info.version} is ready.`,
        detail: 'Restart now to use it, or it will be installed the next time the assistant closes.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
      });
      if (response === 0) autoUpdater.quitAndInstall();
    });
    if (manual)
      autoUpdater.once('update-not-available', () =>
        dialog.showMessageBox({ type: 'info', title: 'Interview Assistant', message: 'You have the latest version.' }),
      );
    autoUpdater.checkForUpdates().catch((err) => {
      if (manual)
        dialog.showMessageBox({
          type: 'warning',
          title: 'Interview Assistant',
          message: 'Could not check for updates.',
          detail: err.message,
        });
    });
  }

  app.on('second-instance', openUi);
  // No windows of its own: closing the browser tab must not quit the assistant.
  app.on('window-all-closed', () => {});

  app.whenReady().then(() => {
    const { PORT } = require('../server/env.cjs');
    url = `http://127.0.0.1:${PORT}`;
    require('../server/index.cjs'); // starts the local server; it stops captions and hotkeys when the app quits

    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')));
    tray.setToolTip('Interview Assistant');
    tray.on('click', openUi);
    buildMenu();

    // First run after installing: start with Windows from now on, so TailorBid's button always works.
    if (!fs.existsSync(firstRunMark())) {
      fs.mkdirSync(path.dirname(firstRunMark()), { recursive: true });
      fs.writeFileSync(firstRunMark(), new Date().toISOString());
      if (app.isPackaged && !process.env.IA_NO_AUTOSTART) setStartWithWindows(true);
    }
    if (!startedHidden) openUi();

    checkForUpdates();
    setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
  });
}
