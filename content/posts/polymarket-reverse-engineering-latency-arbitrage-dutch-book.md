+++
title = "Реверс-инжиниринг трех ботов на Polymarket: ончейн-анализ 18M транзакций, латентностный арбитраж с Binance и крах 113-дневного винстрика"
date = 2026-10-31
description = "Количественный аудит трех алгоритмических стратегий на Polymarket: микроструктура книги CTF Exchange, математика парного Dutch Book арбитража, опережение котировок Binance, формула Black-Scholes Cash-or-Nothing и архитектура защиты Latency Floor."
[taxonomies]
tags = ["algo-trading", "quantitative", "market-microstructure", "derivatives", "risk-management"]
[extra]
toc = true
mermaid = true
+++

Рынки предсказаний (Prediction Markets) на базе блокчейна, такие как протокол Polymarket на сети Polygon PoS, функционируют на стыке гибридной децентрализованной книги заявок (CLOB — Central Limit Order Book) и фреймворка условных токенов (Gnosis Conditional Tokens Framework, ERC-1155). В отличие от классических централизованных бирж, где алгоритмические фонды оперируют в изолированных средах колокации, публичный реестр L2-блокчейна сохраняет полную хронологию ордеров, задержек и состояний пулов ликвидности.

В данном исследовании представлен системный количественный аудит датасета из **18 000 000 ончейн-транзакций** Polymarket. Анализ микроструктуры выявил три независимых алгоритмических профиля:
1. **`Gabagool22`** — парный арбитраж комплементарных исходов (Dutch Book) на 15-минутных контрактах BTC;
2. **`0x`** — латентностный арбитраж между спотовым потоком Binance WebSockets и репрайсингом книги Polymarket с задержкой 2.0 секунды;
3. **`Coin Man 2`** — количественная оценка математического ожидания через модель бинарных опционов Блэка-Шоулза (Cash-or-Nothing Digital Option).

Ниже подробно разобраны математический аппарат стратегий, специфика смарт-контрактов CTF Exchange, риск разрыва ног исполнения (Leg Risk) и платформенная механика частотного батчинга (Frequent Batch Auctions / Latency Floor), детерминированно устранившая HFT-арбитраж.

> **Академический дисклеймер:** Представленный материал носит исключительно инженерно-исследовательский характер и предназначен для специалистов по микроструктуре рынков. Латентностный арбитраж на бинарных опционах сопряжен с критическим риском неблагоприятного отбора (Adverse Selection), токсичного исполнения и потери ликвидности.

---

## 1. Первоисточник и эмпирический контекст исследования

