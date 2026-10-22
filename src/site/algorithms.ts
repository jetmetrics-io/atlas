import { LANG } from '../i18n'

// Алгоритмы — третий тип артефакта английской Map Library рядом с картами и деревьями
// (решение Марии 22.10.2026). Это пошаговые разборы падения метрики и выбор ключевой
// метрики, перенесённые с досок Miro. Живут на своей странице Workspace
// (jetmetrics.io/workspace-map-library-algorithms?a=<id>, репо site-en:
// site/workspace-map-library-algorithms/), в каталоге — карточкой в своей категории.
// В русском Атласе алгоритмов нет: список пуст, русская сборка не меняется.
// Добавили алгоритм на сайте — допишите строку сюда; число шагов — из его data/index.json.
export type Algorithm = { id: string; name: string; family: string; steps: number }

export const ALGORITHMS: Algorithm[] = LANG === 'en'
  ? [
      { id: 'cr', name: 'Why did Conversion Rate drop?', family: 'ecom', steps: 13 },
      { id: 'aov', name: 'Why did AOV drop?', family: 'ecom', steps: 10 },
      { id: 'key', name: 'Pick your North Star metric', family: 'ecom', steps: 13 },
      { id: 'ltv', name: 'Why did LTV drop?', family: 'customers', steps: 27 },
      { id: 'arpc', name: 'Why did ARPC drop?', family: 'customers', steps: 12 },
    ]
  : []
