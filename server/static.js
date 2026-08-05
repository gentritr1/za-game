'use strict';

/**
 * Tiny static file handler. It keeps the dependency list down to `ws` only.
 */

const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function createStaticHandler(rootDir) {
  const root = path.resolve(rootDir);

  return function handle(req, res) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }

    // A NUL byte makes the file functions throw, so it must go before `fs`.
    if (pathname.includes('\0')) {
      res.writeHead(400).end('Bad request');
      return;
    }

    if (pathname === '/' || pathname === '') pathname = '/index.html';

    // Block any attempt to read outside of the public folder. The separator in
    // the test keeps a sibling folder such as `public-old` out of reach.
    const target = path.join(root, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
    if (target !== root && !target.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(target, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      const type = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': stats.size,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(target).pipe(res);
    });
  };
}

module.exports = { createStaticHandler };
