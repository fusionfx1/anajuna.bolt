# Trading System Generator (Python)

ระบบแปลง **natural language prompt** เป็น **automated trading system** ที่ใช้งานได้จริง รองรับทั้งภาษาไทยและภาษาอังกฤษ

---

## โครงสร้างไฟล์

```
trading_system/
├── __init__.py          — Public API exports
├── models.py            — Data classes (StrategyConfig, BacktestResult, Trade, Signal ...)
├── prompt_parser.py     — แปลง prompt → StrategyConfig
├── indicators.py        — คำนวณ RSI, MACD, EMA, Bollinger, Stochastic, CCI, ATR
├── signal_engine.py     — สร้าง BUY/SELL/HOLD signals จาก indicator values
├── backtester.py        — Event-driven backtesting engine + performance metrics
├── broker.py            — OandaConnector, PaperConnector, CircuitBreaker
├── supabase_client.py   — บันทึกผลลัพธ์ลง Supabase dashboard
├── generator.py         — generate_trading_system() + run_live() orchestrator
├── main.py              — CLI entry point
├── examples.py          — ตัวอย่างการใช้งาน 7 แบบ
├── requirements.txt     — Python dependencies
└── tests/
    ├── test_prompt_parser.py
    └── test_backtester.py
```

---

## การติดตั้ง

```bash
pip install -r trading_system/requirements.txt
```

---

## ตัวอย่าง prompt ที่รองรับ

### RSI (ภาษาไทย)
```
สร้างระบบเทรด RSI โดยซื้อเมื่อ RSI ต่ำกว่า 30 และขายเมื่อ RSI สูงกว่า 70
พร้อม stop loss 2% และ take profit 5% บนคู่เงิน EURUSD timeframe H1
```

### MACD (ภาษาอังกฤษ)
```
Create a MACD crossover strategy on GBPUSD H4.
Buy when MACD histogram crosses above zero, sell when it crosses below.
Stop loss 1.5%, take profit 4.5%. Risk 1% per trade.
```

### EMA Cross
```
EMA crossover on EURUSD H1: buy when 9 EMA crosses above 21 EMA,
sell when it crosses below. Stop loss 2%, take profit 5%.
```

### Bollinger Bands
```
Bollinger Bands mean reversion on USDJPY H1.
Buy when price closes below lower band, sell above upper band.
Stop loss 1%, take profit 2%.
```

### Stochastic
```
Stochastic oscillator on AUDUSD M15.
Buy when %K and %D both below 20, sell when both above 80.
Stop loss 1.5%, take profit 3%.
```

---

## การใช้งาน Python API

### 1. สร้างและ backtest ระบบ (offline)

```python
from trading_system import generate_trading_system

system = generate_trading_system(
    prompt="สร้างระบบเทรด RSI โดยซื้อเมื่อ RSI ต่ำกว่า 30 และขายเมื่อ RSI สูงกว่า 70 "
           "พร้อม stop loss 2% และ take profit 5%",
    initial_balance=10_000.0,
)

print(system.backtest_result.summary())
```

### 2. บันทึกผลลัพธ์ลง Supabase Dashboard

```python
system = generate_trading_system(
    prompt="...",
    user_id="your-supabase-user-uuid",   # ผลลัพธ์จะปรากฏใน dashboard
)
```

### 3. เริ่ม Paper Trading

```python
from trading_system import generate_trading_system, run_live
from trading_system.broker import PaperConnector

system = generate_trading_system(prompt="...")
broker = PaperConnector(initial_balance=10_000.0)

run_live(system=system, broker=broker, poll_interval_seconds=60)
```

### 4. เริ่ม Live Trading ด้วย OANDA

```python
# ตั้งค่า environment variables ก่อน:
# OANDA_ACCOUNT_ID=your-account-id
# OANDA_API_TOKEN=your-api-token
# OANDA_ACCOUNT_TYPE=practice

from trading_system import generate_trading_system, run_live

system = generate_trading_system(prompt="...", user_id="...")
run_live(system=system, poll_interval_seconds=60)
```

### 5. ปรับแต่ง Config ด้วยตนเอง

