# Hardcoded Mock Account Data Investigation Report

## Executive Summary

The application contains **two hardcoded mock account objects** that are silently returned to users when broker credentials are not configured. This creates a **critical UX problem**: users may believe they're connected to their real broker when they're actually using fake data, potentially leading to false confidence in trading decisions.

---

## Critical Issues Identified

### 1. Hardcoded Mock Accounts in Broker Services

#### **brokerService.mockAccount()** (Lines 216-227)
```typescript
private mockAccount(): BrokerAccount {
  return {
    id: 'paper-account-001',
    status: 'ACTIVE',
    equity: 10842.30,
    cash: 8450.20,
    buyingPower: 33800.80,
    portfolioValue: 10842.30,
    daytradeCount: 1,
    patternDayTrader: false,
  };
}
```

- **Returns when**: `!isConfigured()` (lines 67-70)
- **Account ID**: `paper-account-001`
- **Mock Balance**: ~$10,842 USD
- **Mock Buying Power**: ~$33,800 USD

#### **oandaService.mockAccount()** (Lines 262-274)
```typescript
private mockAccount(): OandaAccount {
  return {
    id: 'practice-001',
    currency: 'USD',
    balance: 100000.0,
    unrealizedPL: 243.15,
    nav: 100243.15,
    marginUsed: 1250.0,
    marginAvailable: 98993.15,
    openTradeCount: 2,
    openPositionCount: 2,
  };
}
```

- **Returns when**: `!isConfigured()` (lines 76-79)
- **Account ID**: `practice-001`
- **Mock Balance**: $100,000 USD
- **Mock Unrealized P&L**: +$243.15

---

## 2. Silent Mock Data Flow Paths

### Path 1: Account Data Display
User → BrokerDemo.fetchAlpaca() 
  → brokerService.getAccount()
  → !isConfigured() → mockAccount() ✗ **Silent fallback**
  → setAlpacaAccount(mockData)
  → Displays in AccountCard

**Location**: `/src/components/BrokerDemo.tsx` lines 430-441

**Problem**: 
- User sees account data but doesn't know it's fake
- Comment on line 436 acknowledges this: `// silently fallback to mock`
- Catch block swallows errors and retries with mock

---

### Path 2: Order Submission with Mock
User → submitOrder()
  → brokerService.submitOrder()
  → !isConfigured() → mockOrderSubmit()
  → Returns MOCK_${timestamp} order ID
  → User believes order was submitted to real broker

**mockOrderSubmit() characteristics**:
- ~95% "filled" status (unrealistically high)
- ~5% "rejected" status
- Simulated 20-80ms latency
- No real order is ever submitted

**Location**: `/src/services/brokerService.ts` lines 229-238, `/src/services/oandaService.ts` lines 276-284

---

### Path 3: Order Status Retrieval
getOrderStatus(brokerOrderId) → !isConfigured() → Returns hardcoded filled order
- Lines 190-197 in brokerService.ts
- No indication this is fake

---

## 3. Incomplete and Inconsistent UI Warnings

### BrokerDemo Component (PARTIAL WARNING)
**Lines 659-670**: Shows warning only when BOTH brokers unconfigured:
```jsx
{!configured.alpaca && !configured.oanda && (
  <div className="bg-amber-500/8 border border-amber-500/20">
    <p className="text-amber-300">Using mock data</p>
    <p className="text-slate-400">
      No broker credentials configured. Orders and account data use simulated values.
    </p>
  </div>
)}
```

**Limitations**:
- Only shows if BOTH alpaca AND oanda unconfigured
- Not shown if one broker configured but user selects the unconfigured one
- Missing from Order Management component entirely

---

### SystemHealth Component (MISLEADING)
**Lines 117-127**: Broker status check
```typescript
if (brokerService.isConfigured()) {
  await brokerService.getAccount();
  setBrokerStatus('ok');
} else {
  setBrokerStatus('warn');
}
```

**Problem**: 
- getAccount() succeeds with mock data
- Sets status as 'ok' with no warning that data is fake
- When status is 'warn', user sees "Not configured" 
- But getAccount() call still returns mock data successfully

---

### OrderManagement Component (NO WARNING)
- No warning shown at all
- Mock orders appear in order history as real orders
- No indication data is simulated

---

### DataFeedConfig Component (INDIRECT)
- Shows paper trading warning (lines 405-407)
- But this is for DATA FEED mode, not broker configuration
- User could have paper trading disabled while broker unconfigured

---

## 4. All Call Sites of getAccount()

| File | Component | Lines | Issue |
|------|-----------|-------|-------|
| brokerService.ts | Service itself | 67-70, 105, 190-197 | Returns mock silently |
| oandaService.ts | Service itself | 76-79, 118 | Returns mock on retry |
| BrokerDemo.tsx | Account display | 430-441 | Catches all errors, calls mock |
| SystemHealth.tsx | Health monitoring | 117-127 | Can't distinguish real vs mock |
| useOrderManager.ts | Hook wrapper | 100-102 | No validation |

---

## 5. User Experience Scenario - THE CRITICAL BUG

### User Mistake Scenario

1. **User installs app**, doesn't configure Alpaca credentials yet
2. **Navigates to BrokerDemo tab**
3. **System displays** (from mock):
   - Account ID: `paper-account-001`
   - Portfolio Value: `$10,842.30`
   - Buying Power: `$33,800.80`

4. **User submits BUY order** for 100 AAPL
5. **Order status shows** "Filled" with order ID `MOCK-1735689233451`
6. **User sees** positive portfolio value

