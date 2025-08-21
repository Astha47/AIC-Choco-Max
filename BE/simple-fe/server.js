#!/usr/bin/env node
// Minimal static file server using only Node built-ins.
// Usage: node server.js [port]

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || process.argv[2] || '8080', 10);
const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/MP2T',
  '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json'
};

function send404(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('404 Not Found');
}

function send500(res, err) {
  res.statusCode = 500;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('500 Internal Server Error\n' + String(err));
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(ROOT, urlPath);

    // If directory, serve index.html
    if (filePath.endsWith(path.sep)) filePath = path.join(filePath, 'index.html');

    // If path is root, point to index.html
    if (urlPath === '/' || urlPath === '') {
      filePath = path.join(ROOT, 'index.html');
    }

    // Prevent path traversal
    if (!filePath.startsWith(ROOT)) {
      send404(res);
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err) return send404(res);
      if (stats.isDirectory()) {
        // try index.html inside directory
        const idx = path.join(filePath, 'index.html');
        return fs.stat(idx, (ie, istats) => {
          if (ie) return send404(res);
          streamFile(idx, res);
        });
      }
      streamFile(filePath, res);
    });
  } catch (err) {
    send500(res, err);
  }
});

function streamFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  // allow HLS files to be fetched by browsers
  res.setHeader('Cache-Control', 'no-cache');

  const stream = fs.createReadStream(filePath);
  stream.on('error', (e) => send500(res, e));
  stream.pipe(res);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Simple FE static server listening on http://0.0.0.0:${PORT}`);
  console.log(`Serving files from ${ROOT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
