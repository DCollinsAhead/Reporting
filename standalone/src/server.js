const express = require('express');
const path = require('path');

const opportunityOverviewRouter = require('./routes/opportunityOverview');
const engineeringWorkloadRouter = require('./routes/engineeringWorkload');

// Same process serves the UI and the API on one origin, so there's no CORS
// config and no separate host to stand up - unlike the Roost-hosted version
// in ../../server, this never leaves localhost.
function createServer() {
  const app = express();

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use(opportunityOverviewRouter);
  app.use(engineeringWorkloadRouter);

  return app;
}

module.exports = { createServer };
