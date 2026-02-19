const ngrok = require('ngrok');

(async () => {
  try {
    const port = process.env.TUNNEL_PORT || 8080;
    console.log('Starting ngrok tunnel to port', port);
    const url = await ngrok.connect({ proto: 'http', addr: port });
    console.log('\nngrok URL:', url);
    console.log('Host page:', url + '/host.html');
    console.log('Player page:', url + '/player.html');
    console.log('\nTip: open the above URLs in two browser windows (host + player).');
    console.log('\n(Press Ctrl-C to close ngrok)');
  } catch (err) {
    console.error('ngrok error:', err.message || err);
    process.exit(1);
  }
})();