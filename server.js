const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  if (!req.query['ngrok-skip-browser-warning'] && req.headers['user-agent'] && !req.path.startsWith('/socket.io')) {
    const sep = req.url.includes('?') ? '&' : '?';
    return res.redirect(req.url + sep + 'ngrok-skip-browser-warning=true');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
const rooms = {};
io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, name }) => {
    if (!rooms[roomId]) rooms[roomId] = {};
    const isHost = Object.keys(rooms[roomId]).length === 0;
    rooms[roomId][socket.id] = { name, isHost, isOrganizer: false, micOn: true, camOn: true, micLocked: false, camLocked: false, handRaised: false };
    const others = Object.keys(rooms[roomId]).filter(id => id !== socket.id);
    socket.emit('existing-peers', others.map(id => ({ id, ...rooms[roomId][id] })));
    socket.emit('your-role', { isHost, isOrganizer: false });
    others.forEach(pid => io.to(pid).emit('peer-joined', { id: socket.id, name, isHost, isOrganizer: false }));
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = name;
    socket.data.isHost = isHost;
    socket.data.isOrganizer = false;
  });
  socket.on('offer', ({ to, offer }) => io.to(to).emit('offer', { from: socket.id, offer, name: socket.data.name, isHost: socket.data.isHost, isOrganizer: socket.data.isOrganizer }));
  socket.on('answer', ({ to, answer }) => io.to(to).emit('answer', { from: socket.id, answer }));
  socket.on('ice-candidate', ({ to, candidate }) => io.to(to).emit('ice-candidate', { from: socket.id, candidate }));
  socket.on('chat-message', ({ roomId, message, sender }) => socket.to(roomId).emit('chat-message', { message, sender }));
  socket.on('state-update', ({ micOn, camOn }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId] || !rooms[roomId][socket.id]) return;
    const peer = rooms[roomId][socket.id];
    if (peer.micLocked && micOn !== peer.micOn) { socket.emit('force-mic', { micOn: peer.micOn, locked: true }); return; }
    if (peer.camLocked && camOn !== peer.camOn) { socket.emit('force-cam', { camOn: peer.camOn, locked: true }); return; }
    peer.micOn = micOn; peer.camOn = camOn;
    socket.to(roomId).emit('peer-state', { id: socket.id, micOn, camOn, micLocked: peer.micLocked, camLocked: peer.camLocked });
  });
  // Host promote/demote organizer
  socket.on('promote-organizer', ({ targetId }) => {
    if (!socket.data.isHost) return;
    const roomId = socket.data.roomId;
    if (!rooms[roomId] || !rooms[roomId][targetId]) return;
    rooms[roomId][targetId].isOrganizer = true;
    io.to(targetId).emit('your-role', { isHost: false, isOrganizer: true });
    io.to(roomId).emit('peer-role-changed', { id: targetId, isOrganizer: true });
  });
  socket.on('demote-organizer', ({ targetId }) => {
    if (!socket.data.isHost) return;
    const roomId = socket.data.roomId;
    if (!rooms[roomId] || !rooms[roomId][targetId]) return;
    rooms[roomId][targetId].isOrganizer = false;
    io.to(targetId).emit('your-role', { isHost: false, isOrganizer: false });
    io.to(roomId).emit('peer-role-changed', { id: targetId, isOrganizer: false });
  });
  socket.on('host-toggle-mic', ({ targetId }) => {
    if (!socket.data.isHost) return;
    const roomId = socket.data.roomId;
    if (!rooms[roomId] || !rooms[roomId][targetId]) return;
    const peer = rooms[roomId][targetId];
    peer.micOn = !peer.micOn;
    io.to(targetId).emit('force-mic', { micOn: peer.micOn, locked: peer.micLocked });
    socket.emit('peer-state', { id: targetId, micOn: peer.micOn, camOn: peer.camOn, micLocked: peer.micLocked, camLocked: peer.camLocked });
  });
  socket.on('host-toggle-cam', ({ targetId }) => {
    if (!socket.data.isHost) return;
    const roomId = socket.data.roomId;
    if (!rooms[roomId] || !rooms[roomId][targetId]) return;
    const peer = rooms[roomId][targetId];
    peer.camOn = !peer.camOn;
    io.to(targetId).emit('force-cam', { camOn: peer.camOn, locked: peer.camLocked });
    socket.emit('peer-state', { id: targetId, micOn: peer.micOn, camOn: peer.camOn, micLocked: peer.micLocked, camLocked: peer.camLocked });
  });
  socket.on('host-lock-mic', ({ targetId }) => {
    if (!socket.data.isHost) return;
    const roomId = socket.data.roomId;
    if (!rooms[roomId] || !rooms[roomId][targetId]) return;
    const peer = rooms[roomId][targetId];
    peer.micLocked = !peer.micLocked;
    if (peer.micLocked) peer.micOn = false;
    io.to(targetId).emit('force-mic', { micOn: peer.micOn, locked: peer.micLocked });
    socket.emit('peer-state', { id: targetId, micOn: peer.micOn, camOn: peer.camOn, micLocked: peer.micLocked, camLocked: peer.camLocked });
  });
  socket.on('host-lock-cam', ({ targetId }) => {
    if (!socket.data.isHost) return;
    const roomId = socket.data.roomId;
    if (!rooms[roomId] || !rooms[roomId][targetId]) return;
    const peer = rooms[roomId][targetId];
    peer.camLocked = !peer.camLocked;
    if (peer.camLocked) peer.camOn = false;
    io.to(targetId).emit('force-cam', { camOn: peer.camOn, locked: peer.camLocked });
    socket.emit('peer-state', { id: targetId, micOn: peer.micOn, camOn: peer.camOn, micLocked: peer.micLocked, camLocked: peer.camLocked });
  });
  socket.on('host-kick', ({ targetId }) => { if (socket.data.isHost) io.to(targetId).emit('kicked'); });
  socket.on('reaction', ({ roomId, emoji, name }) => socket.to(roomId).emit('reaction', { emoji, name, id: socket.id }));
  socket.on('raise-hand', ({ roomId, raised }) => {
    if (rooms[roomId] && rooms[roomId][socket.id]) rooms[roomId][socket.id].handRaised = raised;
    socket.to(roomId).emit('hand-raised', { id: socket.id, name: socket.data.name, raised });
  });
  socket.on('wb-draw', ({ roomId, data }) => socket.to(roomId).emit('wb-draw', data));
  socket.on('wb-clear', ({ roomId }) => socket.to(roomId).emit('wb-clear'));
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId][socket.id];
      socket.to(roomId).emit('peer-left', { id: socket.id, name: socket.data.name });
      if (Object.keys(rooms[roomId]).length === 0) delete rooms[roomId];
    }
  });
});
server.listen(3000, () => console.log('\n✅  MeetUp running at http://localhost:3000\n'));
