// Черновики дашбордов из репозитория dashboards-methodology, подключённые для локального просмотра.
// Источник правды — dashboards-methodology/drafts/, здесь только сборка в один объект.
// В прод не идёт: листы ещё не прошли приёмку целиком (Д11.5 на аддитивных вершинах, § 26).
import type { Blueprint, Question } from './blueprints'

import { DRAFT as FIN, DRAFT_QUESTIONS as FINQ } from '../../../dashboards-methodology/drafts/finansy.blueprint'
import { DRAFT as LID, DRAFT_QUESTIONS as LIDQ } from '../../../dashboards-methodology/drafts/lidogeneraciya.blueprint'
import { DRAFT as MKT, DRAFT_QUESTIONS as MKTQ } from '../../../dashboards-methodology/drafts/marketpleysy.blueprint'
import { DRAFT as CRM, DRAFT_QUESTIONS as CRMQ } from '../../../dashboards-methodology/drafts/crm.blueprint'
import { DRAFT as SAAS } from '../../../dashboards-methodology/drafts/saas_produkty.blueprint'

export const DRAFT_BLUEPRINTS: Record<string, Blueprint> = {
  ...(FIN as Record<string, Blueprint>),
  ...(LID as Record<string, Blueprint>),
  ...(MKT as Record<string, Blueprint>),
  ...(CRM as Record<string, Blueprint>),
  ...(SAAS as unknown as Record<string, Blueprint>),
}

// У «SaaS продуктов» своего DRAFT_QUESTIONS нет — пункт собирается из самого листа,
// чтобы карта открывалась. Формулировка работы там временная, это видно по отсутствию job story.
// «Финансы» из заглушки вышли 24.08.2026: job story согласована и лежит в самом черновике.
const fallback = (section: string, id: string): [string, Question[]] => {
  const bp = DRAFT_BLUEPRINTS[id]
  return [section, [{ id, type: bp.type, q: bp.q, s: `Черновик без job story — ${bp.hero}, ${bp.ritual}` }]]
}

export const DRAFT_QUESTIONS_ALL: Record<string, Question[]> = {
  ...(LIDQ as Record<string, Question[]>),
  ...(MKTQ as Record<string, Question[]>),
  ...(CRMQ as Record<string, Question[]>),
  ...(FINQ as Record<string, Question[]>),
  ...Object.fromEntries([
    fallback('SaaS продукты', 'saas_produkty'),
  ]),
}
