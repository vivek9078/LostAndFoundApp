const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// DB Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) throw err;
  console.log("✅ Connected to MySQL database");
});

// Email Transporter (Use App Password)

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Verification Tokens
const verificationTokens = new Map();

// Found Item Registration
app.post('/api/found', (req, res) => {
  const { email, item_name, color, brand, location } = req.body;
  if (!email || !item_name || !location || !color) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const sql = 'INSERT INTO found_items (email, item_name, color, brand, location, verified) VALUES (?, ?, ?, ?, ?, 0)';
  db.query(sql, [email, item_name, color, brand, location], (err, result) => {
    if (err) return res.status(500).json({ message: 'DB Error' });

    const token = Math.random().toString(36).substring(2);
    verificationTokens.set(token, { id: result.insertId, type: 'found' });

    const verifyLink = `http://localhost:3000/api/verify/${token}`;
    transporter.sendMail({
      from: 'process.env.EMAIL_USER',
      to: email,
      subject: 'Verify your found item',
      html: `<p>Please verify your found item by clicking <a href="${verifyLink}">here</a>.</p>`
    });

    res.json({ message: 'Found item registered. Please verify your email.' });
  });
});

// Email Verification
app.get('/api/verify/:token', (req, res) => {
  const token = req.params.token;
  const data = verificationTokens.get(token);

  if (!data) return res.status(400).send('Invalid or expired token');
  verificationTokens.delete(token);

  const table = data.type === 'found' ? 'found_items' : 'lost_items';
  db.query(`UPDATE ${table} SET verified = 1 WHERE id = ?`, [data.id], (err) => {
    if (err) return res.status(500).send('DB error');
    res.send('✅ Email verified successfully. You can now search or list items.');
  });
});

// KMP Algorithm for Substring Match
function KMPSearch(pattern, text) {
  if (!pattern || !text) return false;
  const M = pattern.length;
  const N = text.length;
  const lps = new Array(M).fill(0);

  let len = 0, i = 1;
  while (i < M) {
    if (pattern[i] === pattern[len]) {
      len++;
      lps[i] = len;
      i++;
    } else {
      if (len !== 0) len = lps[len - 1];
      else {
        lps[i] = 0;
        i++;
      }
    }
  }

  i = 0; let j = 0;
  while (i < N) {
    if (pattern[j] === text[i]) {
      i++; j++;
    }
    if (j === M) return true;
    else if (i < N && pattern[j] !== text[i]) {
      if (j !== 0) j = lps[j - 1];
      else i++;
    }
  }
  return false;
}

// Search Lost Item
// Updated Search route: simple and case-insensitive
app.post('/api/search', (req, res) => {
  let { item_name, color, brand } = req.body;

  if (!item_name) return res.status(400).json({ message: 'Item name required' });

  // Normalize input
  item_name = item_name.toLowerCase().trim();
  color = color?.toLowerCase().trim();
  brand = brand?.toLowerCase().trim();

  db.query('SELECT * FROM found_items WHERE verified = 1', (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });

    const filtered = results.filter(item => {
      const dbName = (item.item_name || '').toLowerCase();
      const dbColor = (item.color || '').toLowerCase();
      const dbBrand = (item.brand || '').toLowerCase();

      const nameMatch = dbName.includes(item_name);     // Use includes() instead of KMPSearch
      const colorMatch = !color || dbColor.includes(color);
      const brandMatch = !brand || dbBrand.includes(brand);

      console.log(`User input: name="${item_name}", color="${color}", brand="${brand}"`);
      console.log(`DB item: name="${dbName}", color="${dbColor}", brand="${dbBrand}"`);
      console.log(`Matches -> name: ${nameMatch}, color: ${colorMatch}, brand: ${brandMatch}\n`);

      return nameMatch && colorMatch && brandMatch;
    });

    res.json(filtered);
  });
});


// Root Test Route
app.get('/', (req, res) => {
  res.send('🔗 Lost & Found Backend is Live');
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
