# PaperTrade — Real-Time Crypto Trade Simulator

PaperTrade is a full-stack paper-trading simulator that allows users to practice buying and selling cryptocurrencies using **live market prices** with **dummy USD** instead of real money.

The application focuses on real-time market updates, safe trade execution, persistence, race-condition protection, and correct decimal handling.

---

## Features

- Starts with **$10,000 dummy USD**
- Live crypto prices for:
  - Bitcoin (BTC)
  - Ethereum (ETH)
  - Solana (SOL)
- Binance public WebSocket for real-time prices
- Market BUY and SELL orders
- Immediate USD balance update after trades
- Immediate crypto holdings update after trades
- Persistent trade history using SQLite
- Recent activity table
- Portfolio valuation using live prices
- Race-condition protection for BUY orders
- Decimal.js for safer financial calculations
- Historical crypto charts using TradingView Lightweight Charts
- Supported chart ranges:
  - 1H
  - 4H
  - 1D
  - 1W
  - 1M
- Expandable full-screen chart modal
- Clean responsive desktop trading UI

---

## Tech Stack

### Frontend

- React
- Vite
- JavaScript
- CSS
- TradingView Lightweight Charts

### Backend

- Node.js
- Express
- SQLite
- better-sqlite3
- Decimal.js
- CORS

### Market Data

- Binance Public WebSocket
- Binance Historical Market Data API

---

## Project Structure

```text
trade-simulator/
│
├── BACKEND/
│   ├── database/
│   │   └── db.js
│   ├── server.js
│   └── trade_simulator.db
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── LiveChart.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── package-lock.json
│
├── .gitignore
└── README.md