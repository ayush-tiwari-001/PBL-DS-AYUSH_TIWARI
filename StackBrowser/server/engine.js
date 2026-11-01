'use strict';
// Thin wrapper around the C++ history engine process.
// Commands are queued and answered strictly in order (one JSON line per command).
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const EXE = process.platform === 'win32' ? 'history_engine.exe' : 'history_engine';
const ENGINE_PATH = path.join(ROOT, 'engine', 'bin', EXE);

class Engine {
  constructor(capacity) {
    if (!fs.existsSync(ENGINE_PATH)) {
      throw new Error(
        'C++ history engine not found at ' + ENGINE_PATH +
        '\nBuild it first: run build.bat (Windows) or "make -C engine" (Linux/macOS).'
      );
    }
    this.pending = [];
    this.buffer = '';
    this.proc = spawn(ENGINE_PATH, [String(capacity)], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => this._onData(chunk));
    this.proc.on('exit', (code) => {
      const err = new Error('history engine exited (code ' + code + ')');
      this.pending.splice(0).forEach((p) => p.reject(err));
      this.dead = true;
    });
  }

  _onData(chunk) {
    this.buffer += chunk;
    let nl;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      const waiter = this.pending.shift();
      if (!waiter) continue;
      try { waiter.resolve(JSON.parse(line)); } catch (e) { waiter.reject(e); }
    }
  }

  send(command) {
    if (this.dead) return Promise.reject(new Error('history engine is not running'));
    if (/[\r\n]/.test(command)) return Promise.reject(new Error('invalid command'));
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.proc.stdin.write(command + '\n');
    });
  }

  close() { try { this.proc.stdin.end(); this.proc.kill(); } catch (_) { /* ignore */ } }
}

module.exports = { Engine, ENGINE_PATH };