```python
from trading_system.prompt_parser import parse_prompt
from trading_system.backtester import run_backtest
from trading_system.broker import PaperConnector

config = parse_prompt("RSI strategy on EURUSD H1, SL 2%, TP 5%.")

# ปรับแต่งหลัง parse
config.lot_size = 0.05
config.max_concurrent_trades = 2
config.risk_per_trade_pct = 0.015

broker = PaperConnector()
df = broker.get_candles("EURUSD", "H1", count=400)
result = run_backtest(df, config, initial_balance=25_000.0)
print(result.summary())
```

### 6. ดู Signals โดยตรง

```python
from trading_system.prompt_parser import parse_prompt
from trading_system.signal_engine import generate_signals
from trading_system.broker import PaperConnector

config = parse_prompt("RSI below 30 buy, above 70 sell. EURUSD H1.")
broker = PaperConnector()
df = broker.get_candles("EURUSD", "H1", count=300)
signals = generate_signals(df, config)

for sig in signals[:10]:
    print(f"[{sig.timestamp}] {sig.signal_type.value} @ {sig.price:.5f}")
```

---

## CLI

```bash
# ใช้ example prompt สำเร็จรูป
python -m trading_system.main --example rsi
python -m trading_system.main --example macd --live

# ใช้ prompt ของตัวเอง
python -m trading_system.main \
  --prompt "RSI strategy on EURUSD H1, buy below 30, sell above 70, SL 2%, TP 5%" \
  --balance 50000 \
  --candles 1000

# บันทึก Supabase + เริ่ม live
python -m trading_system.main \
  --example ema \
  --user-id abc123 \
  --live \
  --poll-interval 300
```

---

## Environment Variables

| ตัวแปร | คำอธิบาย |
|--------|----------|
| `VITE_SUPABASE_URL` | URL ของ Supabase project (อ่านจาก .env อัตโนมัติ) |
| `VITE_SUPABASE_ANON_KEY` | Anon key (อ่านจาก .env อัตโนมัติ) |
| `OANDA_ACCOUNT_ID` | OANDA account ID (optional) |
| `OANDA_API_TOKEN` | OANDA API token (optional) |
| `OANDA_ACCOUNT_TYPE` | `practice` หรือ `live` (default: `practice`) |

---

## Indicators ที่รองรับ

| Indicator | Keyword ในภาษาไทย | Keyword ในภาษาอังกฤษ |
|-----------|-------------------|----------------------|
| RSI | rsi | rsi, relative strength |
| MACD | macd | macd, moving average convergence |
| EMA Cross | ema cross | ema cross, ema crossover |
| SMA Cross | sma cross | sma cross, golden cross |
| Bollinger Bands | bollinger | bollinger, bb band |
| Stochastic | stochastic | stochastic, stoch |
| CCI | cci | cci, commodity channel |
| ATR | atr | atr, average true range |

---

## Performance Metrics

| Metric | คำอธิบาย |
|--------|----------|
| Win Rate | % ของ trades ที่กำไร |
| Sharpe Ratio | ผลตอบแทนปรับด้วย volatility รวม |
| Sortino Ratio | ผลตอบแทนปรับด้วย downside volatility |
| Calmar Ratio | ผลตอบแทนรวม / Max Drawdown |
| Profit Factor | Gross Profit / Gross Loss |
| Max Drawdown | การลดลงสูงสุดจากจุดสูงสุด |

---

## Circuit Breakers

ระบบจะหยุดส่งคำสั่งเทรดอัตโนมัติเมื่อ:
- **Daily Loss Limit**: ขาดทุนสะสมวันนี้เกิน max_daily_loss_pct (default 3%)
- **Max Drawdown**: drawdown จาก peak equity เกิน max_drawdown_pct (default 8%)
- **Wide Spread**: spread เกิน max_spread_pips (default 3 pips)

ค่าเหล่านี้อ่านจาก `user_settings` ใน Supabase หากมี user_id

---

## การรัน Tests

```bash
pytest trading_system/tests/ -v
```

---

## Agent Layer (Phase 1 + Phase 2)

ทีมเอเจนต์ที่ทำงานแบบ parallel เพื่อสร้าง signal ที่ rich context กว่า rule engine เดิม

### สถาปัตยกรรม

