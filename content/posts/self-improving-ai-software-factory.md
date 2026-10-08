+++
title = "Self-Improving AI Software Factory: архитектура распределенной фабрики кода на базе LLM-агентов"
date = 2026-10-08
description = "Архитектурный разбор распределенной фабрики программного кода: Control Plane на SQLite, иерархия Foreman → Sub-agents → Audit и детерминированные Evals."
[taxonomies]
tags = ["ai-agents", "software-engineering", "architecture", "devops", "evals"]
[extra]
toc = true
+++

Локальные инструменты агентного кодинга (Codex, Claude Code, Aider, OpenDevin) совершили революцию в индивидуальной разработке. Однако при попытке масштабировать этот подход на уровень команды или автоматизированного пайплайна инженеры неизбежно упираются в системный тупик:

1. **Локальный хаос промптов и конфигураций:** у каждого разработчика свои настройки контекста, разные версии моделей и несогласованные правила форматирования.
2. **Отсутствие воспроизводимости:** невозможно точно оценить, улучшило ли очередное изменение в системном промпте качество кодогенерации или сломало граничные кейсы.
3. **Неэффективная трата токенов:** использование мощных LLM для механических задач (проверка синтаксиса, парсинг логов, поиск файлов) вместо детерминированных скриптов.

Решением становится переход от локальных CLI-утилит к **AI Software Factory** — централизованной распределенной системе оркестрации агентных воркеров с замкнутым контуром самообучения (*Self-Improving Feedback Loop*).

Разберем архитектуру такой фабрики (на примере системы *Machinist*, исследованной Оуэйном Льюисом).

---

## 1. Архитектура фабрики: Control Plane и Worker Pool

В основе промышленной фабрики кода лежит строгое разделение между уровнем управления (**Control Plane**) и изолированными вычислительными узлами (**Worker Pool**):

```mermaid
flowchart TD
    subgraph Triggers ["⚡ Входной поток задач (Triggers)"]
        T1["Webhooks / CI / Jira / CLI"]
    end

    Triggers -->|Новый тикет / запрос| CP

    subgraph CP ["🎛️ CONTROL PLANE (Machinist)"]
        direction TB
        DB[("Task Queue & Global State<br/>(SQLite / WAL)")]
        Catalog["Prompts & Skills Catalog"]
        Dashboard["Web Dashboard & Traces"]
        SSHGate["SSH Tunnel Gateway"]
    end

    CP ==>|🔒 Dispatches jobs over SSH tunnel| WP

    subgraph WP ["☁️ WORKER POOL (Hetzner / Cloud VMs)"]
        direction TB
        Foreman["👑 1. Foreman Agent<br/>(Планирование и декомпозиция)"]
        SubAgents["🤖 2. Sub-Agents Swarm<br/>(Claude Coder / Codex / PyTest)"]
        Audit["🛡️ 3. Audit Agent + Deterministic Evals<br/>(mypy, pytest, 3-Agent Review)"]

        Foreman -->|Делегирование подзадач| SubAgents
        SubAgents -->|Код, патчи и артефакты| Audit
    end
```

### Преимущества такой топологии:
- **Изоляция окружения:** агенты выполняют сборку, запуск тестов и системные команды на недорогих облачных серверах (например, Hetzner Cloud VM с 16–32 GB RAM), не засоряя локальную машину разработчика.
- **Очередь задач с лимитом параллелизма:** Control Plane контролирует лимиты API (`max_concurrent_jobs`) и защищает от исчерпания рейтов LLM-провайдеров.

---

## 2. Иерархия агентных ролей: Foreman → Sub-agents → Audit

Монолитный агент, пытающийся одновременно планировать архитектуру, писать код, ставить зависимости и проверять тесты, быстро теряет фокус из-за раздувания контекстного окна (*Context Rotting*). 

В фабрике реализовано четкое разделение ответственности:

