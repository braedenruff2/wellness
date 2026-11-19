/* The PC link server's own tests (pc/test/test_pc.py), if Python with the cryptography package is here. */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const py = process.platform === 'win32' ? 'python' : 'python3';
if (spawnSync(py, ['-c', 'import cryptography'], { stdio: 'ignore' }).status !== 0) { console.log('skipped: no python3 + cryptography'); process.exit(0); }
const r = spawnSync(py, [path.join(__dirname, '..', 'pc', 'test', 'test_pc.py')], { stdio: 'inherit', timeout: 120000 });
process.exit(r.status === 0 ? 0 : 1);
