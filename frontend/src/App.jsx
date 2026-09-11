import {
  useEffect,
  useRef,
  useState,
} from "react";

import LiveChart from "./LiveChart";

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

const CHART_RANGES = {
  "1H": {
    interval: "1m",
    limit: 60,
  },

  "4H": {
    interval: "5m",
    limit: 48,
  },

  "1D": {
    interval: "15m",
    limit: 96,
  },

  "1W": {
    interval: "1h",
    limit: 168,
  },

  "1M": {
    interval: "4h",
    limit: 180,
  },
};

function formatMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "$0.00";
  }

  return `$${number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || !number) {
    return "Loading...";
  }

  return `$${number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function App() {
  /* ========================================
     MAIN STATE
  ======================================== */

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

  const selectedCoinRef =
    useRef("BTC");

  /* ========================================
     CHART STATE
  ======================================== */

  const [priceHistory, setPriceHistory] =
    useState([]);

  const [chartRange, setChartRange] =
    useState("1H");

  const [historyLoading, setHistoryLoading] =
    useState(true);

  const [isChartOpen, setIsChartOpen] =
    useState(false);

  /* ========================================
     TRADE STATE
  ======================================== */

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

  /* ========================================
     KEEP SELECTED COIN REF UPDATED
  ======================================== */

  useEffect(() => {
    selectedCoinRef.current =
      selectedCoin;
  }, [selectedCoin]);

  /* ========================================
     INITIAL BACKEND DATA + WEBSOCKET
  ======================================== */

  useEffect(() => {
    /* Backend health */

    fetch(`${API}/api/health`)
      .then((response) =>
        response.json()
      )
      .then((data) => {
        if (data.success) {
          setBackendStatus(
            "Connected"
          );
        } else {
          setBackendStatus(
            "Disconnected"
          );
        }
      })
      .catch(() => {
        setBackendStatus(
          "Disconnected"
        );
      });

    /* Portfolio */

    fetch(`${API}/api/portfolio`)
      .then((response) =>
        response.json()
      )
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

    /* Trade history */

    fetch(`${API}/api/trades`)
      .then((response) =>
        response.json()
      )
      .then((data) => {
        if (data.success) {
          setTrades(
            data.trades
          );
        }
      })
      .catch((error) => {
        console.error(
          "Trade history error:",
          error
        );
      });

    /* Binance live WebSocket */

    const socket =
      new WebSocket(
        "wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/solusdt@trade"
      );

    socket.onopen = () => {
      console.log(
        "Connected to Binance WebSocket"
      );
    };

    socket.onmessage = (
      event
    ) => {
      try {
        const message =
          JSON.parse(
            event.data
          );

        const symbol =
          message?.data?.s;

        const price =
          Number(
            message?.data?.p
          );

        if (
          !Number.isFinite(
            price
          )
        ) {
          return;
        }

        let coin = null;

        if (
          symbol ===
          "BTCUSDT"
        ) {
          coin = "BTC";
        }

        if (
          symbol ===
          "ETHUSDT"
        ) {
          coin = "ETH";
        }

        if (
          symbol ===
          "SOLUSDT"
        ) {
          coin = "SOL";
        }

        if (!coin) {
          return;
        }

        /* Update visible market prices */

        setPrices(
          (previous) => ({
            ...previous,
            [coin]: price,
          })
        );

        /*
          Only append chart points for
          whichever coin the user currently
          has selected.
        */

        if (
          coin !==
          selectedCoinRef.current
        ) {
          return;
        }

        const timestamp =
          Math.floor(
            Date.now() / 1000
          );

        setPriceHistory(
          (previous) => {
            const lastPoint =
              previous[
                previous.length -
                  1
              ];

            /*
              Multiple trades can arrive within
              the same second.

              Lightweight Charts requires
              ordered timestamps, so replace
              the current-second point.
            */

            if (
              lastPoint &&
              lastPoint.time ===
                timestamp
            ) {
              return [
                ...previous.slice(
                  0,
                  -1
                ),

                {
                  time:
                    timestamp,
                  value:
                    price,
                },
              ];
            }

            return [
              ...previous,

              {
                time:
                  timestamp,
                value:
                  price,
              },
            ].slice(-500);
          }
        );
      } catch (error) {
        console.error(
          "WebSocket message error:",
          error
        );
      }
    };

    socket.onerror = (
      error
    ) => {
      console.error(
        "WebSocket error:",
        error
      );
    };

    return () => {
      socket.close();
    };
  }, []);

  /* ========================================
     LOAD HISTORICAL CHART DATA
  ======================================== */

  useEffect(() => {
    const controller =
      new AbortController();

    const loadHistory =
      async () => {
        try {
          setHistoryLoading(
            true
          );

          const config =
            CHART_RANGES[
              chartRange
            ];

          const url =
            `${API}/api/market/history` +
            `?symbol=${selectedCoin}` +
            `&interval=${config.interval}` +
            `&limit=${config.limit}`;

          const response =
            await fetch(
              url,
              {
                signal:
                  controller.signal,
              }
            );

          const data =
            await response.json();

          if (
            data.success &&
            Array.isArray(
              data.history
            )
          ) {
            /*
              Remove any accidental duplicated
              timestamps and ensure ordering.
            */

            const unique =
              new Map();

            data.history.forEach(
              (point) => {
                unique.set(
                  Number(
                    point.time
                  ),
                  {
                    time:
                      Number(
                        point.time
                      ),

                    value:
                      Number(
                        point.value
                      ),
                  }
                );
              }
            );

            const cleaned =
              Array.from(
                unique.values()
              ).sort(
                (a, b) =>
                  a.time -
                  b.time
              );

            setPriceHistory(
              cleaned
            );
          } else {
            setPriceHistory(
              []
            );
          }
        } catch (error) {
          if (
            error.name !==
            "AbortError"
          ) {
            console.error(
              "Historical chart error:",
              error
            );
          }
        } finally {
          if (
            !controller.signal
              .aborted
          ) {
            setHistoryLoading(
              false
            );
          }
        }
      };

    loadHistory();

    return () => {
      controller.abort();
    };
  }, [
    selectedCoin,
    chartRange,
  ]);

  /* ========================================
     REFRESH PORTFOLIO
  ======================================== */

  const refreshPortfolio =
    async () => {
      const response =
        await fetch(
          `${API}/api/portfolio`
        );

      const data =
        await response.json();

      if (data.success) {
        setPortfolio(data);
      }
    };

  /* ========================================
     REFRESH TRADES
  ======================================== */

  const refreshTrades =
    async () => {
      const response =
        await fetch(
          `${API}/api/trades`
        );

      const data =
        await response.json();

      if (data.success) {
        setTrades(
          data.trades
        );
      }
    };

  const refreshData =
    async () => {
      await Promise.all([
        refreshPortfolio(),
        refreshTrades(),
      ]);
    };

  /* ========================================
     PORTFOLIO HELPERS
  ======================================== */

  const getHolding = (
    symbol
  ) => {
    if (
      !portfolio?.holdings
    ) {
      return 0;
    }

    const holding =
      portfolio.holdings.find(
        (item) =>
          item.symbol ===
          symbol
      );

    return holding
      ? Number(
          holding.quantity
        )
      : 0;
  };

  const cashBalance =
    portfolio?.user
      ?.usdBalance !==
    undefined
      ? Number(
          portfolio.user
            .usdBalance
        )
      : 0;

  const holdingsValue =
    Object.keys(
      ASSETS
    ).reduce(
      (
        total,
        symbol
      ) => {
        const quantity =
          getHolding(
            symbol
          );

        const price =
          Number(
            prices[
              symbol
            ] || 0
          );

        return (
          total +
          quantity *
            price
        );
      },
      0
    );

  const totalPortfolioValue =
    cashBalance +
    holdingsValue;

  const selectedHolding =
    getHolding(
      selectedCoin
    );

  const selectedPrice =
    prices[
      selectedCoin
    ];

  const selectedAsset =
    ASSETS[
      selectedCoin
    ];

  /* ========================================
     BUY
  ======================================== */

  const handleBuy =
    async () => {
      const amount =
        Number(
          buyAmount
        );

      const currentPrice =
        prices[
          selectedCoin
        ];

      if (
        !Number.isFinite(
          amount
        ) ||
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
        setIsTrading(
          true
        );

        setTradeMessage(
          "Executing market order..."
        );

        const response =
          await fetch(
            `${API}/api/trade/buy`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  {
                    symbol:
                      selectedCoin,

                    usdAmount:
                      amount,

                    price:
                      currentPrice,
                  }
                ),
            }
          );

        const data =
          await response.json();

        if (
          !data.success
        ) {
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

        setBuyAmount(
          ""
        );

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
        setIsTrading(
          false
        );
      }
    };

  /* ========================================
     SELL
  ======================================== */

  const handleSell =
    async () => {
      const quantity =
        Number(
          sellQuantity
        );

      const currentPrice =
        prices[
          selectedCoin
        ];

      if (
        !Number.isFinite(
          quantity
        ) ||
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
        setIsTrading(
          true
        );

        setTradeMessage(
          "Executing market order..."
        );

        const response =
          await fetch(
            `${API}/api/trade/sell`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  {
                    symbol:
                      selectedCoin,

                    quantity,

                    price:
                      currentPrice,
                  }
                ),
            }
          );

        const data =
          await response.json();

        if (
          !data.success
        ) {
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

        setSellQuantity(
          ""
        );

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
        setIsTrading(
          false
        );
      }
    };

  /* ========================================
     QUICK BUY
  ======================================== */

  const setQuickBuy = (
    amount
  ) => {
    setBuyAmount(
      String(
        Math.min(
          amount,
          cashBalance
        )
      )
    );
  };

  /* ========================================
     QUICK SELL
  ======================================== */

  const setQuickSell = (
    percentage
  ) => {
    const quantity =
      selectedHolding *
      percentage;

    setSellQuantity(
      quantity.toFixed(
        8
      )
    );
  };

  /* ========================================
     ESTIMATES
  ======================================== */

  const estimatedBuyQuantity =
    selectedPrice &&
    Number(
      buyAmount
    ) > 0
      ? Number(
          buyAmount
        ) /
        selectedPrice
      : 0;

  const estimatedSellValue =
    selectedPrice &&
    Number(
      sellQuantity
    ) > 0
      ? Number(
          sellQuantity
        ) *
        selectedPrice
      : 0;

  /* ========================================
     RANGE BUTTONS
  ======================================== */

  const renderRangeButtons =
    () => (
      <div className="chart-range-buttons">
        {Object.keys(
          CHART_RANGES
        ).map(
          (range) => (
            <button
              key={
                range
              }
              type="button"
              className={
                chartRange ===
                range
                  ? "active"
                  : ""
              }
              onClick={() =>
                setChartRange(
                  range
                )
              }
            >
              {range}
            </button>
          )
        )}
      </div>
    );

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
              behavior:
                "smooth",
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
          INTRO
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
          MAIN WORKSPACE
      ====================================== */}

      <main className="workspace">
        {/* MARKET */}

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

          {/* LIVE CHART */}

          <div className="market-chart-card">
            <div className="chart-header">
              <div>
                <span className="small-label">
                  LIVE CHART
                </span>

                <strong>
                  {selectedCoin}
                  {" / "}
                  USDT
                </strong>
              </div>

              <div className="chart-actions">
                <span className="chart-live">
                  ● LIVE
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setIsChartOpen(
                      true
                    )
                  }
                >
                  EXPAND ↗
                </button>
              </div>
            </div>

            <div className="chart-current-price">
              {formatPrice(
                selectedPrice
              )}
            </div>

            {renderRangeButtons()}

            {historyLoading ? (
              <div className="chart-loading">
                Loading{" "}
                {chartRange}{" "}
                historical
                data...
              </div>
            ) : priceHistory.length >
              1 ? (
              <LiveChart
                data={
                  priceHistory
                }
                height={210}
              />
            ) : (
              <div className="chart-loading">
                No chart data
                available.
              </div>
            )}

            <div className="chart-footer">
              <span>
                BINANCE MARKET DATA
              </span>

              <span>
                {chartRange} +
                LIVE
              </span>
            </div>
          </div>

          {/* SELECTED ASSET */}

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
              displayed market
              price.
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

          {/* ASSETS */}

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

        {/* =================================
            TRADE
        ================================== */}

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
                  {[
                    25,
                    50,
                    100,
                    250,
                  ].map(
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

                  <span>→</span>
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

                  <span>→</span>
                </button>
              </>
            )}

            {tradeMessage && (
              <div className="trade-message">
                <span>◌</span>

                <p>
                  {
                    tradeMessage
                  }
                </p>
              </div>
            )}
          </article>
        </section>

        {/* =================================
            PORTFOLIO
        ================================== */}

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

            <span className="profile-username">
              @
              {portfolio?.user
                ?.username ||
                "demo"}
            </span>

            <span className="profile-account-type">
              PAPER TRADING ACCOUNT
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
            <span>SIDE</span>
            <span>ASSET</span>
            <span>QUANTITY</span>
            <span>
              EXECUTION PRICE
            </span>
            <span>TOTAL</span>
            <span>TIME</span>
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

      {/* =====================================
          FOOTER
      ====================================== */}

      <footer className="footer">
        <span>
          PAPERTRADE /
          REAL-TIME CRYPTO
          SIMULATOR
        </span>

        <span>
          DATA PROVIDED BY
          BINANCE
        </span>

        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
        >
          CHARTS POWERED BY
          TRADINGVIEW
        </a>

        <span>
          FOR SIMULATION ONLY
        </span>
      </footer>

      {/* =====================================
          LARGE CHART POPUP
      ====================================== */}

      {isChartOpen && (
        <div
          className="chart-modal-backdrop"
          onClick={() =>
            setIsChartOpen(
              false
            )
          }
        >
          <div
            className="chart-modal"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="chart-modal-header">
              <div>
                <span className="small-label">
                  LIVE MARKET
                </span>

                <h2>
                  {
                    selectedCoin
                  }
                  /USDT
                </h2>
              </div>

              <button
                type="button"
                className="chart-close"
                onClick={() =>
                  setIsChartOpen(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="modal-price">
              {formatPrice(
                selectedPrice
              )}
            </div>

            {renderRangeButtons()}

            {historyLoading ? (
              <div className="chart-loading">
                Loading{" "}
                {chartRange}{" "}
                historical
                data...
              </div>
            ) : priceHistory.length >
              1 ? (
              <LiveChart
                data={
                  priceHistory
                }
                height={430}
              />
            ) : (
              <div className="chart-loading">
                No historical
                chart data
                available.
              </div>
            )}

            <div className="modal-chart-footer">
              <span>
                BINANCE MARKET
                HISTORY
              </span>

              <span>
                {
                  priceHistory.length
                }{" "}
                POINTS
              </span>

              <span>
                ● LIVE
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;