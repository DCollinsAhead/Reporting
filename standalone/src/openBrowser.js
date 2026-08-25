const { exec } = require('child_process');

// No dependency needed for this - each OS already ships a way to open the
// default browser from the shell.
function openBrowser(url) {
  const command =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;

  exec(command, (err) => {
    if (err) console.log(`Could not open a browser automatically - visit ${url} manually.`);
  });
}

module.exports = { openBrowser };