| Роль | Зона ответственности | Инструменты |
| :--- | :--- | :--- |
| **Foreman (Прораб)** | Принимает высокоуровневый тикет, исследует кодовую базу, формирует план и распределяет подзадачи. | `search_files`, `read_file`, `delegate_task` |
| **Sub-Agent (Кодер)** | Выполняет строго одну изолированную задачу в конкретном модуле (написание функции, рефакторинг, фикс бага). | `patch`, `write_file`, `terminal` |
| **Audit Agent (Аудитор)** | Проверяет соответствие критериям приемки, соответствие стилю и отсутствие побочных регрессий. | `pytest`, `cargo test`, `git diff` |

---

## 3. Детерминированные Evals вместо лишних LLM-вызовов

Одна из главных ошибок при проектировании AI-фабрик — попытка решать все задачи через промпты нейросетей. 

> **Золотое правило:** если задачу можно надежно и дешево решить регулярным выражением, статическим анализатором или bash-скриптом — **не отправляйте ее в LLM**.

```python
# Пример детерминированного гейта качества без участия нейросети
import subprocess
import sys

def verify_code_artifact(repo_path: str) -> bool:
    # 1. Синтаксический анализ и типы
    typecheck = subprocess.run(["mypy", repo_path], capture_output=True)
    if typecheck.returncode != 0:
        print(f"[FAIL] Typecheck errors:\n{typecheck.stdout.decode()}")
        return False
        
    # 2. Модульные тесты
    tests = subprocess.run(["pytest", "-q", f"{repo_path}/tests"], capture_output=True)
    if tests.returncode != 0:
        print(f"[FAIL] Unit tests broken:\n{tests.stdout.decode()}")
        return False

    return True

if __name__ == "__main__":
    if not verify_code_artifact("."):
        sys.exit(1)
```

Детерминированные скрипты дают **100% стабильный результат**, выполняются за миллисекунды и экономят тысячи долларов на API-токенах.

---

## 4. Self-Improving Feedback Loop: обучение на трейсах

Почему фабрика называется *самообучающейся*? 

Агентная фабрика не просто исполняет задачи, она непрерывно накапливает базу знаний об ошибках:

```mermaid
flowchart TD
    Fail["❌ Неудачный запуск / Broken Build"] --> Trace["📋 Трейс выполнения: логи + контекст"]

    subgraph RootCause ["🔍 Автоматический анализ узкого места"]
        direction TB
        P1["Неточная инструкция в системном промпте?"]
        P2["Недостаточный контекст из документации?"]
        P3["Сбойный вспомогательный скрипт?"]
    end

    Trace --> RootCause

    subgraph KnowledgeUpdate ["🚀 Обновление фабрики (Feedback Loop)"]
        direction TB
        K1["1. Обновление каталога Skills & Prompts"]
        K2["2. Создание нового синтетического Eval-теста"]
        K1 <--> K2
    end

    RootCause ==> KnowledgeUpdate
    KnowledgeUpdate -.->|Внедрение в воркеры| Fail
```

Когда один агент находит решение сложной проблемы или совершает ошибку, исправление вносится в **централизованный репозиторий промптов и скиллов**. В следующий раз все воркеры фабрики автоматически получают обновленную базу знаний.

---

## Ключевые выводы

1. **Централизация побеждает локальный хаос:** единый Control Plane с версионированием промптов и очереди задач обеспечивает воспроизводимость.
2. **Разделение труда (Foreman / Sub-agents / Audit):** узкоспециализированные агенты с компактным контекстом работают надежнее и дешевле монолитов.
3. **Детерминизм во главе угла:** используйте классические линтеры, компиляторы и тесты вместо LLM-судей везде, где это возможно.
4. **Контур обратной связи (Evals Loop):** каждый упавший трейс превращается в синтетический тест для предотвращения будущих регрессий.

---

## Первоисточники и материалы

* **Оригинальное видео и автор:** [Owain Lewis — I Built A Self-Improving AI Software Factory](https://youtu.com/ZDOTYfJBuLw)
* **Детальный структурированный конспект:** [Obsidian Vault: Owain Lewis Software Factory (GitHub)](https://github.com/xsa-dev/obsidian-vault/blob/main/YouTube/Owain-Lewis-Self-Improving-AI-Software-Factory-2026.md)
* **Инженерные наработки:** [github.com/xsa-dev](https://github.com/xsa-dev)
