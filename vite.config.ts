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
            'src/services/dataFetchers/fetchOHLCV.ts',
            'src/services/dataFetchers/eodhd.ts',
            'src/services/dataFetchers/tiingo.ts',
            'src/services/dataFetchers/synthetic.ts',
            'src/services/normalize.ts',
            'src/services/cache.ts',
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