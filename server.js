require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const session = require('express-session');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboardcat',
  resave: false,
  saveUninitialized: true,
}));

// Google Sheets setup
const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);

async function accessSheet() {
  await doc.useServiceAccountAuth({
    client_email: process.env.CLIENT_EMAIL,
    private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  await sheet.loadHeaderRow();
  return sheet;
}

// ===== Account Creation =====
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const sheet = await accessSheet();

  const rows = await sheet.getRows();
  const userExists = rows.some(row => row.Username === username);
  if (userExists) return res.status(400).send('User already exists');

  const hashed = await bcrypt.hash(password, 10);
  await sheet.addRow({ Username: username, Password: hashed, Balance: 1000 }); // default balance
  res.send('Registered successfully');
});

// ===== Login =====
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const sheet = await accessSheet();
  const rows = await sheet.getRows();

  const user = rows.find(row => row.Username === username);
  if (!user) return res.status(404).send('User not found');

  const match = await bcrypt.compare(password, user.Password);
  if (!match) return res.status(401).send('Incorrect password');

  req.session.user = username;
  res.send({ message: 'Login successful', balance: user.Balance });
});

// ===== Get Balance =====
app.get('/balance', async (req, res) => {
  if (!req.session.user) return res.status(401).send('Not logged in');

  const sheet = await accessSheet();
  const rows = await sheet.getRows();
  const user = rows.find(row => row.Username === req.session.user);
  res.send({ balance: user.Balance });
});

// ===== Update Balance (e.g. after a spin) =====
app.post('/update-balance', async (req, res) => {
  const { amount } = req.body; // positive or negative
  if (!req.session.user) return res.status(401).send('Not logged in');

  const sheet = await accessSheet();
  const rows = await sheet.getRows();
  const user = rows.find(row => row.Username === req.session.user);

  let newBalance = parseInt(user.Balance) + parseInt(amount);
  if (newBalance < 0) newBalance = 0;
  user.Balance = newBalance;
  await user.save();

  res.send({ balance: newBalance });
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