**What user BELIEVES**: 
- "My order was successfully filled"
- "I now own 100 AAPL shares"
- "My account has $33k buying power"

**REALITY**: 
- No order was ever submitted
- No shares are owned
- Account data is completely fabricated
- All data is local simulation

---

## 6. Secondary Issues

### Issue 1: Mock Order Success Rate (95%) Is Unrealistic
- Real fill rates vary by market conditions
- Skews user's perception of strategy profitability
- Creates false confidence in untested strategies

### Issue 2: Account ID Format Doesn't Match Real Brokers
- Real Alpaca format: `20050529000P`
- Real OANDA format: `001-001-1234567-001`
- Mock uses obvious fake format that expert users might catch
- But non-expert users won't know difference

### Issue 3: getOrderStatus() Has Mock Fallback
- Lines 190-197 in brokerService.ts
- Returns `{ status: 'filled', filledQty: 1, ... }`
- No way to know if this is real broker response or mock

### Issue 4: No Audit Trail for Mock Data
- Mock orders not marked in database
- Can't distinguish real vs simulated later
- Historical analysis includes fake fills

### Issue 5: Catch Block Error Handling Obscures Issues
- BrokerDemo.tsx lines 435-437 shows pattern:
```typescript
try {
  const acct = await brokerService.getAccount();
  setAlpacaAccount(acct);
} catch {
  // silently fallback to mock
  setAlpacaAccount(await brokerService.getAccount());
}
```
- First call gets mock (if unconfigured)
- Error handler ALSO gets mock
- Catches real errors and hides them

---

## 7. Root Cause Analysis

**Why Did This Happen?**

The pattern reveals an assumption that silent fallbacks are acceptable:

```typescript
// Pattern repeated throughout:
if (!this.config || !this.isConfigured()) {
  return this.mockAccount();  // ← No logging, no warnings
}
```

**Inferred Rationale**:
- Enable "demo mode" experience without requiring credentials
- Allow testing without real broker setup  
- Avoid breaking UI with errors

**Actual Impact**:
- User confusion about real vs fake data
- Potential for costly mistakes
- No transparency about data source
- Silent failures are harder to debug

---

## 8. Data Format Comparison

### Alpaca
**Mock**:
```json
{ "id": "paper-account-001", "equity": 10842.30, "cash": 8450.20 }
```

**Real**:
```json
{ "id": "20050529000P", "equity": "125843.45", "cash": "45230.50" }
```

### OANDA
**Mock**:
```json
{ "id": "practice-001", "balance": 100000.0, "unrealizedPL": 243.15 }
```

**Real**:
```json
{ "id": "001-001-1234567-001", "balance": "100000.00", "unrealizedPL": "243.15" }
```

---

## 9. isConfigured() Check Coverage

**Checked in**:
- `brokerService.isConfigured()` - Line 50-52
- `oandaService.isConfigured()` - Line 55-61
- `BrokerDemo.tsx` - Line 408-410, 119, 455-457
- `SystemHealth.tsx` - Line 119
- `DataFeedConfig.tsx` - Lines 245, 251

**NOT checked in**:
- `OrderManagement.tsx` - No validation before submitOrder
- Any direct calls to `brokerService.submitOrder()`
- Any direct calls to `oandaService.submitOrder()`

---

## 10. Severity Assessment

### CRITICAL Risk Factors

1. **Silent fallback** - No warning to user
2. **Realistic account values** - Could fool user into believing connection works
3. **Orders appear to execute** - 95% "filled" rate creates false success
4. **Multiple entry points** - User could submit real orders thinking they're paper trading
5. **No audit trail** - Can't distinguish real from fake data later

### User Risk

- **Misconception**: User believes they're trading on real broker
- **False confidence**: Strategy tests on mock data (95% fill rate) seem successful
- **Real money risk**: User might move to "Live Trading" mode with untested strategy
- **Data trust**: Mixed real/fake data makes historical analysis unreliable

---

## Hardcoded Mock Values (For Audit)

These IDs/values should NEVER appear in production:
- Account IDs: `paper-account-001`, `practice-001`
- Order IDs matching pattern: `MOCK-*`, `OANDA-MOCK-*`
- Specific hardcoded amounts:
  - $10,842.30 equity (Alpaca mock)
  - $33,800.80 buying power (Alpaca mock)
  - $100,000.00 balance (OANDA mock)
  - +$243.15 unrealized P&L (OANDA mock)

---

## Recommendations

### Immediate (Blocking)

1. **Add explicit warnings** to all account display components
2. **Block order submission** if `!isConfigured()`
3. **Separate demo from production** - don't silently switch

### Short-term

1. **Visual indicators** - "DEMO MODE" badge, red styling
2. **Audit logging** - Track all mock data uses
3. **Validation** - Check account IDs against known patterns

### Long-term

1. **Redesign demo mode** - Explicit, separate from production
2. **Better error handling** - Show errors instead of silently using mock
3. **Test coverage** - Unit tests for configured vs unconfigured paths

---

## Files to Review

**Core Issue**:
- `/src/services/brokerService.ts` - Lines 216-227, 67-70, 105
- `/src/services/oandaService.ts` - Lines 262-274, 76-79, 118

**Affected Components**:
- `/src/components/BrokerDemo.tsx` - Lines 430-441
- `/src/components/SystemHealth.tsx` - Lines 117-127
- `/src/components/OrderManagement.tsx` - No validation
- `/src/components/DataFeedConfig.tsx` - Lines 405-407

**Hooks**:
- `/src/hooks/useOrderManager.ts` - Lines 100-102
