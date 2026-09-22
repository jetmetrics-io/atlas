// Черновики дашбордов из репозитория dashboards-methodology, подключённые для локального просмотра.
// Источник правды — dashboards-methodology/drafts/, здесь только сборка в один объект.
// В прод не идёт: листы ещё не прошли приёмку целиком (Д11.5 на аддитивных вершинах, § 26).
//
// ⛔ Подключается НЕОБЯЗАТЕЛЬНО. Соседний репозиторий лежит рядом с app/ только на машинах,
// где его склонировали; на сервере сборки его нет. Прямые import-ы отсюда роняли сборку
// у всех остальных — CI падал на них 22.09.2026, уже после того, как починили Базу.
// Через import.meta.glob отсутствие файлов не ошибка: черновиков просто не будет.
import type { Blueprint, Question } from './blueprints'

type DraftModule = {
  DRAFT?: Record<string, Blueprint>
  DRAFT_QUESTIONS?: Record<string, Question[]>
}

const modules = import.meta.glob<DraftModule>(
  '../../../dashboards-methodology/drafts/*.blueprint.ts',
  { eager: true },
)

export const DRAFT_BLUEPRINTS: Record<string, Blueprint> = Object.assign(
  {},
  ...Object.values(modules).map((m) => m.DRAFT ?? {}),
)

export const DRAFT_QUESTIONS_ALL: Record<string, Question[]> = Object.assign(
  {},
  ...Object.values(modules).map((m) => m.DRAFT_QUESTIONS ?? {}),
)

// У «SaaS продуктов» своего DRAFT_QUESTIONS нет — пункт собирается из самого листа,
// чтобы карта открывалась. Формулировка работы там временная, это видно по отсутствию job story.
// «Финансы» из заглушки вышли 24.08.2026: job story согласована и лежит в самом черновике.
const bezJobStory = (section: string, id: string) => {
  const bp = DRAFT_BLUEPRINTS[id]
  if (!bp) return          // черновиков нет вовсе — собирать нечего
  DRAFT_QUESTIONS_ALL[section] = [
    { id, type: bp.type, q: bp.q, s: `Черновик без job story — ${bp.hero}, ${bp.ritual}` },
  ]
}

bezJobStory('SaaS продукты', 'saas_produkty')
