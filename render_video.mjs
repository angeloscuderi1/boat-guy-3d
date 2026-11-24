import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brainScratch = '/Users/angelo/.gemini/antigravity/brain/45857759-2288-4c59-b707-370644eb3fce/scratch';
const outMp4 = path.join(__dirname, 'output', 'boat-cruise.mp4');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.glb':  'model/gltf-binary',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
};

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const cleanPath = (req.url || '/').split('?')[0];
      const rel = cleanPath === '/' ? 'boat_video.html' : cleanPath.replace(/^\/+/, '');
      const full = path.join(__dirname, rel);
      if (!full.startsWith(__dirname) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const ext = path.extname(full);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

async function waitForDevTools(dbgPort) {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${dbgPort}/json`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Chrome DevTools endpoint timed out');
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

async function main() {
  fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
  fs.mkdirSync(brainScratch, { recursive: true });

  const { srv, port } = await startServer();
  const dbgPort = 19222 + Math.floor(Math.random() * 2000);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-boat-video-'));
  const url = `http://127.0.0.1:${port}/boat_video.html?capture=1`;

  let chrome;
  let cdp;
  try {
    chrome = spawn(CHROME, [
      '--headless=new',
      '--use-gl=angle',
      '--use-angle=metal',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-gpu-sandbox',
      '--window-size=1280,720',
      `--remote-debugging-port=${dbgPort}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      url,
    ], { stdio: 'ignore' });

    const wsUrl = await waitForDevTools(dbgPort);
    cdp = new CDP(wsUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
    });

    // Wait for WebGL scene initialization
    let ready = false;
    for (let i = 0; i < 60; i++) {
      const res = await cdp.send('Runtime.evaluate', { expression: 'Boolean(window.__sceneReady)' });
      if (res.result?.value === true) { ready = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    if (!ready) throw new Error('Scene failed to initialize in headless Chrome');

    // Start ffmpeg consuming raw PNG stream via stdin
    const ff = spawn(FFMPEG, [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-r', '30',
      '-i', '-',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '18',
      '-preset', 'medium',
      '-movflags', '+faststart',
      outMp4,
    ], { stdio: ['pipe', 'inherit', 'pipe'] });

    let ffErr = '';
    ff.stderr.on('data', d => { ffErr += d.toString(); });
    const ffDone = new Promise((resolve, reject) => {
      ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}:\n${ffErr}`)));
    });

    const totalFrames = 300; // 10.0s at 30fps
    const previewFrames = new Set([45, 150, 260]);
    const t0 = Date.now();

    for (let f = 0; f < totalFrames; f++) {
      const t = (f / 30).toFixed(6);
      await cdp.send('Runtime.evaluate', { expression: `window.renderFrame(${t})` });
      const snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const pngBuf = Buffer.from(snap.data, 'base64');

      if (previewFrames.has(f)) {
        const fname = `frame_${String(f).padStart(3, '0')}.png`;
        fs.writeFileSync(path.join(brainScratch, fname), pngBuf);
      }

      if (!ff.stdin.write(pngBuf)) {
        await new Promise(r => ff.stdin.once('drain', r));
      }
      if ((f + 1) % 60 === 0) {
        console.log(`Captured ${f + 1}/${totalFrames} frames (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      }
    }

    ff.stdin.end();
    await ffDone;
    const mb = (fs.statSync(outMp4).size / (1024 * 1024)).toFixed(2);
    console.log(`Encoded ${outMp4} (${mb} MB) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    try { cdp?.close(); } catch {}
    try { chrome?.kill('SIGKILL'); } catch {}
    srv.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
