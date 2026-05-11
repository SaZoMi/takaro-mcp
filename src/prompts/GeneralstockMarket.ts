import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerGeneralStockMarketPrompt(server: McpServer): void {

  server.prompt(
    'build-general-stock-market',
    'Scaffold a Takaro GeneralstockMarket module that lets players buy and sell stocks across configurable sectors with market events and economy integration',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Build a Takaro module called "GeneralstockMarket" that creates an in-game stock market where players can buy and sell shares, track their portfolio, and react to market events.

## What it does
- Players buy and sell shares of configurable stocks using in-game currency
- Stock prices update daily via cronjob based on volatility and active market events
- Random market events affect sector prices over a configurable duration
- Hourly cronjob broadcasts market news and price change alerts
- Transaction fees apply on all trades; VIP players (STOCK_MARKET_BROKER) get a discount
- Players can view market prices, individual stock info, and their own portfolio with P&L

## Config

### sectors (array)
List of economic sectors. Default: Technology, Healthcare, Energy, Finance, Manufacturing.
Each entry: \`{ id: string, name: string }\`

### stocks (array)
List of tradeable stocks. Default: AAPL, MSFT, TSLA, JNJ, XOM, JPM, BA, WMT.
Each entry: \`{ id: string, name: string, sector: string, price: number, volatility: number }\`

### marketEvents (array)
List of possible market events. Default: Global Pandemic, Oil Supply Crisis, Tech Boom, Economic Recovery, Market Crash.
Each entry: \`{ id: string, name: string, description: string, <sector impacts> }\`

### eventFrequency (number, default: 10, min: 0)
Average number of cronjob runs between random market events. 0 disables random events.

### defaultEventDuration (number, default: 5, range: 1–20)
Number of cronjob cycles an event lasts if not specified per-event.

### transactionFee (number, default: 5, range: 0–25)
Percentage fee charged on all buy/sell transactions.

### vipDiscount (number, default: 50, range: 0–100)
Percentage discount on transaction fees for players with \`STOCK_MARKET_BROKER\`.

### priceAlertThreshold (number, default: 10, range: 5–50)
Percentage change that triggers a server-wide market alert broadcast.

## Commands

### /buystock
- Trigger: \`buystock\`
- Arguments: \`stock\` (string, position 0), \`amount\` (number, position 1)
- Permission: \`STOCK_MARKET_TRADE\`
- Logic: validate ticker and amount; calculate total cost + fee (apply vipDiscount if broker); deduct currency; add shares to player portfolio variable; record average purchase price

### /sellstock
- Trigger: \`sellstock\`
- Arguments: \`stock\` (string, position 0), \`amount\` (number, position 1)
- Permission: \`STOCK_MARKET_TRADE\`
- Logic: validate holdings; calculate proceeds minus fee; add currency; update portfolio variable; show realised P&L

### /stockportfolio
- Trigger: \`stockportfolio\`
- Arguments: none
- Permission: \`STOCK_MARKET_USE\`
- Logic: read player portfolio variable; display holdings, average buy price, current price, unrealised P&L per stock

### /markets
- Trigger: \`markets\`
- Arguments: \`Industry\` (string, position 0, default: "all")
- Permission: \`STOCK_MARKET_USE\`
- Logic: read current stock prices; filter by sector if provided; display prices and recent % change

### /stockinfo
- Trigger: \`stockinfo\`
- Arguments: \`ticker\` (string, position 0, default: "all")
- Permission: \`STOCK_MARKET_USE\`
- Logic: display stock name, sector, current price, volatility, and any active event affecting its sector

### /triggerevent
- Trigger: \`triggerevent\`
- Arguments: \`EventName\` (string, position 0, default: "all")
- Permission: \`STOCK_MARKET_TRIGGER_EVENT\`
- Logic: manually activate a named market event; write it to the active events variable

## Cronjobs

### updatestockprices
- Schedule: \`5 4 * * *\`
- Logic: for each stock, apply price change based on volatility + any active sector events; check priceAlertThreshold and broadcast alerts; roll random event based on eventFrequency; decrement active event durations and expire finished events; write updated prices to variable

### marketnews
- Schedule: \`0 * * * *\`
- Logic: read current prices and compare to previous snapshot; broadcast notable changes and any active market events to all online players

## Permissions
- \`STOCK_MARKET_USE\` — view market prices and portfolio; non-countable
- \`STOCK_MARKET_TRADE\` — buy and sell stocks; non-countable
- \`STOCK_MARKET_BROKER\` — VIP status reducing transaction fees; non-countable
- \`STOCK_MARKET_TRIGGER_EVENT\` — manually trigger market events (admin); non-countable

## Implementation notes
- Store all stock price state in a single variable scoped to gameServerId + moduleId (e.g. \`stockmarket_prices\`) as a JSON map of tickerId → current price
- Store active market events in \`stockmarket_active_events\`: array of \`{ eventId, remainingCycles }\`
- Store each player's portfolio in \`stockmarket_portfolio:{playerId}\`: map of tickerId → \`{ shares, avgBuyPrice }\`
- Store previous price snapshot in \`stockmarket_prices_prev\` for % change calculations in marketnews
- Transaction fees: \`fee = transactionFee * (broker ? (1 - vipDiscount/100) : 1) / 100\`
- Use \`playerOnGameServerControllerAddCurrency\` / \`playerOnGameServerControllerDeductCurrency\` for all money movement`,
          },
        },
      ],
    }),
  );
}
