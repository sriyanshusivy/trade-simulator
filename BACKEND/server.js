const express = require("express");
const cors = require("cors");
const Decimal = require("decimal.js");

const db = require("./database/db");

const app = express();

app.use(cors());
app.use(express.json());

/* ========================================
   DECIMAL / PRECISION CONFIGURATION
======================================== */

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_DOWN,
});

// USD balances / trade totals
const normalizeMoney = (value) => {
  return new Decimal(value).toDecimalPlaces(
    2,
    Decimal.ROUND_DOWN
  );
};

// Crypto quantities
const normalizeQuantity = (value) => {
  return new Decimal(value).toDecimalPlaces(
    8,
    Decimal.ROUND_DOWN
  );
};

// Market price shown to the user
const normalizePrice = (value) => {
  return new Decimal(value).toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP
  );
};

const allowedSymbols = ["BTC", "ETH", "SOL"];

/* ========================================
   BASIC ROUTES
======================================== */

app.get("/", (req, res) => {
  res.json({
    message: "Trade Simulator Backend Running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "OK",
  });
});

/* ========================================
   PORTFOLIO
======================================== */

app.get("/api/portfolio", (req, res) => {
  try {
    const user = db
      .prepare(`
        SELECT
          id,
          username,
          usd_balance
        FROM users
        WHERE username = ?
      `)
      .get("demo");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const holdings = db
      .prepare(`
        SELECT
          symbol,
          quantity
        FROM holdings
        WHERE user_id = ?
      `)
      .all(user.id);

    const cleanedHoldings = holdings.map((holding) => ({
      symbol: holding.symbol,
      quantity: normalizeQuantity(
        holding.quantity
      ).toNumber(),
    }));

    res.json({
      success: true,

      user: {
        id: user.id,
        username: user.username,
        usdBalance: normalizeMoney(
          user.usd_balance
        ).toNumber(),
      },

      holdings: cleanedHoldings,
    });
  } catch (error) {
    console.error("Portfolio error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load portfolio",
    });
  }
});

/* ========================================
   TRADE HISTORY
======================================== */

app.get("/api/trades", (req, res) => {
  try {
    const user = db
      .prepare(`
        SELECT id
        FROM users
        WHERE username = ?
      `)
      .get("demo");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const trades = db
      .prepare(`
        SELECT
          id,
          symbol,
          type,
          quantity,
          price,
          total,
          created_at
        FROM trades
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 20
      `)
      .all(user.id);

    const cleanedTrades = trades.map((trade) => ({
      ...trade,

      quantity: normalizeQuantity(
        trade.quantity
      ).toNumber(),

      price: normalizePrice(
        trade.price
      ).toNumber(),

      total: normalizeMoney(
        trade.total
      ).toNumber(),
    }));

    res.json({
      success: true,
      trades: cleanedTrades,
    });
  } catch (error) {
    console.error("Trade history error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load trades",
    });
  }
});

/* ========================================
   BUY
======================================== */

