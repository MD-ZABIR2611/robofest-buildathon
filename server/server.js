'use strict';

require('dotenv').config();
const app = require('./app');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be set to at least 32 characters.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set.');
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`MediCare+ listening on ${port}`);
});