```
run_live()
    └─ AgentSignalProvider
          ├─ USE_LANGGRAPH=0 → KronosOrchestrator (parallel)
          │      ├─ NewsAgent         httpx + LLM bias
          │      ├─ FredAgent         FRED macro series
          │      ├─ SentimentAgent    Social / Finnhub sentiment
          │      └─ TechnicalAgent    ← rule engine wrapped
          │
          └─ USE_LANGGRAPH=1 → LangGraph Supervisor
                 gather → memory(pgvector) → fuse → guard → decide
```

### Behavior contracts

| สถานการณ์ | ผลลัพธ์ |
|----------|---------|
| Agent timeout (>1500ms) | HOLD, status=warning |
| Network error | retry 1 ครั้ง + jitter 100–300ms → HOLD ถ้ายังล้มเหลว |
| Agent ส่ง status=error | ถูก skip ใน fusion |
| ทุก agent error | HOLD + blockers=[all_agents_errored] |
| CircuitBreaker tripped | HOLD + blockers=[CIRCUIT_BREAKER] |
| Budget เกิน AGENT_BUDGET_MS | HOLD + blockers=[budget_exceeded] |

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SIGNAL_MODE` | `rules` | `rules` = rule engine, `agent` = agent team |
| `USE_LANGGRAPH` | `0` | `1` = ใช้ LangGraph supervisor |
| `AGENT_TIMEOUT_MS_PER_CALL` | `1500` | deadline ต่อ agent call (ms) |
| `AGENT_BUDGET_MS` | `4000` | budget รวมของ gather cycle (ms) |
| `USE_PGVECTOR` | `1` | `0` = ปิด vector memory |
| `MEMORY_TOP_K` | `5` | จำนวน similar decisions ที่ retrieve |
| `OPENAI_API_KEY` | — | สำหรับ LLM bias + embeddings |
| `NEWS_API_KEY` | — | NewsAPI.org |
| `FINNHUB_API_KEY` | — | Finnhub news + sentiment |
| `ALPHA_VANTAGE_API_KEY` | — | Alpha Vantage news sentiment |
| `FRED_API_KEY` | — | FRED macro series |
| `SENTIMENT_API_KEY` | — | Generic sentiment (Finnhub endpoint) |
| `TWITTER_BEARER_TOKEN` | — | Twitter v2 recent search |

### ตั้งค่า

```bash
cp trading_system/.env.example .env
# แก้ไขค่าตามต้องการ
```

### เปิดใช้ agent mode

```python
import os
os.environ["SIGNAL_MODE"] = "agent"

from trading_system import generate_trading_system, run_live
system = generate_trading_system(prompt="...", user_id="...")
run_live(system=system, poll_interval_seconds=60)
```

### เปิดใช้ LangGraph supervisor (Phase 2)

```python
os.environ["SIGNAL_MODE"] = "agent"
os.environ["USE_LANGGRAPH"] = "1"
os.environ["USE_PGVECTOR"] = "1"  # ต้อง deploy migration ก่อน
```

### ไฟล์ใหม่ใน agents/

| ไฟล์ | หน้าที่ |
|------|--------|
| `runtime.py` | `evaluate_with_deadline()` — timeout/retry/fallback |
| `tech_agent.py` | TechnicalSignalAgent wrapping rule engine |
| `news_agent.py` | NewsAPI / Finnhub / Alpha Vantage + LLM bias |
| `fred_agent.py` | FRED macro series → macro surprise heuristic |
| `sentiment_agent.py` | Twitter / Finnhub sentiment → bias |
| `fusion.py` | (upgraded) error filtering + decision_id + blockers |
| `schemas.py` | (upgraded) status/latency/agent_id/decision_id fields |
| `supervisor.py` | LangGraph pipeline (Phase 2) |
| `persistence.py` | append-only write to `agent_decisions` table |
| `embedding.py` | OpenAI embeddings + Supabase RPC top-k retrieval |

### Supabase migration

```bash
# Run from Supabase CLI
supabase db push
# หรือ apply manually:
# supabase/migrations/20260430120000_create_agent_decisions.sql
```

สร้างตาราง `agent_decisions` (RLS, jsonb contributions, vector 1536-dim) และ
เพิ่มคอลัมน์ `decision_id` ใน `managed_orders`
