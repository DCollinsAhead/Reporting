require('dotenv').config();
const express = require('express');
const cors = require('cors');

const statusSummaryRouter = require('./routes/statusSummary');
const assigneeWorkloadRouter = require('./routes/assigneeWorkload');

const app = express();
const allowedOrigin = process.env.ALLOWED_ORIGIN;

app.use(cors({ origin: allowedOrigin, methods: ['GET'] }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use(statusSummaryRouter);
app.use(assigneeWorkloadRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Jira dashboard proxy listening on :${port}`);
  if (!allowedOrigin) {
    console.warn('ALLOWED_ORIGIN is not set - CORS will reject all browser requests.');
  }
});
