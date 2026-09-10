'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const selectedFolders = new Set();
const MAX_OUTPUT = 1024 * 1024;
const MAX_TREE_ENTRIES = 5000;
const IGNORED_TREE_NAMES = new Set(['.git', 'node_modules', '.venv', 'venv', 'dist', 'build']);

function assertTrustedEvent(event) {
  const url = event.senderFrame?.url || '';
  if (!url.startsWith('file://')) throw new Error('Ugyldig foresp\u00f8rgsel');
}

function assertSelectedFolder(folderPath) {
  if (typeof folderPath !== 'string') throw new Error('Ugyldig mappe');
  const resolved = path.resolve(folderPath);
  if (!selectedFolders.has(resolved)) throw new Error('V\u00e6lg mappen igen i appen');
  return resolved;
}

function createWindowOptions(extra = {}) {
  return {
    ...extra,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...extra.webPreferences
    }
  };
}

function lockWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
}

function getGitCommand() {
  if (process.platform === 'win32' && app.isPackaged) {
    const bundledGit = path.join(process.resourcesPath, 'git-win', 'cmd', 'git.exe');
    if (fs.existsSync(bundledGit)) return bundledGit;
  }
  return 'git';
}

function runProcess(command, args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: options.env || process.env
    });

    let stdout = '';
    let stderr = '';
    let finished = false;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Kommandoen overskred tidsgr\u00e6nsen'));
    }, options.timeoutMs || 120000);
    const append = (current, chunk) => {
      const next = current + chunk.toString();
      return next.length > MAX_OUTPUT ? next.slice(0, MAX_OUTPUT) : next;
    };
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    child.on('error', error => {
      clearTimeout(timeout);
      if (!finished) {
        finished = true;
        reject(error);
      }
    });
    child.on('close', code => {
      clearTimeout(timeout);
      if (finished) return;
      finished = true;
      const result = { code, stdout, stderr };
      if (code === 0 || options.allowFailure) resolve(result);
      else reject(new Error((stderr || stdout || `${command} afsluttede med kode ${code}`).trim()));
    });
  });
}

function detectProjectType(folder) {
  if (fs.existsSync(path.join(folder, 'package.json'))) return 'node';
  if (
    fs.existsSync(path.join(folder, 'requirements.txt')) ||
    fs.existsSync(path.join(folder, 'pyproject.toml')) ||
    fs.existsSync(path.join(folder, 'setup.py'))
  ) return 'python';
  return 'unknown';
}

function getTestPreset(preset) {
  const python = process.platform === 'win32' ? 'python' : 'python3';

  const npmCommand = args => {
    if (process.platform === 'win32') {
      return [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args]];
    }
    return ['npm', args];
  };

  const presets = {
    'npm-test': npmCommand(['test']),
    'npm-lint': npmCommand(['run', 'lint']),
    'npm-build': npmCommand(['run', 'build']),
    'pytest': [python, ['-m', 'pytest']],
    'dotnet-test': ['dotnet', ['test']]
  };
  return presets[preset] || null;
}

function validateTestPreset(folder, preset) {
  if (preset.startsWith('npm-') && !fs.existsSync(path.join(folder, 'package.json'))) {
    throw new Error('Denne test kræver et Node.js-projekt, men package.json mangler i den valgte mappe.');
  }
}

function generateFileContent(type, options) {
  const projectName = String(options.projectName || 'Mit projekt').trim();
  const description = String(options.description || '').trim();
  const author = String(options.author || '').trim();
  const year = /^\d{4}$/.test(String(options.year)) ? String(options.year) : String(new Date().getFullYear());
  switch (type) {
    case 'gitignore':
      return detectProjectType(options.folder) === 'python'
        ? '__pycache__/\n*.py[cod]\n*.egg-info/\ndist/\nbuild/\n.env\n.venv/\nvenv/\n'
        : 'node_modules/\ndist/\nbuild/\n.env\n*.log\n';
    case 'readme':
      return `# ${projectName}\n\n${description || 'Tilf\u00f8j en kort projektbeskrivelse.'}\n\n## Kom godt i gang\n\nBeskriv installation og brug her.\n\n## Test\n\nBeskriv hvordan projektets tests k\u00f8res.\n`;
    case 'license':
      return `MIT License\n\nCopyright (c) ${year} ${author || 'RETTIGHEDSHAVER'}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.\nIN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`;
    case 'editorconfig':
      return 'root = true\n\n[*]\nindent_style = space\nindent_size = 2\nend_of_line = lf\ncharset = utf-8\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n';
    case 'contributing':
      return `# Bidrag til ${projectName}\n\n1. Opret en separat branch.\n2. Tilf\u00f8j eller opdat\u00e9r tests.\n3. K\u00f8r tests lokalt.\n4. Opret en pull request med en kort forklaring.\n`;
    case 'changelog':
      return '# Changelog\n\nAlle v\u00e6sentlige \u00e6ndringer dokumenteres her.\n\n## [Unreleased]\n';
    case 'ci-node':
      return `name: Node.js CI\n\non:\n  push:\n  pull_request:\n\npermissions:\n  contents: read\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - run: npm ci\n      - run: npm test\n`;
    case 'ci-python':
      return `name: Python CI\n\non:\n  push:\n  pull_request:\n\npermissions:\n  contents: read\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n          cache: pip\n      - run: pip install -r requirements.txt\n      - run: python -m pytest\n`;
    default:
      throw new Error('Ukendt filtype');
  }
}

function writeNewFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx' });
    return { path: filePath, status: 'oprettet' };
  } catch (error) {
    if (error.code === 'EEXIST') return { path: filePath, status: 'sprunget over (findes allerede)' };
    throw error;
  }
}

function parseGitHubRemote(remoteUrl) {
  let parsed;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    throw new Error('Remote-URL er ugyldig');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname.toLowerCase() !== 'github.com' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) throw new Error('Brug en ren HTTPS-URL fra github.com uden token');
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  if (!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(cleanPath)) {
    throw new Error('URL skal ligne https://github.com/bruger/repository.git');
  }
  return `https://github.com${cleanPath.endsWith('.git') ? cleanPath : `${cleanPath}.git`}`;
}

function assertBranch(branch) {
  const value = String(branch || '').trim();
  if (!/^(?!-)(?!.*(?:\.\.|\/\/|@\{|\\))[\w./-]+(?<![./-])$/.test(value)) {
    throw new Error('Branch-navnet er ugyldigt');
  }
  return value;
}

async function createAskPass(token) {
  const id = crypto.randomBytes(12).toString('hex');
  const extension = process.platform === 'win32' ? '.cmd' : '.sh';
  const askPassPath = path.join(os.tmpdir(), `project-pusher-askpass-${id}${extension}`);
  const content = process.platform === 'win32'
    ? '@echo off\r\nset "prompt=%~1"\r\necho %prompt%| findstr /I "username" >nul && (echo x-access-token) || (echo %PROJECT_PUSHER_TOKEN%)\r\n'
    : '#!/bin/sh\ncase "$1" in *Username*) printf "%s\\n" "x-access-token" ;; *) printf "%s\\n" "$PROJECT_PUSHER_TOKEN" ;; esac\n';
  fs.writeFileSync(askPassPath, content, { encoding: 'utf8', mode: 0o700, flag: 'wx' });
  return askPassPath;
}

ipcMain.handle('select-folder', async event => {
  assertTrustedEvent(event);
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled) return null;
  const folder = path.resolve(result.filePaths[0]);
  selectedFolders.add(folder);
  return folder;
});

ipcMain.handle('get-folder-tree', async (event, folderPath) => {
  assertTrustedEvent(event);
  const root = assertSelectedFolder(folderPath);
  let count = 0;
  function getTree(dir) {
    if (++count > MAX_TREE_ENTRIES) return [{ name: '... visning begr\u00e6nset', type: 'file' }];
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [{ name: '... ingen adgang', type: 'file' }];
    }
    return entries
      .filter(entry => !IGNORED_TREE_NAMES.has(entry.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map(entry => {
        if (++count > MAX_TREE_ENTRIES) return null;
        const item = { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' };
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          item.children = getTree(path.join(dir, entry.name));
        }
        return item;
      })
      .filter(Boolean);
  }
  return getTree(root);
});

ipcMain.handle('run-test', async (event, folderPath, preset) => {
  assertTrustedEvent(event);
  const root = assertSelectedFolder(folderPath);
  validateTestPreset(root, preset);
  const selected = getTestPreset(preset);
  if (!selected) throw new Error('Ukendt testvalg');

  let result;
  try {
    result = await runProcess(selected[0], selected[1], root, { allowFailure: true });
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'EINVAL')) {
      throw new Error('Det valgte testværktøj kunne ikke startes. Kontrollér at det er installeret og tilgængeligt på systemet.');
    }
    throw error;
  }

  return {
    command: [selected[0], ...selected[1]].join(' '),
    exitCode: result.code,
    output: `${result.stdout}${result.stderr}` || 'Ingen output.'
  };
});

