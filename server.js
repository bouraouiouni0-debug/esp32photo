const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let cam = null;
const viewers = new Set();

function sendStatus(ws) {
  if (ws.readyState === 1) ws.send(cam ? 'cam:online' : 'cam:offline');
}
function broadcastStatus() {
  for (const v of viewers) sendStatus(v);
}

wss.on('connection', (ws, req) => {
  const role = new URL(req.url, 'http://x').searchParams.get('role');
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  if (role === 'cam') {
    cam = ws;
    broadcastStatus();
    ws.on('message', (data, isBinary) => {
      if (!isBinary) return;
      for (const v of viewers) {
        // on saute l'image si le navigateur est en retard
        if (v.readyState === 1 && v.bufferedAmount < 500000) {
          v.send(data, { binary: true });
        }
      }
    });
    ws.on('close', () => {
      if (cam === ws) cam = null;
      broadcastStatus();
    });
  } else {
    viewers.add(ws);
    sendStatus(ws);
    ws.on('message', (msg) => {
      if (cam && cam.readyState === 1) cam.send(msg.toString());
    });
    ws.on('close', () => viewers.delete(ws));
  }
});

// keep-alive (évite que Render coupe les connexions inactives)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Serveur sur le port ' + PORT));
