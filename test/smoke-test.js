const io = require('socket.io-client');
const SERVER = process.env.SERVER || 'http://localhost:3000';

function wait(ms){ return new Promise(r => setTimeout(r, ms)); }

(async ()=>{
  console.log('→ connecting host...');
  const host = io(SERVER, { transports: ['websocket'] });
  await new Promise(r => host.once('connect', r));
  console.log('host connected:', host.id);

  host.on('room:players', (p) => console.log('host got room:players', p.players.map(x=>x.name)));
  host.on('host:review_update', (s) => console.log('host review_update ->', s.standings));

  console.log('→ host creating room with 1 question');
  host.emit('host:create', { questions: [{ text: 'What is 2 + 2?' }] });
  const created = await new Promise(r => host.once('host:created', r));
  const code = created.code;
  console.log('room code:', code);

  console.log('→ connecting player Alice...');
  const player = io(SERVER, { transports: ['websocket'] });
  await new Promise(r => player.once('connect', r));
  console.log('player connected:', player.id);

  player.on('player:result', (res) => console.log('player result:', res));
  player.on('player:joined', (d) => console.log('player:joined ->', d));
  player.on('round:answer_phase', () => console.log('player: got round:answer_phase'));

  console.log('→ player joining room');
  player.emit('player:join', { code, name: 'Alice' });
  await wait(200);

  console.log('→ host starting game');
  host.emit('host:start', { code });
  await new Promise(r => host.once('round:start', r));
  console.log('round started — player should see bid screen');

  console.log('→ player placing bid $100');
  player.emit('player:bid', { bid: 100 });
  await wait(200);

  console.log('→ host locking bids (open answers)');
  host.emit('host:lock_bids', { code });
  await wait(200);

  console.log('→ player submitting answer');
  player.emit('player:answer', { answer: '4' });
  await wait(200);

  console.log('→ host ending round (show answers)');
  host.emit('host:end_round', { code });
  await wait(200);

  console.log('→ host marking Alice correct');
  host.emit('host:mark', { code, playerId: player.id, correct: true });
  await wait(500);

  console.log('→ test complete — closing sockets');
  player.close();
  host.close();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });