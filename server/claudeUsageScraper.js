/**
 * Claude Usage Scraper — Node.js side
 *
 * Spawns claude_scraper_service.py (patchright/Python) as a long-lived subprocess
 * and communicates via stdin/stdout JSON lines.
 *
 * Public API (unchanged from previous version):
 *   initScraper(profilePath?)  → Promise<data>
 *   scrapeUsage(force?)        → Promise<data>
 *   closeScraper()             → Promise<void>
 *   isEnabled()                → boolean
 *   getCachedUsage()           → data | null
 *   getDefaultProfilePath()    → string
 */

import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Python executable — override via CLAUDE_USAGE_PYTHON env var
const DEFAULT_PYTHON = 'C:\\Users\\druggiero11\\OneDrive\\Dan and Jess Folder\\Money\\Simulation\\venv\\Scripts\\python.exe';
const SCRAPER_SCRIPT = path.join(__dirname, '..', 'scripts', 'ClaudeScraper', 'claude_scraper_service.py');
const CACHE_TTL_MS   = 60 * 1000; // 60 s minimum between live scrapes

// ── State ──────────────────────────────────────────────────────────────
let pyProc        = null;   // child_process
let scraperEnabled = false;
let lastCache      = null;  // { data, timestamp }
let scrapeInProgress = false;
let scrapeWaiters  = [];    // callers waiting on an in-progress scrape
let initPromise    = null;  // in-flight initScraper promise (prevents double-init)

// Strictly serial request queue: one outstanding command at a time
let pendingResolve = null;
let lineBuffer     = '';

// ── Exported helpers ────────────────────────────────────────────────────

export function isInitializing() { return initPromise !== null; }

export function getDefaultProfilePath() {
    const localAppData = process.env.LOCALAPPDATA ||
        path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'ClaudeUsageBot', 'chrome_profile');
}

export function isEnabled()     { return scraperEnabled; }
export function getCachedUsage() { return lastCache?.data || null; }
export function getLastScrapeTimestamp() { return lastCache?.timestamp || null; }

// ── Internal: process I/O ───────────────────────────────────────────────

function handleStdoutLine(line) {
    let msg;
    try {
        msg = JSON.parse(line);
    } catch {
        console.error('[ClaudeUsage] Unparseable stdout line:', line);
        return;
    }

    if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(msg);
    } else {
        // Unsolicited message (shouldn't happen in normal flow)
        console.log('[ClaudeUsage] Unsolicited message:', msg);
    }
}

function attachNormalHandlers(proc) {
    proc.stdout.on('data', (chunk) => {
        lineBuffer += chunk.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop(); // keep any incomplete final segment
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) handleStdoutLine(trimmed);
        }
    });
}

/** Send a command and await the next JSON response line. */
function sendCommand(cmd) {
    return new Promise((resolve, reject) => {
        if (!pyProc || pyProc.exitCode !== null) {
            return reject(new Error('Python scraper process is not running'));
        }
        if (pendingResolve) {
            return reject(new Error('A command is already in flight'));
        }
        pendingResolve = resolve;
        try {
            pyProc.stdin.write(JSON.stringify(cmd) + '\n');
        } catch (err) {
            pendingResolve = null;
            reject(err);
        }
    });
}

// ── Exported API ────────────────────────────────────────────────────────

export async function initScraper(profilePath) {
    // If an init is already in flight, wait for it instead of starting a duplicate
    if (initPromise) return await initPromise;

    const pythonExe = process.env.CLAUDE_USAGE_PYTHON || DEFAULT_PYTHON;

    // Tear down any existing process
    if (pyProc && pyProc.exitCode === null) {
        await closeScraper();
    }

    initPromise = _doInit(pythonExe, profilePath);
    try {
        const result = await initPromise;
        return result;
    } finally {
        initPromise = null;
    }
}