app.post("/api/trade/buy", (req, res) => {
  try {
    const { symbol, usdAmount, price } = req.body;

    /* ---------- Validation ---------- */

    if (!allowedSymbols.includes(symbol)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cryptocurrency",
      });
    }

    if (
      usdAmount === undefined ||
      price === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Amount and price are required",
      });
    }

    let amount;
    let livePrice;

    try {
      amount = normalizeMoney(usdAmount);
      livePrice = normalizePrice(price);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid amount or price",
      });
    }

    if (amount.lte(0) || livePrice.lte(0)) {
      return res.status(400).json({
        success: false,
        message: "Amount and price must be positive",
      });
    }

    const quantity = normalizeQuantity(
      amount.div(livePrice)
    );

    if (quantity.lte(0)) {
      return res.status(400).json({
        success: false,
        message: "Trade quantity is too small",
      });
    }

    /* ---------- Database transaction ---------- */

    const executeTrade = db.transaction(() => {
      const user = db
        .prepare(`
          SELECT id
          FROM users
          WHERE username = ?
        `)
        .get("demo");

      if (!user) {
        throw new Error("User not found");
      }

      /*
        Atomic balance check.

        Even if two BUY requests arrive very close
        together, the balance is deducted only if
        enough USD exists at the moment the UPDATE
        executes.
      */

      const balanceUpdate = db
        .prepare(`
          UPDATE users

          SET usd_balance =
            ROUND(usd_balance - ?, 2)

          WHERE id = ?
          AND usd_balance >= ?
        `)
        .run(
          amount.toNumber(),
          user.id,
          amount.toNumber()
        );

      if (balanceUpdate.changes !== 1) {
        throw new Error(
          "Insufficient USD balance"
        );
      }

      /*
        Add purchased crypto to user's holding.
      */

      const holdingUpdate = db
        .prepare(`
          UPDATE holdings

          SET quantity =
            ROUND(quantity + ?, 8)

          WHERE user_id = ?
          AND symbol = ?
        `)
        .run(
          quantity.toNumber(),
          user.id,
          symbol
        );

      if (holdingUpdate.changes !== 1) {
        throw new Error("Holding not found");
      }

      /*
        Record completed trade.
      */

      db.prepare(`
        INSERT INTO trades (
          user_id,
          symbol,
          type,
          quantity,
          price,
          total
        )

        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        user.id,
        symbol,
        "BUY",
        quantity.toNumber(),
        livePrice.toNumber(),
        amount.toNumber()
      );

      const updatedUser = db
        .prepare(`
          SELECT usd_balance
          FROM users
          WHERE id = ?
        `)
        .get(user.id);

      return {
        quantity: quantity.toNumber(),

        price: livePrice.toNumber(),

        total: amount.toNumber(),

        newBalance: normalizeMoney(
          updatedUser.usd_balance
        ).toNumber(),
      };
    });

    const result = executeTrade();

    res.json({
      success: true,
      message: `Successfully bought ${symbol}`,
      ...result,
    });
  } catch (error) {
    console.error("BUY error:", error.message);

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/* ========================================
   SELL
======================================== */

app.post("/api/trade/sell", (req, res) => {
  try {
    const { symbol, quantity, price } = req.body;

    /* ---------- Validation ---------- */

    if (!allowedSymbols.includes(symbol)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cryptocurrency",
      });
    }

    if (
      quantity === undefined ||
      price === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Quantity and price are required",
      });
    }

    let sellQuantity;
    let livePrice;

    try {
      sellQuantity =
        normalizeQuantity(quantity);

      livePrice =
        normalizePrice(price);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid quantity or price",
      });
    }

    if (
      sellQuantity.lte(0) ||
      livePrice.lte(0)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Quantity and price must be positive",
      });
    }

    const saleValue = normalizeMoney(
      sellQuantity.mul(livePrice)
    );

    if (saleValue.lte(0)) {
      return res.status(400).json({
        success: false,
        message: "Trade value is too small",
      });
    }

    /* ---------- Database transaction ---------- */

    const executeTrade = db.transaction(() => {
      const user = db
        .prepare(`
          SELECT id
          FROM users
          WHERE username = ?
        `)
        .get("demo");

      if (!user) {
        throw new Error("User not found");
      }

      /*
        Atomic holdings check.

        Crypto is deducted only if enough quantity
        exists when this UPDATE executes.
      */

      const holdingUpdate = db
        .prepare(`
          UPDATE holdings

          SET quantity =
            ROUND(quantity - ?, 8)

          WHERE user_id = ?
          AND symbol = ?
          AND quantity >= ?
        `)
        .run(
          sellQuantity.toNumber(),
          user.id,
          symbol,
          sellQuantity.toNumber()
        );

      if (holdingUpdate.changes !== 1) {
        throw new Error(
          `Insufficient ${symbol} balance`
        );
      }

      /*
        Credit USD after crypto deduction succeeds.
      */

      db.prepare(`
        UPDATE users

        SET usd_balance =
          ROUND(usd_balance + ?, 2)

        WHERE id = ?
      `).run(
        saleValue.toNumber(),
        user.id
      );

      /*
        Record completed trade.
      */

      db.prepare(`
        INSERT INTO trades (
          user_id,
          symbol,
          type,
          quantity,
          price,
          total
        )

        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        user.id,
        symbol,
        "SELL",
        sellQuantity.toNumber(),
        livePrice.toNumber(),
        saleValue.toNumber()
      );

      const updatedUser = db
        .prepare(`
          SELECT usd_balance
          FROM users
          WHERE id = ?
        `)
        .get(user.id);

      return {
        soldQuantity:
          sellQuantity.toNumber(),

        price:
          livePrice.toNumber(),

        saleValue:
          saleValue.toNumber(),

        newBalance: normalizeMoney(
          updatedUser.usd_balance
        ).toNumber(),
      };
    });

    const result = executeTrade();

    res.json({
      success: true,
      message: `Successfully sold ${symbol}`,
      ...result,
    });
  } catch (error) {
    console.error("SELL error:", error.message);

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/* ========================================
   START SERVER
======================================== */

const PORT = 5000;

app.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );
});