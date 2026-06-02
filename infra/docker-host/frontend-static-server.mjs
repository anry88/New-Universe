import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 8080);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const indexPath = path.join(root, 'index.html');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function send(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, headers);
  response.end(body);
}

function isInsideRoot(filePath) {
  return filePath === root || filePath.startsWith(`${root}${path.sep}`);
}

async function resolveStaticFile(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const candidate = path.normalize(path.join(root, decodedPath));

  if (!isInsideRoot(candidate)) {
    return { statusCode: 403 };
  }

  try {
    const info = await stat(candidate);
    if (info.isFile()) {
      return { filePath: candidate };
    }
    if (info.isDirectory()) {
      const nestedIndex = path.join(candidate, 'index.html');
      const nestedInfo = await stat(nestedIndex);
      if (nestedInfo.isFile()) {
        return { filePath: nestedIndex };
      }
    }
  } catch {
    if (path.extname(candidate)) {
      return { statusCode: 404 };
    }
  }

  return { filePath: indexPath };
}

createServer(async (request, response) => {
  if (request.url === undefined) {
    send(response, 400, 'bad request\n');
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    send(response, 200, 'ok\n', {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    });
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'method not allowed\n', { allow: 'GET, HEAD' });
    return;
  }

  let resolved;
  try {
    resolved = await resolveStaticFile(url.pathname);
  } catch {
    send(response, 400, 'bad request\n');
    return;
  }

  if (resolved.statusCode !== undefined) {
    send(response, resolved.statusCode, resolved.statusCode === 403 ? 'forbidden\n' : 'not found\n');
    return;
  }

  const filePath = resolved.filePath;
  const extension = path.extname(filePath);
  const stream = createReadStream(filePath);

  response.writeHead(200, {
    'content-type': contentTypes.get(extension) || 'application/octet-stream',
    'cache-control': filePath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'
  });

  if (request.method === 'HEAD') {
    response.end();
    stream.destroy();
    return;
  }

  stream.pipe(response);
  stream.on('error', () => {
    if (!response.headersSent) {
      send(response, 500, 'internal server error\n');
    } else {
      response.destroy();
    }
  });
}).listen(port, '0.0.0.0', () => {
  console.log(`frontend static server listening on ${port}`);
});
