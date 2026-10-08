+++
title = "Алгоритмический трейдинг на Polymarket: архитектура снайпера 5-минутных бинарных рынков через CLOB API"
date = 2026-10-08
description = "Архитектурный разбор торгового бота для предсказательных рынков Polymarket: работа с CLOB API, референсные цены Hyperliquid, расчет контрактов и риск-менеджмент."
[taxonomies]
tags = ["algo-trading", "quantitative", "architecture", "ai-agents", "market-microstructure"]
[extra]
toc = true
+++

Рынки предсказаний (**Prediction Markets**, в частности **Polymarket**) переживают экспоненциальный рост объема торгов. В отличие от традиционных спотовых или фьючерсных рынков, здесь торгуются **бинарные контракты** (*Binary Outcome Shares*), цена которых колеблется в диапазоне от `$0.00` до `$1.00` и отражает вероятность наступления события:

$$P(\text{Event}) \in [0, 1]$$

С появлением ультракоротких 5-минутных рынков на криптовалюты (BTC, ETH, SOL, XRP «Будет ли цена выше $X в 14:05?») открылось окно возможностей для алгоритмического арбитража и снайпинга за счет временного лага между спотовыми/деривативными биржами и стаканом предсказаний.

Разберем архитектуру торгового бота **Strike Sniper** (исследованного Moon Dev), особенности работы с **Polymarket CLOB API** и ключевые риски высокочастотного исполнения.

---

## 1. Топология архитектуры: Cross-Exchange Price Discovery

Снайпинг предсказательных рынков строится на сопоставлении двух источников данных:

```mermaid
flowchart TD
    subgraph S1 ["⚡ 1. Быстрый источник (Hyperliquid L2 WebSocket)"]
        direction TB
        H1["Real-time спот/перп котировки (BTC, ETH, SOL)"]
        H2["Мгновенная регистрация импульса цены"]
        H1 --> H2
    end

    S1 ==>|Референсная цена P_ref| S2

    subgraph S2 ["🎯 2. Стратегический движок (Strike Sniper Logic)"]
        direction TB
        G1["Polymarket Gamma API: Strike Price (K)"]
        G2{"Сравнение: P_ref > K + Spread_safe?"}
        G3["Расчет размера позиции (Share Sizing)"]
        G1 --> G2
        G2 -->|Да (Вероятность YES ↑)| G3
    end

    S2 ==>|Taker Order Intent (EIP-712)| S3

    subgraph S3 ["🛡️ 3. Исполнение (Polymarket CLOB API)"]
        direction TB
        C1["Central Limit Order Book (L2 стакан)"]
        C2["Лимитные / Taker заявки на YES / NO"]
        C3["Event Logger + Circuit Breaker (Daily Stop-Loss)"]
        C1 --> C2 --> C3
    end
```

---

## 2. Механика биржи: Central Limit Order Book (CLOB)

Polymarket использует не классический AMM (как Uniswap), а полноценную биржевую книгу лимитных ордеров (**CLOB — Central Limit Order Book**) с поддержкой EIP-712 подписей:

1. **YES / NO токены:** каждый исход представлен ERC-1155 токеном. Покупка YES по цене `$0.65` означает выплату `$1.00` в случае победы (прибыль `$0.35`) или `$0.00` в случае проигрыша (убыток `$0.65`).
2. **Taker vs Maker:** снайпер чаще всего выступает как **Taker** — выкупает ликвидность из стакана Ask, когда референсная цена на Hyperliquid уже ушла выше страйка, но лимитные заявки на Polymarket еще не успели переставиться.
3. **Расчет количества долей (Shares):**
   $$\text{Shares} = \frac{\text{Budget}}{\text{Best Ask Price}}$$

---

## 3. Количественный контур на Python

Пример архитектуры ядра снайпера для опроса цен и отправки ордера:

```python
import time
import requests
from dataclasses import dataclass

@dataclass
class MarketTarget:
    symbol: str
    strike_price: float
    token_id: str
    end_time: int

class PolymarketStrikeSniper:
    def __init__(self, clob_client, hyperliquid_feed):
        self.client = clob_client
        self.feed = hyperliquid_feed
        self.daily_pnl = 0.0
        self.max_daily_loss = -50.0  # Circuit Breaker: -$50 в день
        
    def evaluate_market(self, target: MarketTarget, budget_usd: float = 5.0):
        # 1. Защита капитала (Circuit Breaker)
        if self.daily_pnl <= self.max_daily_loss:
            print("[ALERT] Daily Stop-Loss достигнут. Торги остановлены.")
            return

        # 2. Получение быстрой цены с деривативной биржи
        ref_price = self.feed.get_latest_mid_price(target.symbol)
        
        # 3. Получение лучшего аска в стакане Polymarket CLOB
        orderbook = self.client.get_order_book(target.token_id)
        best_ask = float(orderbook['asks'][0]['price'])
        
        # 4. Логика арбитражного входа: цена уверенно выше страйка, но контракт дешев
        price_buffer = target.strike_price * 0.0015  # 0.15% буфер запаса
        if ref_price > (target.strike_price + price_buffer) and best_ask < 0.85:
            shares = int(budget_usd / best_ask)
            if shares > 0:
                print(f"[EXECUTE] BUY {shares} shares @ ${best_ask:.2f} (Ref: ${ref_price:.2f} > Strike: ${target.strike_price:.2f})")
                # Отправка taker-ордера через подпись EIP-712
                self.client.create_and_post_order(
                    token_id=target.token_id,
                    price=best_ask,
                    size=shares,
                    side="BUY"
                )
```

---

## 4. Подводные камни и риски 5-минутного снайпинга

Высокая частота рынка создает серьезные скрытые издержки:

1. **Turnover Drag (Частотный риск):** 4 актива каждые 5 минут генерируют до 48 торговых циклов в час. Без строгого математического преимущества (*Edge*) серия из 3–4 убытков подряд быстро сжигает депозит.
2. **Задержка разрешения рынка (Settlement Latency):** оракул (UMA / Chainlink) разрешает исход по фиксированному снепшоту цены. Разница в источниках цен (Binance vs Coinbase vs Hyperliquid) может привести к тому, что локальный индикатор показал победу, а оракул зафиксировал проигрыш.
3. **Slippage и глубина стакана:** на 5-минутных контрактах ликвидность ограничена сотнями долларов. Попытка зайти крупным объемом мгновенно сдвигает цену до невыгодных `$0.95+`.

---

## Ключевые выводы

1. **Бинарные рынки — это вероятность, а не направление:** расчет строится вокруг вероятности $P > \text{Ask Price}$ с поправкой на дисконт риска.
2. **Кросс-рыночный арбитраж:** скорость получения спотовых/перп тиков (Hyperliquid L2) является главным конкурентным преимуществом.
3. **Обязательный Circuit Breaker:** алгоритмический лимит дневного убытка (`max_daily_loss`) критически необходим для защиты от непредвиденных сбоев оракулов или задержек сети.

---

## Первоисточники и материалы

* **Автор исследования и демонстрация бота:** [Moon Dev — Fable 5 Made Me a 5 Min Polymarket Trading Bot](https://youtu.be/zrUQ-oE5ND4)
* **Детальный конспект в базе знаний:** [Obsidian Vault: Polymarket Strike Sniper Notes (GitHub)](https://github.com/xsa-dev/obsidian-vault/blob/main/YouTube/Polymarket-Fable5-Strike-Sniper-MoonDev-2026.md)
* **Количественные репозитории:** [github.com/xsa-dev](https://github.com/xsa-dev)
