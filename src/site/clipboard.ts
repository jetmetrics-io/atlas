// Запись в буфер обмена, которая переживает встройку в чужую страницу.
//
// Атлас живёт на Тильде кросс-доменным iframe'ом. Современный Clipboard API
// (navigator.clipboard) для такого фрейма закрыт политикой разрешений, пока
// родитель не поставит iframe атрибут allow="clipboard-write": Chrome пишет
// в консоль «Permissions policy violation: The Clipboard API has been blocked»
// и запись падает. Firefox эту политику не проверяет и копирует. Поэтому
// 24.09.2026 обе кнопки копирования на Тильде молчали в Chrome и работали
// в Firefox — на странице дерева «Чистая прибыль» у iframe был пустой allow.
//
// Атрибут родителю поставить надо, но полагаться только на него нельзя:
// страниц с встройкой три десятка, заводят их руками, и на новой про атрибут
// забудут. Поэтому при отказе переходим на document.execCommand('copy') —
// он под эту политику не подпадает и внутри закрытого фрейма работает.
// Проверено на боевой сборке в iframe без allow: текст доехал до системного
// буфера, пока Clipboard API на том же клике падал с NotAllowedError.
//
// Требование у запасного пути одно: жест пользователя. Звать только из
// обработчика клика — и не откладывать вызов ничем, кроме уже начатой попытки
// записи, иначе браузер посчитает жест протухшим.

/**
 * Положить текст в буфер. Возвращает, получилось ли, — врать читателю
 * «скопировано» там, где запись не прошла, нельзя: он вставит старое
 * содержимое буфера и не поймёт, почему там чужая метрика.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Политика разрешений, отсутствие фокуса или отказ пользователя —
      // разбираться в причине незачем, запасной путь один и тот же.
    }
  }
  return legacyCopy(text)
}

/**
 * Старый синхронный способ: временное поле, выделение, execCommand('copy').
 * Устарел, но остаётся единственным, что работает во фрейме без разрешения.
 */
function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  // readonly не мешает выделению, но не даёт всплыть клавиатуре на телефоне.
  ta.setAttribute('readonly', '')
  // Поле обязано быть видимым для браузера: из display:none и visibility:hidden
  // выделение не берётся. Прячем прозрачностью и размером в пиксель, position
  // fixed — чтобы страница не прыгнула к нему прокруткой.
  ta.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none'
  document.body.appendChild(ta)

  // Читатель мог что-то выделить в карточке до нажатия — вернём выделение назад.
  const sel = document.getSelection()
  const prev = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null

  ta.select()
  // На iOS одного select() не хватает, диапазон задаётся явно.
  ta.setSelectionRange(0, text.length)

  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }

  document.body.removeChild(ta)
  if (prev && sel) {
    sel.removeAllRanges()
    sel.addRange(prev)
  }
  return ok
}
