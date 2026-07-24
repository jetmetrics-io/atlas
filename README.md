# Атлас метрик — интерактивная карта показателей

Интерактивный атлас метрик JetMetrics: 28 карт по направлениям, 745 показателей.
Для каждой метрики — роль, формула, единицы; связи показывают, что на что влияет
(прямо/обратно, влияние/ассоциация), с объяснением простым языком.

Боевой хостинг — бакет Яндекса (152-ФЗ): `jetmetrics-static.storage.yandexcloud.net/atlas/index.html`,
встраивается в джетметрикс.рф через iframe. GitHub Pages (`jetmetrics-io.github.io/atlas/`) остаётся
как площадка сборки/превью.

## Стек
Vite + React + @xyflow/react (React Flow). Исходные данные — `src/atlas/atlas_base.json`
(выгрузка ручного RU-атласа из Miro; см. основной воркспейс Map Library 2.0).

## Гейт полной версии (важно)

Сборка **одна**. Что покажет приложение — 3 бесплатные карты или все 28 — решается
**в рантайме по факту оплаты**, а не отдельным «секретным» адресом:

1. Приложение добывает email залогиненного: `?email=` → `window.mauser.email` →
   **postMessage-хендшейк с родительской Тильда-страницей** (внутри iframe с чужого
   origin `mauser` не виден). Протокол: iframe → `{jmAtlasReady:1}`, родитель → `{jmAtlasEmail}`.
2. Сверяет email с `payment/paid.json` ∪ `payment/allowlist.json` на бакете.
3. Оплатил → грузит `data/atlas_full.json` (28 карт). Нет → `data/atlas_free.json` (3 карты).

Данные лежат отдельными файлами (`public/data/`, генерит `scripts/gen-data.mjs`) и грузятся
по `fetch` — в бандл не вшиты, full приходит только оплатившему. Логика гейта:
`src/site/access.ts`; бутстрап — `src/main.tsx`.

**Родительская страница на Тильде обязана отдавать email** (иначе покупатель в iframe
получит `email=''` и увидит бесплатную версию). Сниппет моста и репойнт iframe'ов —
задача сайта, см. `site-state/HANDOFF.md`. Надёжность средняя (клиентская проверка).

## Локально
```bash
npm install
npm run dev      # http://localhost:5180 (npm run gen + vite)
npm run build    # gen данных + tsc + прод-бандл в dist/ (данные в dist/data/)
```

## Деплой

Боевой адрес — бакет Яндекса. **Два пути:**

**A. Локально (быстрее всего):**
```bash
cp .deploy.env.example .deploy.env   # подставить ключи static-deploy (см. ниже)
npm run deploy                        # = python3 scripts/deploy_storage.py: build + заливка в atlas/
python3 scripts/deploy_storage.py --dry-run   # посмотреть, что зальётся, без заливки
```

**B. Через CI (push в `main`):** `.github/workflows/deploy.yml` собирает одну версию,
публикует в Pages и — **если в репо заданы секреты `YC_KEY_ID` / `YC_SECRET`** — заливает
`site/` в бакет `jetmetrics-static/atlas/`. Секретов сейчас НЕТ → шаг заливки в бакет
пропускается (Pages деплоится, бакет не трогается). Чтобы включить автозаливку — добавить
секреты: `gh secret set YC_KEY_ID -R jetmetrics-io/atlas` и `YC_SECRET`.

Ключи — сервисный аккаунт `static-deploy` в Яндекс Облаке (роль `storage.editor`),
консоль → «Создать статический ключ доступа». В репозиторий ключи НЕ коммитим
(`.deploy.env` в `.gitignore`).

⚠️ **Первая боевая выкатка — согласованно с сайтом:** CI-заливка идёт с `--delete` и
снесёт старый префикс `atlas/pro-3c35f475c4/`, а мост email должен уже стоять на Тильде.
Порядок и критерии — `site-state/HANDOFF.md`.
