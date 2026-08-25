const express = require('express');
const path = require('path');

const statusSummaryRouter = require('./routes/statusSummary');
const assigneeWorkloadRouter = require('./routes/assigneeWorkload');

// Same process serves the UI and the API on one origin, so there's no CORS
// config and no separate host to stand up - unlike the Roost-hosted version
// in ../../server, this never leaves localhost.
function createServer() {
  const app = express();

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use(statusSummaryRouter);
  app.use(assigneeWorkloadRouter);

  return app;
}

module.exports = { createServer };
