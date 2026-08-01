import localtunnel from 'localtunnel';

(async () => {
  try {
    const tunnel = await localtunnel({ port: 5000 });
    console.log(`\n==============================================`);
    console.log(`🌐 OMNICALL PUBLIC TUNNEL LIVE URL: ${tunnel.url}`);
    console.log(`==============================================\n`);
    
    tunnel.on('close', () => {
      console.log('Tunnel closed');
    });
  } catch (err) {
    console.error('Error starting tunnel:', err);
  }
})();
