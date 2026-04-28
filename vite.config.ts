import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          
          // Chart/visualization libraries
          'vendor-charts': ['recharts'],
          
          // UI component library
          'vendor-ui': ['lucide-react'],
          
          // Backtester components & hooks
          'backtester': [
            'src/components/backtest/BacktestDataSource.tsx',
            'src/components/backtest/ComparisonResults.tsx',
            'src/hooks/useComparisonBacktest.ts',
            'src/context/DataProviderContext.tsx',
          ],
          
          // Data fetching & normalization
          'data-layer': [
            'src/dataFetchers/fetchOHLCV.ts',
            'src/dataFetchers/eodhd.ts',
            'src/dataFetchers/tiingo.ts',
            'src/dataFetchers/synthetic.ts',
            'src/normalization/normalize.ts',
            'src/normalization/cache.ts',
          ],
        },
      },
    },
    chunkSizeWarningLimit: 600,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
});