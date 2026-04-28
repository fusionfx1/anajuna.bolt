import { useState, useCallback } from 'react'
import { fetchAndBacktestCompare } from '../services/dataFetchers/fetchOHLCV'
import { FetchResult } from '../services/dataFetchers/types'
import { runBacktest, BacktestResult, StrategyFn, Signal } from '../services/backtestEngine'

export interface ComparisonBacktestState {
  eodhd?: {
    fetchResult: FetchResult
    metrics: BacktestMetrics
  }
  tiingo?: {
    fetchResult: FetchResult
    metrics: BacktestMetrics
  }
  synthetic?: {
    fetchResult: FetchResult
    metrics: BacktestMetrics
  }
}

export interface BacktestMetrics {
  totalReturn: number
  sharpeRatio: number
  maxDrawdown: number
  winRate: number
}

interface UseComparisonBacktestState {
  loading: boolean
  error: string | null
  results: ComparisonBacktestState
}

export function useComparisonBacktest() {
  const [state, setState] = useState<UseComparisonBacktestState>({
    loading: false,
    error: null,
    results: {},
  })

  const calculateMetrics = useCallback(
    (signals: Signal[]): BacktestMetrics => {
      if (signals.length === 0) {
        return {
          totalReturn: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          winRate: 0,
        }
      }

      const profitableTrades = signals.filter((s) => s.pnl > 0).length
      const winRate =
        signals.length > 0 ? profitableTrades / signals.length : 0

      const returns = signals.map((s) => s.pnl)
      const totalReturn = returns.reduce((a, b) => a + b, 0)
      const avgReturn = totalReturn / Math.max(signals.length, 1)
      const stdDev = Math.sqrt(
        returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
          Math.max(signals.length - 1, 1)
      )
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0

      let maxDrawdown = 0
      let peakValue = 0
      let currentValue = 0
      for (const signal of signals) {
        currentValue += signal.pnl
        if (currentValue > peakValue) {
          peakValue = currentValue
        }
        const drawdown = peakValue - currentValue
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown
        }
      }

      return {
        totalReturn,
        sharpeRatio,
        maxDrawdown,
        winRate,
      }
    },
    []
  )

  const runComparison = useCallback(
    async (
      strategy: StrategyFn,
      symbol: string,
      startDate: Date,
      endDate: Date
    ) => {
      setState({ loading: true, error: null, results: {} })

      try {
        const fetchResults = await fetchAndBacktestCompare(
          symbol,
          startDate,
          endDate
        )

        const newResults: ComparisonBacktestState = {}

        if (fetchResults.eodhd) {
          try {
            const backtest = runBacktest(
              fetchResults.eodhd.candles,
              strategy
            )
            newResults.eodhd = {
              fetchResult: fetchResults.eodhd,
              metrics: calculateMetrics(backtest.signals),
            }
          } catch (error) {
            console.warn('[useComparisonBacktest] EODHD backtest failed:', error)
          }
        }

        if (fetchResults.tiingo) {
          try {
            const backtest = runBacktest(
              fetchResults.tiingo.candles,
              strategy
            )
            newResults.tiingo = {
              fetchResult: fetchResults.tiingo,
              metrics: calculateMetrics(backtest.signals),
            }
          } catch (error) {
            console.warn('[useComparisonBacktest] Tiingo backtest failed:', error)
          }
        }

        if (fetchResults.synthetic) {
          try {
            const backtest = runBacktest(
              fetchResults.synthetic.candles,
              strategy
            )
            newResults.synthetic = {
              fetchResult: fetchResults.synthetic,
              metrics: calculateMetrics(backtest.signals),
            }
          } catch (error) {
            console.warn(
              '[useComparisonBacktest] Synthetic backtest failed:',
              error
            )
          }
        }

        setState({ loading: false, error: null, results: newResults })
        return newResults
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        setState({
          loading: false,
          error: errorMessage,
          results: {},
        })
        throw error
      }
    },
    [calculateMetrics]
  )

  return {
    ...state,
    runComparison,
  }
}
