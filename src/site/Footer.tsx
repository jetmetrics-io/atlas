import { t } from '../i18n'

export function Footer() {
  return (
    <footer className="ftr">
      <div className="container ftr__in">
        <div className="ftr__col">
          <span className="logo">
            <span className="logo__mark" style={{ width: 24, height: 24, fontSize: 14 }}>J</span>
            <span className="logo__word" style={{ fontSize: '.95rem' }}>Jet<b>Metrics</b></span>
          </span>
          <span className="ftr__muted">{t('Атлас метрик по отраслям')}</span>
        </div>
        <span className="ftr__domain">{t('джетметрикс.рф')}</span>
        <div className="ftr__links">
          <a>{t('Методология')}</a>
          <a>{t('Тарифы')}</a>
          <a>{t('Контакты')}</a>
          <a>{t('Оферта')}</a>
        </div>
      </div>
      <div className="container" style={{ paddingBottom: 24 }}>
        <span className="ftr__muted" style={{ fontSize: 12 }}>{t('© 2026 JetMetrics · Причинно-следственные карты метрик')}</span>
      </div>
    </footer>
  )
}
