import { useEffect, useState } from "react";

const API = "http://localhost:5000";

function App() {
  const [backendStatus, setBackendStatus] = useState("Checking");

  const [portfolio, setPortfolio] = useState(null);
  const [trades, setTrades] = useState([]);

  const [prices, setPrices] = useState({
    BTC: null,
    ETH: null,
    SOL: null,
  });

  const [selectedCoin, setSelectedCoin] = useState("BTC");
  const [tradeMode, setTradeMode] = useState("BUY");

  const [buyAmount, setBuyAmount] = useState("");
  const [sellQuantity, setSellQuantity] = useState("");

  const [tradeMessage, setTradeMessage] = useState("");
  const [isTrading, setIsTrading] = useState(false);

  const loadPortfolio = async () => {
    try {
      const response = await fetch(`${API}/api/portfolio`);
      const data = await response.json();

      if (data.success) {
        setPortfolio(data);
      }
    } catch (error) {
      console.error("Portfolio error:", error);
    }
  };

  const loadTrades = async () => {
    try {
      const response = await fetch(`${API}/api/trades`);
      const data = await response.json();

      if (data.success) {
        setTrades(data.trades);
      }
    } catch (error) {
      console.error("Trade history error:", error);
    }
  };

  const refreshData = async () => {
    await Promise.all([loadPortfolio(), loadTrades()]);
  };

  useEffect(() => {
    // Backend health check
    fetch(`${API}/api/health`)
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          setBackendStatus("Connected");
        }
      })
      .catch(() => {
        setBackendStatus("Disconnected");
      });

    // Initial portfolio load
    fetch(`${API}/api/portfolio`)
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          setPortfolio(data);
        }
      })
      .catch((error) => {
        console.error("Portfolio error:", error);
      });

    // Initial trade history load
    fetch(`${API}/api/trades`)
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          setTrades(data.trades);
        }
      })
      .catch((error) => {
        console.error("Trade history error:", error);
      });

    // Binance WebSocket
    const socket = new WebSocket(
      "wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/solusdt@trade"
    );

    socket.onopen = () => {
      console.log("Connected to Binance WebSocket");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      const symbol = message.data.s;
      const price = Number(message.data.p);

      if (symbol === "BTCUSDT") {
        setPrices((prev) => ({
          ...prev,
          BTC: price,
        }));
      }

      if (symbol === "ETHUSDT") {
        setPrices((prev) => ({
          ...prev,
          ETH: price,
        }));
      }

      if (symbol === "SOLUSDT") {
        setPrices((prev) => ({
          ...prev,
          SOL: price,
        }));
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      socket.close();
    };
  }, []);

  const handleBuy = async () => {
    const amount = Number(buyAmount);
    const currentPrice = prices[selectedCoin];

    if (!amount || amount <= 0) {
      setTradeMessage("Enter a valid USD amount.");
      return;
    }

    if (!currentPrice) {
      setTradeMessage("Live price unavailable.");
      return;
    }

    try {
      setIsTrading(true);
      setTradeMessage("Processing market order...");

      const response = await fetch(`${API}/api/trade/buy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: selectedCoin,
          usdAmount: amount,
          price: currentPrice,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setTradeMessage(data.message || "Buy failed.");
        return;
      }

      setTradeMessage(
        `Bought ${Number(data.quantity).toFixed(8)} ${selectedCoin}`
      );

      setBuyAmount("");
      await refreshData();
    } catch (error) {
      console.error("BUY error:", error);
      setTradeMessage("Buy failed.");
    } finally {
      setIsTrading(false);
    }
  };

  const handleSell = async () => {
    const quantity = Number(sellQuantity);
    const currentPrice = prices[selectedCoin];

    if (!quantity || quantity <= 0) {
      setTradeMessage("Enter a valid quantity.");
      return;
    }

    if (!currentPrice) {
      setTradeMessage("Live price unavailable.");
      return;
    }

    try {
      setIsTrading(true);
      setTradeMessage("Processing market order...");

      const response = await fetch(`${API}/api/trade/sell`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: selectedCoin,
          quantity,
          price: currentPrice,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setTradeMessage(data.message || "Sell failed.");
        return;
      }

      setTradeMessage(
        `Sold ${Number(data.soldQuantity).toFixed(8)} ${selectedCoin}`
      );

      setSellQuantity("");
      await refreshData();
    } catch (error) {
      console.error("SELL error:", error);
      setTradeMessage("Sell failed.");
    } finally {
      setIsTrading(false);
    }
  };

  const getHolding = (symbol) => {
    if (!portfolio) return 0;

    const holding = portfolio.holdings.find(
      (coin) => coin.symbol === symbol
    );

    return holding ? Number(holding.quantity) : 0;
  };

  const availableCash = portfolio
    ? Number(portfolio.user.usdBalance)
    : 0;

  const holdingsValue = Object.keys(prices).reduce(
    (total, symbol) => {
      return (
        total +
        getHolding(symbol) * Number(prices[symbol] || 0)
      );
    },
    0
  );

  const portfolioValue = availableCash + holdingsValue;

  const cashPercentage = Math.max(
    0,
    Math.min(100, (availableCash / 10000) * 100)
  );

  const selectedHolding = getHolding(selectedCoin);

  return (
    <div className="site-shell">
      <header className="desktop-header">
        <div className="brand">PAPERTRADE</div>

        <nav className="header-nav">
          <button
            onClick={() =>
              document
                .getElementById("market")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Market
          </button>

          <button
            onClick={() =>
              document
                .getElementById("trade")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Trade
          </button>

          <button
            onClick={() =>
              document
                .getElementById("portfolio")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Portfolio
          </button>

          <button
            onClick={() =>
              document
                .getElementById("history")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            History
          </button>
        </nav>

        <div className="connection-state">
          <span
            className={`connection-dot ${
              backendStatus === "Connected" ? "online" : "offline"
            }`}
          />

          {backendStatus}
        </div>
      </header>

      <main className="dashboard-grid">
        {/* MARKET PANEL */}
        <section
          className="panel market-panel"
          id="market"
        >
          <div className="panel-toolbar">
            <div className="tiny-tabs">
              <button className="tiny-tab active">
                Live
              </button>

              <button className="tiny-tab">
                Crypto
              </button>
            </div>

            <span className="toolbar-icon">
              ◉
            </span>
          </div>

          <div className="market-art">
            <img
              src="/market-art.jpg"
              alt="Crypto market artwork"
              onError={(event) => {
                event.currentTarget.style.display =
                  "none";
              }}
            />

            <div className="art-fallback">
              <span>◇</span>
              <span>◇</span>
              <span>◇</span>
              <span>◇</span>
            </div>
          </div>

          <article className="market-feature-card">
            <div className="market-feature-top">
              <h2>{selectedCoin}</h2>

              <span>◌</span>
            </div>

            <div className="market-price-large">
              {prices[selectedCoin]
                ? `$${prices[
                    selectedCoin
                  ].toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}`
                : "Loading..."}
            </div>

            <p>
              Live {selectedCoin}/USDT
              market data streamed through
              Binance WebSocket. Execute
              simulated trades using the
              displayed market price.
            </p>

            <div className="feature-meta">
              <span>◎ LIVE</span>
              <span>△ PAPER</span>
              <span>◉ 3 ASSETS</span>
            </div>
          </article>

          <div className="market-assets">
            {["BTC", "ETH", "SOL"].map(
              (symbol) => (
                <button
                  key={symbol}
                  className={`market-asset ${
                    selectedCoin === symbol
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedCoin(symbol);
                    setTradeMessage("");
                  }}
                >
                  <div>
                    <strong>{symbol}</strong>

                    <small>
                      {symbol}/USDT
                    </small>
                  </div>

                  <span>
                    {prices[symbol]
                      ? `$${prices[
                          symbol
                        ].toLocaleString(
                          undefined,
                          {
                            maximumFractionDigits: 2,
                          }
                        )}`
                      : "..."}
                  </span>
                </button>
              )
            )}
          </div>
        </section>

        {/* TRADE PANEL */}
        <section
          className="panel trade-panel"
          id="trade"
        >
          <div className="panel-toolbar">
            <div className="tiny-tabs">
              <button
                className={`tiny-tab ${
                  tradeMode === "BUY"
                    ? "active"
                    : ""
                }`}
                onClick={() => {
                  setTradeMode("BUY");
                  setTradeMessage("");
                }}
              >
                Buy
              </button>

              <button
                className={`tiny-tab ${
                  tradeMode === "SELL"
                    ? "active"
                    : ""
                }`}
                onClick={() => {
                  setTradeMode("SELL");
                  setTradeMessage("");
                }}
              >
                Sell
              </button>
            </div>

            <span className="toolbar-icon">
              ↗
            </span>
          </div>

          <div className="trade-intro">
            <h1>
              Practice trading
              <br />
              without the risk
            </h1>

            <p>
              Start with $10,000 in virtual
              cash and execute real-time
              market orders.
            </p>
          </div>

          <div className="cash-progress">
            <div className="cash-track">
              <div
                className="cash-fill"
                style={{
                  width: `${cashPercentage}%`,
                }}
              />
            </div>

            <div className="cash-label">
              <strong>
                $
                {availableCash.toLocaleString(
                  undefined,
                  {
                    maximumFractionDigits: 0,
                  }
                )}
              </strong>

              <span>/ 10,000</span>
            </div>
          </div>

          <article className="order-card">
            <div className="order-heading">
              <div className="coin-outline">
                {selectedCoin.charAt(0)}
              </div>

              <div>
                <h2>{selectedCoin}</h2>
                <span>Market order</span>
              </div>
            </div>

            <div className="order-stats">
              <div>
                <strong>
                  {prices[selectedCoin]
                    ? `$${prices[
                        selectedCoin
                      ].toLocaleString(
                        undefined,
                        {
                          maximumFractionDigits: 2,
                        }
                      )}`
                    : "..."}
                </strong>

                <span>Live price</span>
              </div>

              <div>
                <strong>
                  {selectedHolding.toFixed(8)}
                </strong>

                <span>Holding</span>
              </div>
            </div>

            {tradeMode === "BUY" ? (
              <div className="order-form">
                <label>USD AMOUNT</label>

                <input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={buyAmount}
                  onChange={(event) =>
                    setBuyAmount(
                      event.target.value
                    )
                  }
                />

                <button
                  className="execute-button"
                  onClick={handleBuy}
                  disabled={isTrading}
                >
                  {isTrading
                    ? "PROCESSING..."
                    : `BUY ${selectedCoin} →`}
                </button>
              </div>
            ) : (
              <div className="order-form">
                <label>
                  {selectedCoin} QUANTITY
                </label>

                <input
                  type="number"
                  min="0"
                  placeholder="0.00000000"
                  value={sellQuantity}
                  onChange={(event) =>
                    setSellQuantity(
                      event.target.value
                    )
                  }
                />

                <button
                  className="execute-button"
                  onClick={handleSell}
                  disabled={isTrading}
                >
                  {isTrading
                    ? "PROCESSING..."
                    : `SELL ${selectedCoin} →`}
                </button>
              </div>
            )}

            {tradeMessage && (
              <div className="order-message">
                {tradeMessage}
              </div>
            )}
          </article>
        </section>

        {/* PROFILE / PORTFOLIO */}
        <section
          className="panel profile-panel"
          id="portfolio"
        >
          <div className="panel-toolbar right-toolbar">
            <span></span>

            <span className="toolbar-icon">
              ≡
            </span>
          </div>

          <div className="profile-block">
            <div className="profile-avatar">
              <img
                src="/avatar.jpg"
                alt="Trader avatar"
                onError={(event) => {
                  event.currentTarget.style.display =
                    "none";
                }}
              />

              <span>PT</span>
            </div>

            <h2>Demo Trader</h2>

            <p>papertrade.local</p>
          </div>

          <div className="achievements-label">
            ACHIEVEMENTS
          </div>

          <div className="achievement-strip">
            <div>◎</div>
            <div>♢</div>
            <div>◌</div>
            <div>◇</div>
          </div>

          <article className="portfolio-main-card">
            <div className="portfolio-card-title">
              <div className="coin-outline">
                $
              </div>

              <h2>Portfolio</h2>
            </div>

            <div className="portfolio-total">
              <strong>
                $
                {portfolioValue.toLocaleString(
                  undefined,
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }
                )}
              </strong>

              <span>Total account value</span>
            </div>

            <div className="portfolio-kpis">
              <div>
                <strong>{trades.length}</strong>
                <span>Trades</span>
              </div>

              <div>
                <strong>
                  $
                  {availableCash.toLocaleString(
                    undefined,
                    {
                      maximumFractionDigits: 0,
                    }
                  )}
                </strong>
                <span>Cash</span>
              </div>

              <div>
                <strong>3</strong>
                <span>Assets</span>
              </div>
            </div>

            <div className="portfolio-holdings">
              {portfolio &&
                portfolio.holdings.map(
                  (coin) => {
                    const quantity = Number(
                      coin.quantity
                    );

                    const value =
                      quantity *
                      Number(
                        prices[coin.symbol] ||
                          0
                      );

                    return (
                      <div
                        className="portfolio-holding-row"
                        key={coin.symbol}
                      >
                        <div>
                          <strong>
                            {coin.symbol}
                          </strong>

                          <span>
                            {quantity.toFixed(8)}
                          </span>
                        </div>

                        <strong>
                          $
                          {value.toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
                        </strong>
                      </div>
                    );
                  }
                )}
            </div>
          </article>
        </section>
      </main>

      {/* HISTORY */}
      <section
        className="history-panel"
        id="history"
      >
        <div className="history-title-row">
          <div>
            <span>ACTIVITY</span>
            <h2>Recent trades</h2>
          </div>

          <span>
            {trades.length} transactions
          </span>
        </div>

        <div className="history-header">
          <span>Side</span>
          <span>Asset</span>
          <span>Quantity</span>
          <span>Price</span>
          <span>Total</span>
          <span>Time</span>
        </div>

        <div className="history-list">
          {trades.length === 0 ? (
            <div className="no-trades">
              No trades yet.
            </div>
          ) : (
            trades.map((trade) => (
              <div
                className="history-trade"
                key={trade.id}
              >
                <span className="side-pill">
                  {trade.type}
                </span>

                <strong>
                  {trade.symbol}
                </strong>

                <span>
                  {Number(
                    trade.quantity
                  ).toFixed(8)}
                </span>

                <span>
                  $
                  {Number(
                    trade.price
                  ).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>

                <strong>
                  $
                  {Number(
                    trade.total
                  ).toFixed(2)}
                </strong>

                <span className="trade-time">
                  {trade.created_at}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default App;