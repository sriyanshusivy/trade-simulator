const Database = require("better-sqlite3");

const db = new Database("trade_simulator.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    usd_balance REAL NOT NULL DEFAULT 10000
  );

  CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

console.log("Database initialized ✅");

const existingUser = db
  .prepare("SELECT * FROM users WHERE username = ?")
  .get("demo");

if (!existingUser) {
  const result = db
    .prepare("INSERT INTO users (username, usd_balance) VALUES (?, ?)")
    .run("demo", 10000);

  const userId = result.lastInsertRowid;

  const insertHolding = db.prepare(`
    INSERT INTO holdings (user_id, symbol, quantity)
    VALUES (?, ?, 0)
  `);

  insertHolding.run(userId, "BTC");
  insertHolding.run(userId, "ETH");
  insertHolding.run(userId, "SOL");

  console.log("Demo user created with $10,000 ✅");
}

module.exports = db;