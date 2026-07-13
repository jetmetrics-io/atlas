# Атлас метрик — интерактивная карта показателей

Интерактивный атлас метрик JetMetrics: 28 карт по направлениям, 745 показателей.
Для каждой метрики — роль, формула, единицы; связи показывают, что на что влияет
(прямо/обратно, влияние/ассоциация), с объяснением простым языком.

Живёт на GitHub Pages: **https://jetmetrics-io.github.io/atlas/**

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
Пуш в `main` → GitHub Actions (`.github/workflows/deploy.yml`) собирает и публикует в Pages.