async function _doInit(pythonExe, profilePath) {

    lineBuffer    = '';
    pendingResolve = null;

    await new Promise((resolve, reject) => {
        let startupBuf  = '';
        let readyFired  = false;

        pyProc = spawn(pythonExe, [SCRAPER_SCRIPT], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        pyProc.stderr.on('data', (d) => {
            process.stdout.write('[ClaudeUsage] ' + d.toString());
        });

        pyProc.on('error', (err) => {
            scraperEnabled = false;
            if (!readyFired) reject(err);
        });

        pyProc.on('exit', (code) => {
            scraperEnabled = false;
            pyProc = null;
            if (!readyFired) reject(new Error(`Process exited (code ${code}) before ready`));
            else console.log('[ClaudeUsage] Python process exited, code:', code);
        });

        // Wait for {"status":"ready"} before switching to normal handler
        const onStartupData = (chunk) => {
            startupBuf += chunk.toString();
            const lines = startupBuf.split('\n');
            startupBuf = lines.pop();
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const msg = JSON.parse(trimmed);
                    if (msg.status === 'ready' && !readyFired) {
                        readyFired = true;
                        pyProc.stdout.removeListener('data', onStartupData);
                        attachNormalHandlers(pyProc);
                        resolve();
                    }
                } catch { /* ignore non-JSON startup noise */ }
            }
        };

        pyProc.stdout.on('data', onStartupData);

        setTimeout(() => {
            if (!readyFired) reject(new Error('Timed out waiting for Python scraper to start'));
        }, 20000);
    });

    // Send init command
    const initResp = await sendCommand({
        cmd: 'init',
        profile_path: profilePath || getDefaultProfilePath(),
    });

    if (initResp.status !== 'ok') {
        throw new Error(initResp.error || 'Init command failed');
    }

    scraperEnabled = true;
    console.log('[ClaudeUsage] Scraper ready');

    // Run an initial scrape and return the data
    return await scrapeUsage(true);
}

export async function scrapeUsage(force = false) {
    if (!scraperEnabled || !pyProc || pyProc.exitCode !== null) {
        return lastCache?.data || {
            spent: null, total: null, reset: null,
            error: 'Scraper not initialised', errorType: 'generic', lastUpdated: null,
        };
    }

    // Return cached data if still fresh (and not forced)
    if (!force && lastCache && (Date.now() - lastCache.timestamp < CACHE_TTL_MS)) {
        return lastCache.data;
    }

    // If a scrape is already running, wait for it to finish instead of returning null
    if (scrapeInProgress) {
        return new Promise((resolve) => { scrapeWaiters.push(resolve); });
    }

    scrapeInProgress = true;
    let result;
    try {
        const resp = await sendCommand({ cmd: 'scrape' });

        let data;
        if (resp.status === 'ok' && resp.data) {
            data = resp.data;
        } else {
            // Error response — preserve last known good values + attach error
            data = {
                ...(lastCache?.data || { spent: null, total: null, reset: null }),
                error:       resp.error       || 'Scrape failed',
                errorType:   resp.errorType   || 'generic',
                lastUpdated: lastCache?.data?.lastUpdated || null,
            };
        }

        lastCache = { data, timestamp: Date.now() };
        result = data;
        return data;
    } catch (err) {
        console.error('[ClaudeUsage] sendCommand error:', err.message);
        const data = {
            ...(lastCache?.data || { spent: null, total: null, reset: null }),
            error:       err.message,
            errorType:   'generic',
            lastUpdated: lastCache?.data?.lastUpdated || null,
        };
        lastCache = { data, timestamp: Date.now() };
        result = data;
        return data;
    } finally {
        scrapeInProgress = false;
        const waiters = scrapeWaiters.splice(0);
        waiters.forEach(resolve => resolve(result));
    }
}

export async function closeScraper() {
    scraperEnabled = false;
    initPromise = null;
    if (!pyProc || pyProc.exitCode !== null) {
        pyProc = null;
        return;
    }
    try {
        await sendCommand({ cmd: 'close' });
    } catch { /* process may already be gone */ }
    try {
        pyProc?.kill();
    } catch { /* ignore */ }
    pyProc = null;
    console.log('[ClaudeUsage] Scraper closed');
}