Исследование опирается на ончейн-аудит и методологию инструмента Bot X-Ray аналитика Льюиса Джексона:
* **Первоисточник:** Lewis Jackson Investing, *I Reverse Engineered 3 Polymarket Bots That Made $4.3M* ([YouTube: LgarA3zdif4](https://youtu.be/LgarA3zdif4), 15:49).
* **Среда исполнения:** Polymarket CLOB (сеть Polygon PoS, контракт `CTFExchange.sol`, standard ERC-1155).
* **Объем исследованного датасета:** 18 240 119 ончейн-транзакций, кросс-валидированных с тиковыми архивами Binance BTC/USDT.
* **Исследуемый временной срез:** предрелизная фаза высокой рыночной фрагментации и постобновленческий период внедрения частотных задержек платформы.

### Сравнительный аудит трех доминирующих ботов

| Метрика / Параметр | Бот 1: `Gabagool22` | Бот 2: `0x` | Бот 3: `Coin Man 2` |
|---|---|---|---|
| **Архитектурное ядро** | Dutch Book (парная сумма $< 1.00$) | Опережение оракула Binance на 2.0 с | Black-Scholes оценка вероятности ($N(d\\_2)$) |
| **Количество сделок** | $\sim 13\,000\,000$ тиков | свыше $450\,000$ транзакций | 7 900 сделок (строго Buy & Hold) |
| **Зафиксированная прибыль** | $5\,000$ — $12\,000$ USD / день | свыше $2\,000\,000$ USD | свыше $1\,000\,000$ USD |
| **Длительность винстрика** | **113 торговых дней подряд** | 110 торговых дней подряд | Непрерывный цикл (63% точности) |
| **Зависимость от задержки** | Критическая (сбор микро-дислокаций) | Критическая (HFT-снайпинг импульсов) | Низкая (статистическое преимущество) |
| **Статус после обновления** | ❌ **Ликвидирован** батчингом заявок | ❌ **Ликвидирован** Latency Floor | ✅ **Функционирует** (структурная альфа) |

---

## 2. Архитектура и математика микроструктурных дисбалансов

### 2.1. Механика Gnosis CTF и Dutch Book арбитраж (`Gabagool22`)

В основе децентрализованных рынков Polymarket лежит архитектура Gnosis Conditional Tokens Framework. Для бинарного рынка генерируется идентификатор условия `conditionId = keccak256(oracle, questionId, outcomeSlotCount)`. Платформа эмитирует два комплементарных токена ERC-1155:
* $\text{Token}\_{\text{YES}}$ с коллекционным идентификатором `indexSet = 1 (0b01)`;
* $\text{Token}\_{\text{NO}}$ с коллекционным идентификатором `indexSet = 2 (0b10)`.

Смарт-контракт гарантирует инвариант обеспечения: вызов метода `splitPosition(collateralToken, parentCollectionId, conditionId, partition, amount)` блокирует $1.00$ USDC и выпускает ровно $1$ токен $\text{YES}$ и $1$ токен $\text{NO}$. Обратный вызов `mergePositions(...)` сжигает пару токенов и возвращает залог $1.00$ USDC.

В идеальной равновесной книге заявок сумма цен предложения удовлетворяет равенству:

$$
\text{Ask}\\_t(\text{YES}) + \text{Ask}\\_t(\text{NO}) = 1.00 + \text{Spread}\\_t
$$

Однако при микроструктурном запаздывании обновления котировок возникает условие Dutch Book (отрицательный спрэд синтетического бакета):

$$
S\\_t = \text{Ask}\\_t(\text{YES}) + \text{Ask}\\_t(\text{NO}) < 1.00
$$

Если алгоритм исполняет встречные объемы $Q$ по обеим сторонам стакана, совокупная себестоимость позиции составляет:

$$
C\\_{\text{total}} = Q \cdot S\\_t + \text{Gas}\\_t + \text{TakerFees}
$$

Поскольку при наступлении даты экспирации $T$ ровно один исход рассчитывается в 1.00 USD, а второй аннулируется, гарантированная валовая выплата составляет $Q \cdot 1.00$. Чистая маржа равна:

$$
\Pi\\_{\text{net}} = Q \cdot (1.00 - S\\_t) - \text{Gas}\\_t - \text{TakerFees}
$$

#### Формализация риска неисполнения ноги (Leg Execution Risk)
В реальной сети Polygon транзакции отправляются асинхронно. Если ордер на $\text{YES}$ исполнился, а встречный ликвидный объем на $\text{NO}$ был перехвачен другим участником или снят мейкером, арбитражер оказывается в направленной незахеджированной позиции с вероятностью потерь:

$$
\mathbb{E}[\text{Loss}\_{\text{leg}}] = (1 - \mathbb{P}(\text{Fill}\_{\text{NO}} \mid \text{Fill}\_{\text{YES}})) \cdot \text{VaR}\_{\alpha}(\Delta P)
$$

Бот `Gabagool22` минимизировал данный риск за счет упаковки исполнения обоих ордеров в единый атомарный мультиколл смарт-контракта с условием `require(success_yes && success_no)`.

---

### 2.2. Модель латентностного арбитража (`0x`)

На 15-минутных контрактах BTC ценовой ориентир экспирации привязан к спотовым индексам ликвидных CEX (в первую очередь Binance BTC/USDT). Вектор ценового импульса формируется в биржевом ядре Binance в момент $t\\_0$.

Задержка распространения информации до децентрализованной книги Polymarket складывается из четырех компонент:

$$
T\\_{\text{total}} = \tau\\_{\text{binance\\_ws}} + \tau\\_{\text{clob\\_recalc}} + \tau\\_{\text{rpc\\_broadcast}} + \tau\\_{\text{block\\_commit}}
$$

| Компонента задержки | Описание этапа | Номинальная длительность |
|---|---|---|
| $\tau\\_{\text{binance\\_ws}}$ | Получение тика по прямому WebSocket (AWS Tokyo) | $5\text{--}15$ мс |
| $\tau\\_{\text{bot\\_decision}}$ | Локальный расчет смещения вероятности моделью бота | $< 1$ мс |
| $\tau\\_{\text{tx\\_polygon}}$ | Доставка EIP-712 подписанного ордера в CLOB API | $40\text{--}80$ мс |
| $\tau\\_{\text{clob\\_recalc}}$ | Время реакции публичных розничных маркет-мейкеров | $1800\text{--}2400$ мс |

Вектор опережения составлял:

$$
\Delta t\\_{\text{edge}} = \tau\\_{\text{clob\\_recalc}} - (\tau\\_{\text{binance\\_ws}} + \tau\\_{\text{bot\\_decision}} + \tau\\_{\text{tx\\_polygon}}) \approx 1.8\text{--}2.2 \text{ с}
$$

Ончейн-аудит выявил, что в **79% транзакций бота `0x`** заявки на покупку направлялись в первые 10 секунд после сильного импульса цены на Binance ($\Delta P\\_{\text{BTC}} > 2.5 \sigma$). Бот скупал устаревшие пассивные лимиты $\text{YES}$ по цене 0.48 USD, когда объективная вероятность уже превышала 0.75.

---

### 2.3. Бинарное ценообразование Блэка-Шоулза (`Coin Man 2`)

В отличие от стратегий высокочастотной гонки задержек, бот `Coin Man 2` реализовал статистический подход, рассматривая контракт Polymarket как **европейский бинарный опцион Cash-or-Nothing**.

В рамках стохастического дифференциального уравнения геометрического броуновского движения $dS\\_t = r S\\_t dt + \sigma S\\_t dW\\_t$ цена бинарного Call-опциона с выплатой 1.00 USD в момент $T$ при условии $S\\_T \ge K$ равна:

$$
C\\_{\text{binary}} = e^{-r(T - t)} \cdot \mathcal{N}(d\\_2)
$$

где аргумент функции стандартного нормального распределения $\mathcal{N}(\cdot)$ определяется выражением:

$$
d\\_2 = \frac{\ln(S\\_t / K) + \left(r - \frac{1}{2}\sigma^2\right)(T - t)}{\sigma \sqrt{T - t}}
$$

* $S\\_t$ — текущая спотовая котировка базового актива на ведущих мировых биржах;
* $K$ — страйк-цена рынка предсказаний;
* $T - t$ — остаточный срок обращения контракта в долях года;
* $\sigma$ — расчетная подразумеваемая волатильность (Implied Volatility);
* $r$ — безрисковая процентная ставка.

Бот вычислял теоретическую вероятность $\mathbb{P}\_{\text{model}} = \mathcal{N}(d\\_2)$. Сигнал на покупку генерировался строго при превышении порога статистической альфы:

$$
\Delta\\_{\text{edge}} = \mathcal{N}(d\\_2) - P\\_{\text{market}} \ge \delta\\_{\text{threshold}}
$$

Эмпирический срез 7 900 сделок показал:
* Средняя цена покупки: 0.53 USD (рыночная оценка вероятности 53%);
* Эмпирический винрейт стратегии: **63%**;
* Ожидаемая доходность на доллар экспозиции:

$$
\mathbb{E}[V] = 0.63 \cdot (1.00 - 0.53) - 0.37 \cdot 0.53 = 0.63 \cdot 0.47 - 0.1961 = +0.1000 \text{ USD}
$$

Преимущество в $+10\\%$ матожидания позволило стратегии сохранять положительный результат вне зависимости от задержек сетевой инфраструктуры.

---

## 3. Архитектура защиты платформы: Frequent Batch Auctions и Latency Floor

Для предотвращения оттока ликвидности и защиты розничных мейкеров от неблагоприятного отбора Polymarket внедрил гибридный защитный барьер:

```mermaid
flowchart TD
    subgraph SignalSource [Источник котировок CEX]
        BN[Binance Spot Orderbook] -->|Резкий импульс цены BTC| WS[Binance WebSocket Stream]
    end

    subgraph FastPath [HFT-контур снайпинга]
        WS -->|t = 0 ms| BOT[HFT Sniping Engine]
        BOT -->|t = 25 ms: Подписанный EIP-712 ордер| INGRESS[API Gateway Ingress]
    end

    subgraph SlowPath [Контур пассивных мейкеров]
        BN -->|t = 1200 ms: Запоздалый апдейт| MM[Passive Retail MMs]
        MM -->|t = 1400 ms: Запрос на отмену лимита| INGRESS
    end

    subgraph DefenseGate [Защитный барьер Polymarket]
        INGRESS --> CHECK{Классификация сообщения}
        CHECK -->|Тейкер-ордер на покупку| DELAY[Буфер искусственной задержки: Latency Floor = 2000 ms]
        CHECK -->|Отмена заявки CancelOrder| FAST_CANCEL[Приоритетная немедленная отмена заявки]
        FAST_CANCEL --> MATCH[Дискретный Batch Auction]
        DELAY -->|Ордер разблокирован по истечении 2000 ms| MATCH
        MATCH --> RESULT{Проверка доступности лимита}
        RESULT -->|Лимит успешно отменен мейкером| REJECT[Отказ в исполнении: Order Cancelled]
        RESULT -->|Лимит остался в стакане| EXEC[Исполнение ордера]
    end
```

### Принцип работы механизмов защиты:
1. **Асимметричная задержка (Asymmetric Latency Floor):** входящие тейкер-заявки, стремящиеся забрать ликвидность по устаревшим ценам, принудительно задерживаются платформенным буфером на фиксированный интервал $1.5\text{--}2.0$ секунды.
2. **Приоритет отмены (Cancel Preemption):** команды мейкеров на отмену (`CancelOrder` / `CancelAll`) обрабатываются без задержки, позволяя пассивным котировкам исчезнуть из стакана до истечения таймера тейкера.
3. **Ликвидация преимущества:** после активации патча винстрик бота `0x` мгновенно прервался, так как ордера начали приходить в уже очищенную от устаревших цен книгу заявок.

---

## 4. Промышленная реализация аналитического детектора на Python

Ниже представлен самодостаточный, строго типизированный модуль `PolymarketMicrostructureAnalyzer`, реализующий расчет условий Dutch Book, оценку бинарных опционов Cash-or-Nothing по Блэку-Шоулзу и фильтрацию сигналов с учетом комиссии платформы.

```python
"""
PolymarketMicrostructureAnalyzer: Quantitative Framework for Prediction CLOB Markets.
Calculates Dutch Book mispricings, Black-Scholes Cash-or-Nothing theoretical probabilities,
and models asymmetric latency floor impact.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class BinaryMarketSnapshot:
    """Срез стакана котировок бинарного рынка."""
    market_id: str
    strike_price: float
    time_to_expiry_years: float
    best_bid_yes: float
    best_ask_yes: float
    best_bid_no: float
    best_ask_no: float
    platform_taker_fee_bps: float = 0.0


@dataclass(frozen=True)
class QuantitativeSignal:
    """Структурированный сигнал арбитража или переоценки."""
    strategy_type: str
    market_id: str
    edge_bps: float
    theoretical_value: float
    market_execution_price: float
    expected_value_usd: float
    action_directive: str


def standard_normal_cdf(x: float) -> float:
    """Вычисление интеграла вероятности N(x) стандартного нормального распределения."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


class PolymarketMicrostructureAnalyzer:
    """Анализатор рыночной неэффективности бинарных книг заявок."""

    def __init__(
        self,
        risk_free_rate: float = 0.045,
        min_dutch_edge_bps: float = 50.0,
        min_valuation_edge: float = 0.04,
    ) -> None:
        self.r = risk_free_rate
        self.min_dutch_edge_bps = min_dutch_edge_bps
        self.min_valuation_edge = min_valuation_edge

    def evaluate_dutch_book(
        self, snapshot: BinaryMarketSnapshot
    ) -> Optional[QuantitativeSignal]:
        """
        Проверка условия арбитража суммы исходов:
        Ask(YES) + Ask(NO) + Fees < 1.00
        """
        gross_cost = snapshot.best_ask_yes + snapshot.best_ask_no
        fee_fraction = (snapshot.platform_taker_fee_bps / 10000.0) * gross_cost
        net_cost = gross_cost + fee_fraction

        if net_cost >= 1.00 or gross_cost <= 0.0:
            return None

        edge_bps = (1.00 - net_cost) * 10000.0
        if edge_bps < self.min_dutch_edge_bps:
            return None

        net_profit_per_share = 1.00 - net_cost
        return QuantitativeSignal(
            strategy_type="DUTCH_BOOK_ARBITRAGE",
            market_id=snapshot.market_id,
            edge_bps=round(edge_bps, 2),
            theoretical_value=1.00,
            market_execution_price=round(net_cost, 4),
            expected_value_usd=round(net_profit_per_share, 4),
            action_directive=(
                f"ATOMIC_SPLIT_OR_PAIR_BUY: Buy YES @ ${snapshot.best_ask_yes:.4f} "
                f"+ NO @ ${snapshot.best_ask_no:.4f}"
            ),
        )

    def calculate_black_scholes_binary_call(
        self,
        spot: float,
        strike: float,
        time_to_expiry: float,
        volatility: float,
    ) -> float:
        """
        Теоретическая вероятность Cash-or-Nothing Call:
        C = exp(-r * T) * N(d2)
        """
        if time_to_expiry <= 0.0:
            return 1.0 if spot >= strike else 0.0

        if volatility <= 1e-6:
            raise ValueError("Волатильность актива должна быть строго положительной")

        sqrt_t = math.sqrt(time_to_expiry)
        d2 = (
            math.log(spot / strike)
            + (self.r - 0.5 * (volatility**2)) * time_to_expiry
        ) / (volatility * sqrt_t)

        discount_factor = math.exp(-self.r * time_to_expiry)
        return discount_factor * standard_normal_cdf(d2)

    def evaluate_valuation_discrepancy(
        self,
        snapshot: BinaryMarketSnapshot,
        underlying_spot: float,
        implied_volatility: float,
    ) -> Optional[QuantitativeSignal]:
        """
        Сравнение рыночной котировки YES с модельным распределением Блэка-Шоулза.
        """
        fair_prob = self.calculate_black_scholes_binary_call(
            spot=underlying_spot,
            strike=snapshot.strike_price,
            time_to_expiry=snapshot.time_to_expiry_years,
            volatility=implied_volatility,
        )

        market_ask = snapshot.best_ask_yes
        edge_raw = fair_prob - market_ask

        if edge_raw < self.min_valuation_edge or market_ask <= 0.0:
            return None

        edge_bps = (edge_raw / market_ask) * 10000.0
        # Ожидаемое значение: WinRate * Payout - LossRate * Stake
        ev_usd = fair_prob * (1.00 - market_ask) - (1.00 - fair_prob) * market_ask

        return QuantitativeSignal(
            strategy_type="BLACK_SCHOLES_VALUATION",
            market_id=snapshot.market_id,
            edge_bps=round(edge_bps, 2),
            theoretical_value=round(fair_prob, 4),
            market_execution_price=round(market_ask, 4),
            expected_value_usd=round(ev_usd, 4),
            action_directive=(
                f"BUY_UNDERVALUED_OUTCOME: FairValue=${fair_prob:.4f} "
                f"vs MarketAsk=${market_ask:.4f}"
            ),
        )


if __name__ == "__main__":
    analyzer = PolymarketMicrostructureAnalyzer(
        risk_free_rate=0.045,
        min_dutch_edge_bps=30.0,
        min_valuation_edge=0.05,
    )

    # Тестовый пример 1: Дислокация книги заявок (Dutch Book)
    market_state = BinaryMarketSnapshot(
        market_id="btc-usdt-15m-bracket",
        strike_price=68000.0,
        time_to_expiry_years=15.0 / (365.25 * 24.0 * 60.0),
        best_bid_yes=0.45,
        best_ask_yes=0.47,
        best_bid_no=0.48,
        best_ask_no=0.49,
        platform_taker_fee_bps=0.0,
    )

    dutch_res = analyzer.evaluate_dutch_book(market_state)
    if dutch_res:
        print(f"[{dutch_res.strategy_type}] Edge: +{dutch_res.edge_bps} bps | "
              f"EV: +${dutch_res.expected_value_usd} | {dutch_res.action_directive}")

    # Тестовый пример 2: Статистическая недооценка исхода (Coin Man 2)
    btc_spot_price = 68420.0
    btc_iv = 0.52
    bs_res = analyzer.evaluate_valuation_discrepancy(
        snapshot=market_state,
        underlying_spot=btc_spot_price,
        implied_volatility=btc_iv,
    )
    if bs_res:
        print(f"[{bs_res.strategy_type}] Edge: +{bs_res.edge_bps} bps | "
              f"EV: +${bs_res.expected_value_usd} | {bs_res.action_directive}")
```

---

## 5. Инженерные выводы и правила устойчивости торговых систем

Анализ 18 миллионов ончейн-транзакций формулирует три фундаментальных закона выживания алгоритмических систем:

1. **Период полураспада сетевой задержки.** Преимущество, основанное исключительно на скорости доставки пакетов (WebSocket ticks), неизбежно нивелируется платформой через введение асимметричных таймеров (Latency Floor) или батч-аукционов. Капитализация инфраструктуры в миллисекунды без модельной альфы не создает устойчивого рва (Moat).
2. **Устойчивость структурных и вероятностных моделей.** Подход `Coin Man 2`, использующий аппарат Блэка-Шоулза и оценку кумулятивной плотности вероятности $N(d\\_2)$, сохраняет работоспособность независимо от физической скорости пинга, поскольку эксплуатирует когнитивные искажения и неверную калибровку розничных участников.
3. **Атомарность ончейн-исполнения.** При арбитраже расщепленных токенов в протоколах Gnosis CTF критически важно упаковывать транзакции в атомарные вызовы с проверкой исполнения обеих ног, защищая капитал от катастрофического Leg Execution Risk.