ipcMain.handle('generate-files', async (event, folderPath, options) => {
  assertTrustedEvent(event);
  const root = assertSelectedFolder(folderPath);
  const files = options && typeof options.files === 'object' ? options.files : {};
  const safeOptions = { ...options, folder: root };
  const results = [];
  const add = (relativePath, type) => {
    const target = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    results.push(writeNewFile(target, generateFileContent(type, safeOptions)));
  };
  if (files.gitignore) add('.gitignore', 'gitignore');
  if (files.readme) add('README.md', 'readme');
  if (files.license) add('LICENSE', 'license');
  if (files.editorconfig) add('.editorconfig', 'editorconfig');
  if (files.contributing) add('CONTRIBUTING.md', 'contributing');
  if (files.changelog) add('CHANGELOG.md', 'changelog');
  if (files.ci) {
    const projectType = detectProjectType(root);
    if (projectType === 'unknown') {
      results.push({
        path: path.join(root, '.github', 'workflows', 'ci.yml'),
        status: 'sprunget over (GitHub CI kræver et genkendeligt Node.js- eller Python-projekt)'
      });
    } else {
      add('.github/workflows/ci.yml', projectType === 'python' ? 'ci-python' : 'ci-node');
    }
  }
  return results;
});

ipcMain.handle('push-to-remote', async (event, folderPath, remoteUrl, branch, token) => {
  assertTrustedEvent(event);
  const root = assertSelectedFolder(folderPath);
  const safeRemote = parseGitHubRemote(String(remoteUrl || '').trim());
  const safeBranch = assertBranch(branch);
  const safeToken = String(token || '').trim();
  if (safeToken.length < 20 || !/^[A-Za-z0-9_]+$/.test(safeToken)) {
    throw new Error('Token mangler eller er ugyldigt');
  }

  const git = getGitCommand();
  try {
    await runProcess(git, ['--version'], root);
  } catch {
    throw new Error(
      process.platform === 'win32'
        ? 'Git kunne ikke startes. Geninstaller Project Pusher, eller installer Git for Windows.'
        : 'Git kunne ikke startes. Installer pakken "git" og pr\u00f8v igen.'
    );
  }

  const repoCheck = await runProcess(git, ['rev-parse', '--is-inside-work-tree'], root, { allowFailure: true });
  if (repoCheck.code !== 0) {
    const init = await runProcess(git, ['init', '-b', safeBranch], root, { allowFailure: true });
    if (init.code !== 0) {
      await runProcess(git, ['init'], root);
      await runProcess(git, ['checkout', '-b', safeBranch], root);
    }
  }
  const currentBranch = (await runProcess(git, ['branch', '--show-current'], root)).stdout.trim();
  if (currentBranch && currentBranch !== safeBranch) {
    throw new Error(`Den valgte branch er '${safeBranch}', men projektet st\u00e5r p\u00e5 '${currentBranch}'`);
  }
  const origin = await runProcess(git, ['remote', 'get-url', 'origin'], root, { allowFailure: true });
  if (origin.code === 0 && origin.stdout.trim() !== safeRemote) {
    throw new Error(`Projektet har allerede en anden origin: ${origin.stdout.trim()}`);
  }
  if (origin.code !== 0) await runProcess(git, ['remote', 'add', 'origin', safeRemote], root);
  await runProcess(git, ['add', '--all'], root);
  const staged = await runProcess(git, ['diff', '--cached', '--quiet'], root, { allowFailure: true });
  if (staged.code === 1) {
    await runProcess(git, ['commit', '-m', 'Opdateret via Project Pusher'], root);
  }
  let askPassPath;
  try {
    askPassPath = await createAskPass(safeToken);
    const env = {
      ...process.env,
      GIT_ASKPASS: askPassPath,
      GIT_TERMINAL_PROMPT: '0',
      PROJECT_PUSHER_TOKEN: safeToken
    };
    await runProcess(git, ['push', '--set-upstream', 'origin', safeBranch], root, {
      env,
      timeoutMs: 180000
    });
  } finally {
    if (askPassPath) {
      try { fs.unlinkSync(askPassPath); } catch {}
    }
  }
  return 'Push gennemf\u00f8rt';
});

ipcMain.handle('open-security-guide', event => {
  assertTrustedEvent(event);
  const guide = new BrowserWindow(createWindowOptions({
    width: 900,
    height: 700,
    title: 'GitHub Ruleset-guide'
  }));
  lockWindow(guide);
  return guide.loadFile(path.join(__dirname, '..', 'renderer', 'security-guide.html'));
});

app.whenReady().then(async () => {
  const mainWindow = new BrowserWindow(createWindowOptions({
    width: 1200,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  }));
  lockWindow(mainWindow);
  await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
