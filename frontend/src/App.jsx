import { useEffect, useState } from "react";

const API = "http://localhost:5000";

const ASSETS = {
  BTC: {
    name: "Bitcoin",
    pair: "BTC / USDT",
    mark: "₿",
  },
  ETH: {
    name: "Ethereum",
    pair: "ETH / USDT",
    mark: "Ξ",
  },
  SOL: {
    name: "Solana",
    pair: "SOL / USDT",
    mark: "S",
  },
};

function formatMoney(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "$0.00";
  }

  return `$${number.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatPrice(value) {
  if (!value) return "Loading...";

  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function App() {
  const [backendStatus, setBackendStatus] =
    useState("Checking");

  const [portfolio, setPortfolio] =
    useState(null);

  const [trades, setTrades] =
    useState([]);

  const [prices, setPrices] = useState({
    BTC: null,
    ETH: null,
    SOL: null,
  });

  const [selectedCoin, setSelectedCoin] =
    useState("BTC");

  const [tradeMode, setTradeMode] =
    useState("BUY");

  const [buyAmount, setBuyAmount] =
    useState("");

  const [sellQuantity, setSellQuantity] =
    useState("");

  const [tradeMessage, setTradeMessage] =
    useState("");

  const [isTrading, setIsTrading] =
    useState(false);

  /* =========================================
     INITIAL DATA + WEBSOCKET
  ========================================= */

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          setBackendStatus("Connected");
        } else {
          setBackendStatus("Disconnected");
        }
      })
      .catch(() => {
        setBackendStatus("Disconnected");
      });

    fetch(`${API}/api/portfolio`)
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          setPortfolio(data);
        }
      })
      .catch((error) => {
        console.error(
          "Portfolio error:",
          error
        );
      });

    fetch(`${API}/api/trades`)
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          setTrades(data.trades);
        }
      })
      .catch((error) => {
        console.error(
          "Trade history error:",
          error
        );
      });

    const socket = new WebSocket(
      "wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/solusdt@trade"
    );

    socket.onopen = () => {
      console.log(
        "Connected to Binance WebSocket"
      );
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(
          event.data
        );

        const symbol =
          message?.data?.s;

        const price =
          Number(message?.data?.p);

        if (!Number.isFinite(price)) {
          return;
        }

        if (symbol === "BTCUSDT") {
          setPrices((previous) => ({
            ...previous,
            BTC: price,
          }));
        }

        if (symbol === "ETHUSDT") {
          setPrices((previous) => ({
            ...previous,
            ETH: price,
          }));
        }

        if (symbol === "SOLUSDT") {
          setPrices((previous) => ({
            ...previous,
            SOL: price,
          }));
        }
      } catch (error) {
        console.error(
          "WebSocket message error:",
          error
        );
      }
    };

    socket.onerror = (error) => {
      console.error(
        "WebSocket error:",
        error
      );
    };

    return () => {
      socket.close();
    };
  }, []);

  /* =========================================
     REFRESH DATABASE DATA
  ========================================= */

  const refreshPortfolio = async () => {
    const response = await fetch(
      `${API}/api/portfolio`
    );

    const data = await response.json();

    if (data.success) {
      setPortfolio(data);
    }
  };

  const refreshTrades = async () => {
    const response = await fetch(
      `${API}/api/trades`
    );

    const data = await response.json();

    if (data.success) {
      setTrades(data.trades);
    }
  };

  const refreshData = async () => {
    await Promise.all([
      refreshPortfolio(),
      refreshTrades(),
    ]);
  };

  /* =========================================
     PORTFOLIO HELPERS
  ========================================= */

  const getHolding = (symbol) => {
    if (!portfolio?.holdings) {
      return 0;
    }

    const holding =
      portfolio.holdings.find(
        (item) =>
          item.symbol === symbol
      );

    return holding
      ? Number(holding.quantity)
      : 0;
  };

  const cashBalance =
    portfolio?.user?.usdBalance !== undefined
      ? Number(
          portfolio.user.usdBalance
        )
      : 0;

  const holdingsValue =
    Object.keys(ASSETS).reduce(
      (total, symbol) => {
        const quantity =
          getHolding(symbol);

        const price =
          Number(
            prices[symbol] || 0
          );

        return (
          total + quantity * price
        );
      },
      0
    );

  const totalPortfolioValue =
    cashBalance + holdingsValue;

  const selectedHolding =
    getHolding(selectedCoin);

  const selectedPrice =
    prices[selectedCoin];

  const selectedAsset =
    ASSETS[selectedCoin];

  /* =========================================
     BUY
  ========================================= */

  const handleBuy = async () => {
    const amount =
      Number(buyAmount);

    const currentPrice =
      prices[selectedCoin];

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setTradeMessage(
        "Enter a valid USD amount."
      );
      return;
    }

    if (!currentPrice) {
      setTradeMessage(
        "Live market price unavailable."
      );
      return;
    }

    try {
      setIsTrading(true);

      setTradeMessage(
        "Executing market order..."
      );

      const response = await fetch(
        `${API}/api/trade/buy`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            symbol: selectedCoin,
            usdAmount: amount,
            price: currentPrice,
          }),
        }
      );

      const data =
        await response.json();

      if (!data.success) {
        setTradeMessage(
          data.message ||
            "Buy order failed."
        );
        return;
      }

      setTradeMessage(
        `Bought ${Number(
          data.quantity
        ).toFixed(
          8
        )} ${selectedCoin} at ${formatPrice(
          currentPrice
        )}`
      );

      setBuyAmount("");

      await refreshData();
    } catch (error) {
      console.error(
        "BUY error:",
        error
      );

      setTradeMessage(
        "Unable to complete BUY order."
      );
    } finally {
      setIsTrading(false);
    }
  };

  /* =========================================
     SELL
  ========================================= */

  const handleSell = async () => {
    const quantity =
      Number(sellQuantity);

    const currentPrice =
      prices[selectedCoin];

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      setTradeMessage(
        "Enter a valid quantity."
      );
      return;
    }

    if (!currentPrice) {
      setTradeMessage(
        "Live market price unavailable."
      );
      return;
    }

    try {
      setIsTrading(true);

      setTradeMessage(
        "Executing market order..."
      );

      const response = await fetch(
        `${API}/api/trade/sell`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            symbol: selectedCoin,
            quantity,
            price: currentPrice,
          }),
        }
      );

      const data =
        await response.json();

      if (!data.success) {
        setTradeMessage(
          data.message ||
            "Sell order failed."
        );
        return;
      }

      setTradeMessage(
        `Sold ${Number(
          data.soldQuantity
        ).toFixed(
          8
        )} ${selectedCoin} at ${formatPrice(
          currentPrice
        )}`
      );

      setSellQuantity("");

      await refreshData();
    } catch (error) {
      console.error(
        "SELL error:",
        error
      );

      setTradeMessage(
        "Unable to complete SELL order."
      );
    } finally {
      setIsTrading(false);
    }
  };

  /* =========================================
     QUICK BUY AMOUNTS
  ========================================= */

  const setQuickBuy = (amount) => {
    setBuyAmount(
      String(
        Math.min(
          amount,
          cashBalance
        )
      )
    );
  };

  /* =========================================
     QUICK SELL
  ========================================= */

  const setQuickSell = (
    percentage
  ) => {
    const quantity =
      selectedHolding *
      percentage;

    setSellQuantity(
      quantity.toFixed(8)
    );
  };

  /* =========================================
     ESTIMATE
  ========================================= */

  const estimatedBuyQuantity =
    selectedPrice &&
    Number(buyAmount) > 0
      ? Number(buyAmount) /
        selectedPrice
      : 0;

  const estimatedSellValue =
    selectedPrice &&
    Number(sellQuantity) > 0
      ? Number(
          sellQuantity
        ) * selectedPrice
      : 0;

  return (
    <div className="app-shell">
      {/* =====================================
          HEADER
      ====================================== */}

      <header className="topbar">
        <button
          className="brand"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: "smooth",
            })
          }
        >
          <span className="brand-symbol">
            P
          </span>

          <span>
            PAPERTRADE
          </span>
        </button>

        <nav className="top-navigation">
          <button
            onClick={() =>
              document
                .getElementById(
                  "market"
                )
                ?.scrollIntoView({
                  behavior:
                    "smooth",
                })
            }
          >
            Market
          </button>

          <button
            onClick={() =>
              document
                .getElementById(
                  "trade"
                )
                ?.scrollIntoView({
                  behavior:
                    "smooth",
                })
            }
          >
            Trade
          </button>

          <button
            onClick={() =>
              document
                .getElementById(
                  "portfolio"
                )
                ?.scrollIntoView({
                  behavior:
                    "smooth",
                })
            }
          >
            Portfolio
          </button>

          <button
            onClick={() =>
              document
                .getElementById(
                  "activity"
                )
                ?.scrollIntoView({
                  behavior:
                    "smooth",
                })
            }
          >
            Activity
          </button>
        </nav>

        <div className="connection">
          <span
            className={`status-dot ${
              backendStatus ===
              "Connected"
                ? "connected"
                : ""
            }`}
          />

          <span>
            {backendStatus ===
            "Connected"
              ? "SYSTEM ONLINE"
              : backendStatus.toUpperCase()}
          </span>
        </div>
      </header>

      {/* =====================================
          PAGE INTRO
      ====================================== */}

      <section className="page-heading">
        <div>
          <span className="eyebrow">
            PAPER TRADING TERMINAL
          </span>

          <h1>
            Markets without
            <br />
            the consequences.
          </h1>
        </div>

        <div className="page-heading-copy">
          <p>
            Practice crypto
            trading with live
            market prices and
            $10,000 in simulated
            capital.
          </p>

          <div className="heading-meta">
            <span>
              BTC / ETH / SOL
            </span>

            <span>
              BINANCE LIVE
            </span>
          </div>
        </div>
      </section>

      {/* =====================================
          MAIN DESKTOP GRID
      ====================================== */}

      <main className="workspace">
        {/* MARKET COLUMN */}

        <section
          className="workspace-panel market-column"
          id="market"
        >
          <div className="section-header">
            <div>
              <span className="section-index">
                01
              </span>

              <h2>
                Market
              </h2>
            </div>

            <span className="live-badge">
              LIVE
            </span>
          </div>

          <div className="market-visual">
            <div className="art-grid" />

            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />

            <div className="art-symbol">
              {
                selectedAsset.mark
              }
            </div>

            <div className="market-art-bottom">
              <span>
                {
                  selectedAsset.name
                }
              </span>

              <span>
                REAL-TIME
              </span>
            </div>
          </div>

          <article className="featured-market">
            <div className="featured-market-top">
              <div>
                <span className="small-label">
                  SELECTED ASSET
                </span>

                <h3>
                  {
                    selectedAsset.name
                  }
                </h3>
              </div>

              <div className="asset-logo">
                {
                  selectedAsset.mark
                }
              </div>
            </div>

            <div className="hero-price">
              {formatPrice(
                selectedPrice
              )}
            </div>

            <p className="market-description">
              Live{" "}
              {
                selectedAsset.pair
              }{" "}
              price streamed from
              Binance. Orders are
              executed using the
              market price shown
              here.
            </p>

            <div className="market-meta">
              <span>
                PUBLIC STREAM
              </span>

              <span>
                WEBSOCKET
              </span>

              <span>
                MARKET
              </span>
            </div>
          </article>

          <div className="asset-list">
            {Object.entries(
              ASSETS
            ).map(
              ([
                symbol,
                asset,
              ]) => (
                <button
                  key={symbol}
                  className={`asset-row ${
                    selectedCoin ===
                    symbol
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedCoin(
                      symbol
                    );

                    setTradeMessage(
                      ""
                    );
                  }}
                >
                  <div className="asset-row-left">
                    <div className="mini-logo">
                      {
                        asset.mark
                      }
                    </div>

                    <div>
                      <strong>
                        {symbol}
                      </strong>

                      <span>
                        {
                          asset.name
                        }
                      </span>
                    </div>
                  </div>

                  <div className="asset-row-right">
                    <strong>
                      {formatPrice(
                        prices[
                          symbol
                        ]
                      )}
                    </strong>

                    <span>
                      {
                        asset.pair
                      }
                    </span>
                  </div>
                </button>
              )
            )}
          </div>
        </section>

        {/* TRADE COLUMN */}

        <section
          className="workspace-panel trade-column"
          id="trade"
        >
          <div className="section-header">
            <div>
              <span className="section-index">
                02
              </span>

              <h2>
                Trade desk
              </h2>
            </div>

            <span className="micro-copy">
              MARKET ORDER
            </span>
          </div>

          <div className="trade-hero">
            <span className="small-label">
              VIRTUAL CAPITAL
            </span>

            <h2>
              Trade live.
              <br />
              Risk nothing.
            </h2>

            <p>
              Your trades use
              real-time crypto
              prices while your
              balance remains fully
              simulated.
            </p>
          </div>

          <div className="balance-progress">
            <div className="progress-top">
              <span>
                AVAILABLE CASH
              </span>

              <strong>
                {formatMoney(
                  cashBalance
                )}
              </strong>
            </div>

            <div className="progress-track">
              <div
                className="progress-value"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      (cashBalance /
                        10000) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>

            <div className="progress-bottom">
              <span>$0</span>
              <span>
                STARTED WITH
                $10,000
              </span>
            </div>
          </div>

          <article className="trade-ticket">
            <div className="ticket-top">
              <div className="ticket-asset">
                <div className="ticket-logo">
                  {
                    selectedAsset.mark
                  }
                </div>

                <div>
                  <span className="small-label">
                    TRADING
                  </span>

                  <h3>
                    {
                      selectedCoin
                    }
                    /USDT
                  </h3>
                </div>
              </div>

              <div className="ticket-price">
                <span>
                  LIVE PRICE
                </span>

                <strong>
                  {formatPrice(
                    selectedPrice
                  )}
                </strong>
              </div>
            </div>

            <div className="mode-switch">
              <button
                className={
                  tradeMode ===
                  "BUY"
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setTradeMode(
                    "BUY"
                  );

                  setTradeMessage(
                    ""
                  );
                }}
              >
                BUY
              </button>

              <button
                className={
                  tradeMode ===
                  "SELL"
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setTradeMode(
                    "SELL"
                  );

                  setTradeMessage(
                    ""
                  );
                }}
              >
                SELL
              </button>
            </div>

            {tradeMode ===
            "BUY" ? (
              <>
                <div className="input-group">
                  <div className="input-label-row">
                    <label>
                      USD AMOUNT
                    </label>

                    <span>
                      CASH{" "}
                      {formatMoney(
                        cashBalance
                      )}
                    </span>
                  </div>

                  <div className="trade-input">
                    <span>$</span>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={
                        buyAmount
                      }
                      onChange={(
                        event
                      ) =>
                        setBuyAmount(
                          event
                            .target
                            .value
                        )
                      }
                    />

                    <span>
                      USD
                    </span>
                  </div>
                </div>

                <div className="quick-buttons">
                  {[25, 50, 100, 250].map(
                    (amount) => (
                      <button
                        key={
                          amount
                        }
                        onClick={() =>
                          setQuickBuy(
                            amount
                          )
                        }
                      >
                        ${amount}
                      </button>
                    )
                  )}
                </div>

                <div className="trade-estimate">
                  <span>
                    ESTIMATED RECEIVE
                  </span>

                  <strong>
                    {estimatedBuyQuantity.toFixed(
                      8
                    )}{" "}
                    {
                      selectedCoin
                    }
                  </strong>
                </div>

                <button
                  className="execute-order"
                  onClick={
                    handleBuy
                  }
                  disabled={
                    isTrading
                  }
                >
                  <span>
                    {isTrading
                      ? "PROCESSING..."
                      : `BUY ${selectedCoin}`}
                  </span>

                  <span>
                    →
                  </span>
                </button>
              </>
            ) : (
              <>
                <div className="input-group">
                  <div className="input-label-row">
                    <label>
                      {
                        selectedCoin
                      }{" "}
                      QUANTITY
                    </label>

                    <span>
                      HOLDING{" "}
                      {selectedHolding.toFixed(
                        8
                      )}
                    </span>
                  </div>

                  <div className="trade-input">
                    <input
                      type="number"
                      min="0"
                      step="0.00000001"
                      placeholder="0.00000000"
                      value={
                        sellQuantity
                      }
                      onChange={(
                        event
                      ) =>
                        setSellQuantity(
                          event
                            .target
                            .value
                        )
                      }
                    />

                    <span>
                      {
                        selectedCoin
                      }
                    </span>
                  </div>
                </div>

                <div className="quick-buttons">
                  <button
                    onClick={() =>
                      setQuickSell(
                        0.25
                      )
                    }
                  >
                    25%
                  </button>

                  <button
                    onClick={() =>
                      setQuickSell(
                        0.5
                      )
                    }
                  >
                    50%
                  </button>

                  <button
                    onClick={() =>
                      setQuickSell(
                        0.75
                      )
                    }
                  >
                    75%
                  </button>

                  <button
                    onClick={() =>
                      setQuickSell(
                        1
                      )
                    }
                  >
                    MAX
                  </button>
                </div>

                <div className="trade-estimate">
                  <span>
                    ESTIMATED VALUE
                  </span>

                  <strong>
                    {formatMoney(
                      estimatedSellValue
                    )}
                  </strong>
                </div>

                <button
                  className="execute-order"
                  onClick={
                    handleSell
                  }
                  disabled={
                    isTrading
                  }
                >
                  <span>
                    {isTrading
                      ? "PROCESSING..."
                      : `SELL ${selectedCoin}`}
                  </span>

                  <span>
                    →
                  </span>
                </button>
              </>
            )}

            {tradeMessage && (
              <div className="trade-message">
                <span>
                  ◌
                </span>

                <p>
                  {
                    tradeMessage
                  }
                </p>
              </div>
            )}
          </article>
        </section>

        {/* PORTFOLIO COLUMN */}

        <section
          className="workspace-panel portfolio-column"
          id="portfolio"
        >
          <div className="section-header">
            <div>
              <span className="section-index">
                03
              </span>

              <h2>
                Portfolio
              </h2>
            </div>

            <span className="micro-copy">
              DEMO ACCOUNT
            </span>
          </div>

          <div className="profile-card">
            <div className="profile-avatar">
              PT
            </div>

            <h3>
              Demo Trader
            </h3>

            <span>
              PAPERTRADE.LOCAL
            </span>

            <div className="profile-icons">
              <div>◎</div>
              <div>◇</div>
              <div>◌</div>
              <div>△</div>
            </div>
          </div>

          <article className="portfolio-card">
            <div className="portfolio-heading">
              <span className="small-label">
                TOTAL ACCOUNT VALUE
              </span>

              <span className="portfolio-arrow">
                ↗
              </span>
            </div>

            <div className="portfolio-total">
              {formatMoney(
                totalPortfolioValue
              )}
            </div>

            <div className="portfolio-summary">
              <div>
                <span>
                  CASH
                </span>

                <strong>
                  {formatMoney(
                    cashBalance
                  )}
                </strong>
              </div>

              <div>
                <span>
                  CRYPTO
                </span>

                <strong>
                  {formatMoney(
                    holdingsValue
                  )}
                </strong>
              </div>

              <div>
                <span>
                  TRADES
                </span>

                <strong>
                  {
                    trades.length
                  }
                </strong>
              </div>
            </div>

            <div className="holdings-heading">
              <span>
                HOLDINGS
              </span>

              <span>
                VALUE
              </span>
            </div>

            <div className="holdings-list">
              {Object.entries(
                ASSETS
              ).map(
                ([
                  symbol,
                  asset,
                ]) => {
                  const quantity =
                    getHolding(
                      symbol
                    );

                  const value =
                    quantity *
                    Number(
                      prices[
                        symbol
                      ] || 0
                    );

                  return (
                    <button
                      className="holding-row"
                      key={
                        symbol
                      }
                      onClick={() =>
                        setSelectedCoin(
                          symbol
                        )
                      }
                    >
                      <div className="holding-info">
                        <div className="mini-logo">
                          {
                            asset.mark
                          }
                        </div>

                        <div>
                          <strong>
                            {
                              symbol
                            }
                          </strong>

                          <span>
                            {quantity.toFixed(
                              8
                            )}
                          </span>
                        </div>
                      </div>

                      <strong>
                        {formatMoney(
                          value
                        )}
                      </strong>
                    </button>
                  );
                }
              )}
            </div>
          </article>
        </section>
      </main>

      {/* =====================================
          ACTIVITY
      ====================================== */}

      <section
        className="activity-section"
        id="activity"
      >
        <div className="activity-heading">
          <div>
            <span className="section-index">
              04
            </span>

            <h2>
              Recent activity
            </h2>
          </div>

          <div className="activity-meta">
            <span>
              {
                trades.length
              }{" "}
              TRANSACTIONS
            </span>

            <span>
              LATEST 20
            </span>
          </div>
        </div>

        <div className="activity-table">
          <div className="activity-table-head">
            <span>
              SIDE
            </span>

            <span>
              ASSET
            </span>

            <span>
              QUANTITY
            </span>

            <span>
              EXECUTION PRICE
            </span>

            <span>
              TOTAL
            </span>

            <span>
              TIME
            </span>
          </div>

          {trades.length ===
          0 ? (
            <div className="empty-activity">
              No trades have
              been executed yet.
            </div>
          ) : (
            trades.map(
              (trade) => (
                <div
                  className="activity-row"
                  key={
                    trade.id
                  }
                >
                  <span
                    className={`trade-side ${
                      trade.type ===
                      "BUY"
                        ? "buy"
                        : "sell"
                    }`}
                  >
                    {
                      trade.type
                    }
                  </span>

                  <div className="activity-asset">
                    <div className="table-coin">
                      {ASSETS[
                        trade
                          .symbol
                      ]?.mark ||
                        trade.symbol?.charAt(
                          0
                        )}
                    </div>

                    <strong>
                      {
                        trade.symbol
                      }
                    </strong>
                  </div>

                  <span>
                    {Number(
                      trade.quantity
                    ).toFixed(
                      8
                    )}
                  </span>

                  <span>
                    {formatPrice(
                      trade.price
                    )}
                  </span>

                  <strong>
                    {formatMoney(
                      trade.total
                    )}
                  </strong>

                  <span className="activity-time">
                    {
                      trade.created_at
                    }
                  </span>
                </div>
              )
            )
          )}
        </div>
      </section>

      <footer className="footer">
        <span>
          PAPERTRADE /
          REAL-TIME CRYPTO
          SIMULATOR
        </span>

        <span>
          DATA PROVIDED BY
          BINANCE PUBLIC
          WEBSOCKET
        </span>

        <span>
          FOR SIMULATION ONLY
        </span>
      </footer>
    </div>
  );
}

export default App;