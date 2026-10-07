# Personal Blog (Zola)

Быстрый статический блог на генераторе [Zola](https://www.getzola.org/).

## Команды

- **Локальный сервер с live-reload:**
  ```bash
  cd ~/blog
  zola serve
  ```
  Сайт будет доступен по адресу: `http://127.0.0.1:1111`

- **Сборка в директорию `public/`:**
  ```bash
  zola build
  ```

- **Проверка ссылок и разметки:**
  ```bash
  zola check
  ```

## Структура

- `config.toml` — основные параметры сайта, ссылки, язык, RSS.
- `content/` — статьи (`posts/`), страницы (`about.md`) в Markdown.
- `templates/` — Tera-шаблоны (`base.html`, `index.html`, `page.html`, `section.html`, `tags/`).
- `static/` — CSS-стили, изображения, шрифты.
- `.github/workflows/deploy.yml` — автоматический CI/CD деплой на GitHub Pages.

## Публикация нового поста

Создайте файл `content/posts/my-new-post.md`:

```markdown
+++
title = "Заголовок статьи"
date = 2026-10-07
description = "Краткое описание"
[taxonomies]
tags = ["rust", "systems"]
+++

Текст статьи в Markdown...
```

## Настройка GitHub Pages

1. Инициализируйте git-репозиторий и запушьте в GitHub:
   ```bash
   cd ~/blog
   git init
   git add .
   git commit -m "Initial blog setup"
   git remote add origin git@github.com:<username>/<repo>.git
   git push -u origin main
   ```
2. В репозитории GitHub: **Settings -> Pages -> Source**: выберите **GitHub Actions**.
3. В `config.toml` укажите ваш финальный URL в `base_url`:
   ```toml
   base_url = "https://<username>.github.io/<repo>" # или кастомный домен
   ```
