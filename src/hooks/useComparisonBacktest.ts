import { useState, useCallback } from 'react'
import { fetchAndBacktestCompare } from '../services/dataFetchers/fetchOHLCV'
import { FetchResult } from '../services/dataFetchers/types'
import { runBacktest, StrategyFn } from '../services/backtestEngine'
import type { BacktestInstrument } from '../types/backtest'

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
              // @ts-expect-error Phase-5-debt: NormalizedCandle vs Candle shape mismatch
              fetchResults.eodhd.candles,
              {
                strategyId: null,
                strategyName: 'Comparison',
                strategyType: 'manual',
                initialBalance: 10000,
                instrument: symbol as BacktestInstrument,
                granularity: 'D1',
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                commissionPips: 2,
                slippage: 'none',
                slippagePips: 0,
                positionSizing: 'fixed',
                lotSize: 1,
                riskPct: 2,
                strategyConfig: {},
              },
              strategy
            )
            newResults.eodhd = {
              fetchResult: fetchResults.eodhd,
              // @ts-expect-error Phase-5-debt: BacktestResult.metrics shape differs from local interface
              metrics: backtest.metrics,
            }
          } catch (error) {
            console.warn('[useComparisonBacktest] EODHD backtest failed:', error)
          }
        }

        if (fetchResults.tiingo) {
          try {
            const backtest = runBacktest(
              // @ts-expect-error Phase-5-debt: NormalizedCandle vs Candle shape mismatch
              fetchResults.tiingo.candles,
              {
                strategyId: null,
                strategyName: 'Comparison',
                strategyType: 'manual',
                initialBalance: 10000,
                instrument: symbol as BacktestInstrument,
                granularity: 'D1',
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                commissionPips: 2,
                slippage: 'none',
                slippagePips: 0,
                positionSizing: 'fixed',
                lotSize: 1,
                riskPct: 2,
                strategyConfig: {},
              },
              strategy
            )
            newResults.tiingo = {
              fetchResult: fetchResults.tiingo,
              // @ts-expect-error Phase-5-debt: BacktestResult.metrics shape differs from local interface
              metrics: backtest.metrics,
            }
          } catch (error) {
            console.warn('[useComparisonBacktest] Tiingo backtest failed:', error)
          }
        }

        if (fetchResults.synthetic) {
          try {
            const backtest = runBacktest(
              // @ts-expect-error Phase-5-debt: NormalizedCandle vs Candle shape mismatch
              fetchResults.synthetic.candles,
              {
                strategyId: null,
                strategyName: 'Comparison',
                strategyType: 'manual',
                initialBalance: 10000,
                instrument: symbol as BacktestInstrument,
                granularity: 'D1',
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                commissionPips: 2,
                slippage: 'none',
                slippagePips: 0,
                positionSizing: 'fixed',
                lotSize: 1,
                riskPct: 2,
                strategyConfig: {},
              },
              strategy
            )
            newResults.synthetic = {
              fetchResult: fetchResults.synthetic,
              // @ts-expect-error Phase-5-debt: BacktestResult.metrics shape differs from local interface
              metrics: backtest.metrics,
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
    []
  )

  return {
    ...state,
    runComparison,
  }
}
