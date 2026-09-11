import { useEffect, useRef } from "react";

import {
  createChart,
  LineSeries,
  ColorType,
} from "lightweight-charts";

function LiveChart({ data = [], height = 230 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  // Create the chart
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = createChart(
      containerRef.current,
      {
        autoSize: true,
        height,

        layout: {
          background: {
            type: ColorType.Solid,
            color: "transparent",
          },
          textColor: "#8c8f8d",
        },

        grid: {
          vertLines: {
            color: "rgba(23, 24, 23, 0.05)",
          },
          horzLines: {
            color: "rgba(23, 24, 23, 0.05)",
          },
        },

        rightPriceScale: {
          borderColor: "rgba(23, 24, 23, 0.12)",
        },

        timeScale: {
          borderColor: "rgba(23, 24, 23, 0.12)",
          timeVisible: true,
          secondsVisible: true,
        },

        crosshair: {
          vertLine: {
            color: "rgba(23, 24, 23, 0.25)",
          },
          horzLine: {
            color: "rgba(23, 24, 23, 0.25)",
          },
        },
      }
    );

    const series = chart.addSeries(
      LineSeries,
      {
        color: "#171817",
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      }
    );

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();

      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  // Update price data separately
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) {
      return;
    }

    seriesRef.current.setData(data);
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="live-chart"
    />
  );
}

export default LiveChart;