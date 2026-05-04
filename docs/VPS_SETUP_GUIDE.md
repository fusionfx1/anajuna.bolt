# VPS Setup Guide — MT5 + trading_system on NYC Servers Forex VPS

## Recommended Plan

**Standard VPS** — $26.67/mo (yearly)
- 4 GB RAM, 2 cores, 70 GB NVMe
- Windows Server 2022
- Location: NY4 (Equinix New York) — ~1ms to ICMarkets

---

## Step 1: Order VPS

1. Go to newyorkcityservers.com/forex-vps
2. Select **Standard** plan → **Windows Server 2022** → **NY4**
3. Complete payment — VPS ready in ~30 seconds
4. Check email for: IP address, username (`Administrator`), password

---

## Step 2: Connect to VPS

From your local machine (Windows):
```
Win + R → mstsc → Enter
Computer: <VPS_IP>
Username: Administrator
Password: <from email>
```

From Mac/Linux:
```bash
# Install Microsoft Remote Desktop (Mac) or Remmina (Linux)
# Connect to <VPS_IP> with credentials from email
```

---

## Step 3: Install MT5

1. Open browser on VPS → go to **icmarkets.com**
2. Login → My Account → Download MetaTrader 5
3. Install MT5 (`ICMarketsEU-MT5Setup.exe` or `ICMarketsSC-MT5Setup.exe`)
4. Open MT5 → login with your ICMarkets credentials:
   - Login: `52644104`
   - Password: your MT5 password
   - Server: `ICMarketsSC-Demo` (check the server name in MT5 top bar)
5. Click **"Algo Trading"** button → turns green ✓

---

## Step 4: Install Python

1. Go to python.org → Download Python **3.11** (64-bit)
2. Install — **check "Add Python to PATH"** ✓
3. Verify in Command Prompt:
```cmd
python --version
```

---

## Step 5: Clone / Copy Project

**Option A — Git (recommended):**
```cmd
# Install Git from git-scm.com first
git clone https://github.com/YOUR_REPO/anajuna.bolt.git C:\trading
cd C:\trading\trading_system
```

**Option B — Copy files via RDP:**
- Drag & drop `trading_system/` folder into RDP window

---

## Step 6: Install Python Dependencies

```cmd
cd C:\trading\trading_system
pip install -r requirements.txt
pip install MetaTrader5
```

---

## Step 7: Configure .env

```cmd
copy .env.example .env
notepad .env
```

Fill in:
```env
# Broker — choose MT5 or OANDA (or both)
BROKER=mt5
MT5_LOGIN=52644104
MT5_PASSWORD=your_mt5_password
MT5_SERVER=ICMarketsSC-Demo

# OANDA (optional — keep as fallback)
OANDA_ACCOUNT_ID=your_oanda_id
OANDA_API_TOKEN=your_oanda_token
OANDA_ACCOUNT_TYPE=practice

# Signal mode
SIGNAL_MODE=rules

# OpenAI (if SIGNAL_MODE=agent)
OPENAI_API_KEY=your_key

# Supabase
SUPABASE_URL=https://vrcctcmhzlwqwvmkxosq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## Step 8: Test MT5 Connection

```cmd
python -c "
import MetaTrader5 as mt5
import os
from dotenv import load_dotenv
load_dotenv()

if not mt5.initialize():
    print('MT5 not running — open MT5 terminal first')
    quit()

ok = mt5.login(
    int(os.environ['MT5_LOGIN']),
    password=os.environ['MT5_PASSWORD'],
    server=os.environ['MT5_SERVER']
)
if ok:
    info = mt5.account_info()
    print(f'Connected! Balance: {info.balance} {info.currency}')
else:
    print(f'Login failed: {mt5.last_error()}')

mt5.shutdown()
"
```

Expected output:
```
Connected! Balance: 100000.0 GBP
```

---

## Step 9: Run Trading System

```cmd
cd C:\trading\trading_system
python main.py
```

---

## Step 10: Keep Running (Task Scheduler)

To auto-start on reboot:
1. Win + R → `taskschd.msc`
2. Create Basic Task → "TradingSystem"
3. Trigger: **At startup**
4. Action: Start a program
   - Program: `C:\Python311\python.exe`
   - Arguments: `C:\trading\trading_system\main.py`
   - Start in: `C:\trading\trading_system`
5. Finish → check "Open Properties" → General → **"Run whether user is logged on or not"** ✓

---

## Architecture on VPS

```
VPS (Windows Server 2022 @ NY4)
│
├── MetaTrader5 Terminal (running, Algo Trading = ON)
│   └── ICMarkets account 52644104
│
├── Python trading_system/
│   ├── broker.py → MT5Connector (primary)
│   │              → OandaConnector (fallback)
│   ├── generator.py → live trading loop (60s interval)
│   ├── agents/ → KronosOrchestrator (SIGNAL_MODE=agent)
│   └── .env → credentials
│
└── Task Scheduler → auto-restart on reboot
```

---

## Latency

| Connection | Latency |
|-----------|---------|
| VPS → ICMarkets (both NY4) | ~0.3ms |
| MT5 Python library (local) | <0.1ms |
| OANDA REST API (practice) | ~5-20ms |

MT5 local Python library is **50-100x faster** than OANDA REST for order execution.
