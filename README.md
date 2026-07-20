# Атлас метрик — интерактивная карта показателей

Интерактивный атлас метрик JetMetrics: 28 карт по направлениям, 745 показателей.
Для каждой метрики — роль, формула, единицы; связи показывают, что на что влияет
(прямо/обратно, влияние/ассоциация), с объяснением простым языком.

Боевой хостинг — бакет Яндекса (152-ФЗ): `jetmetrics-static.storage.yandexcloud.net/atlas/index.html`,
встраивается в джетметрикс.рф через iframe. GitHub Pages (`jetmetrics-io.github.io/atlas/`) остаётся
как площадка сборки/превью.

## Стек
Vite + React + @xyflow/react (React Flow). Данные — `src/atlas/atlas_base.json`
(выгрузка ручного RU-атласа из Miro; см. основной воркспейс Map Library 2.0).

## Локально
```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # прод-бандл в dist/
```

## Деплой
Пуш в `main` → GitHub Actions (`.github/workflows/deploy.yml`) собирает обе версии и
(1) публикует в Pages, (2) заливает `site/` в бакет `jetmetrics-static/atlas/`.

Заливка в бакет требует секретов репозитория `YC_KEY_ID` / `YC_SECRET` (ключи сервисного
аккаунта `static-deploy`). Пока их нет — шаг заливки пропускается, Pages деплоится как обычно.
