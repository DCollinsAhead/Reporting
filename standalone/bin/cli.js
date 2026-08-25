#!/usr/bin/env node
require('dotenv').config();

const { createServer } = require('../src/server');
const { openBrowser } = require('../src/openBrowser');

const port = process.env.PORT || 4287;

createServer().listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`FPT dashboard running at ${url}`);
  console.log('Press Ctrl+C to stop.');
  openBrowser(url);
});
