'use strict';

/**
 * Tiny static file handler. It keeps the dependency list down to `ws` only.
 *
 * Caching policy (the game runs on a metered-bandwidth host):
 * - Images and fonts get a week of browser cache. They only change on a
 *   deploy, and art changes are rare enough that a week of staleness is a
 *   fair trade for never re-sending megabytes to a returning player.
 * - HTML, CSS and JS always revalidate, but with an ETag: a repeat visit
 *   costs a 304 and a few hundred bytes instead of the full file, while a
 *   deploy still reaches everyone on their next load.
 * - Text responses are gzipped when the client accepts it.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

/* Art and fonts only change on a deploy: a week of cache is safe. Code and
   markup always revalidate so a deploy reaches everyone immediately. */
const LONG_LIVED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff2']);

const COMPRESSIBLE_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.svg']);

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
      const ext = path.extname(target).toLowerCase();
      const type = MIME_TYPES[ext] || 'application/octet-stream';
      const longLived = LONG_LIVED_EXTENSIONS.has(ext);
      const etag = `W/"${stats.size}-${Number(stats.mtimeMs).toString(36)}"`;

      const headers = {
        'Content-Type': type,
        'Cache-Control': longLived ? 'public, max-age=604800' : 'no-cache',
        'ETag': etag,
        'Vary': 'Accept-Encoding',
      };

      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers).end();
        return;
      }

      const wantsGzip =
        COMPRESSIBLE_EXTENSIONS.has(ext) &&
        /\bgzip\b/.test(req.headers['accept-encoding'] || '');

      if (wantsGzip) {
        headers['Content-Encoding'] = 'gzip';
        res.writeHead(200, headers);
        fs.createReadStream(target).pipe(zlib.createGzip()).pipe(res);
        return;
      }

      headers['Content-Length'] = stats.size;
      res.writeHead(200, headers);
      fs.createReadStream(target).pipe(res);
    });
  };
}

module.exports = { createStaticHandler };
