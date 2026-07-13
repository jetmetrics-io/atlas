export function Footer() {
  return (
    <footer className="ftr">
      <div className="container ftr__in">
        <div className="ftr__col">
          <span className="logo">
            <span className="logo__mark" style={{ width: 24, height: 24, fontSize: 14 }}>J</span>
            <span className="logo__word" style={{ fontSize: '.95rem' }}>Jet<b>Metrics</b></span>
          </span>
          <span className="ftr__muted">Атлас метрик по отраслям</span>
        </div>
        <span className="ftr__domain">джетметрикс.рф</span>
        <div className="ftr__links">
          <a>Методология</a>
          <a>Тарифы</a>
          <a>Контакты</a>
          <a>Оферта</a>
        </div>
      </div>
      <div className="container" style={{ paddingBottom: 24 }}>
        <span className="ftr__muted" style={{ fontSize: 12 }}>© 2026 JetMetrics · Причинно-следственные карты метрик</span>
      </div>
    </footer>
  )
}
