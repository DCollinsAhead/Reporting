const express = require('express');
const path = require('path');

const opportunityOverviewRouter = require('./routes/opportunityOverview');
const engineeringWorkloadRouter = require('./routes/engineeringWorkload');
const engineeringManagerWorkloadRouter = require('./routes/engineeringManagerWorkload');
const engineeringStaffingPlanningRouter = require('./routes/engineeringStaffingPlanning');
const quotationRouter = require('./routes/quotation');
const operationsWorkloadRouter = require('./routes/operationsWorkload');
const programManagementWorkloadRouter = require('./routes/programManagementWorkload');
const reIssueTrackingRouter = require('./routes/reIssueTracking');

// Same process serves the UI and the API on one origin, so there's no CORS
// config and no separate host to stand up - unlike the Roost-hosted version
// in ../../server, this never leaves localhost.
function createServer() {
  const app = express();

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use(opportunityOverviewRouter);
  app.use(engineeringWorkloadRouter);
  app.use(engineeringManagerWorkloadRouter);
  app.use(engineeringStaffingPlanningRouter);
  app.use(quotationRouter);
  app.use(operationsWorkloadRouter);
  app.use(programManagementWorkloadRouter);
  app.use(reIssueTrackingRouter);

  return app;
}

module.exports = { createServer };
