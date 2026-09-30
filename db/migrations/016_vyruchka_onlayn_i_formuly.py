#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 016 — «Выручка онлайн» и формулы по настоящим метрикам.

    python3 016_vyruchka_onlayn_i_formuly.py <путь к atlas.db> [--check]

Зачем. Миграция 015 развела одноимённые метрики, и «Выручка» перестала быть одной:
финансовая, офлайн, B2B, обучения, SaaS, от лидов. Формулы, где стояло слово «Выручка»
или ссылка на корень дерева, стали указывать не на ту метрику: у «Среднего чека офлайн»
числитель вёл на финансовую выручку всей компании. То же с «Кликами», «Показами»,
«Бюджетом» — после переименования у них на своих картах другие имена. Решения — Мария,
30.09.2026: в формуле стоит та метрика, которая реально участвует в расчёте, ссылкой.

Что делает:

  1. Заводит «Выручку онлайн» — в пару к «Выручке офлайн»: у онлайн-заказов своей выручки
     не было, «Средний чек (AOV)», «Средняя цена за единицу товара» с Ассортимента и «Доля
     возвратов от выручки» считаются от неё. Места у метрики пока нет: она живёт
     в справочнике, адрес ссылки — `spravochnik/<slug>`. Правила счёта — как у «Оплаченных
     заказов» (период по дате размещения, отменённые с возвратом денег не считаются),
     возвраты вычитаются, как у всех выручек Атласа.

  2. Формулы (51): каждый операнд, который есть метрикой своей карты, — ссылка на неё.
     Что метрикой не является («Доступные показы», «Торговая площадь»), остаётся текстом.
     Выбор выручки там, где он не очевиден:
       - «Средний чек (AOV)», «Средняя цена за единицу товара» (Ассортимент),
         «Доля возвратов от выручки» — «Выручка онлайн»;
       - «Средняя цена за единицу товара офлайн», «Средний чек офлайн», «% промо-продаж»,
         «Выручка на м²», «Продажи на сотрудника» — «Выручка офлайн»;
       - ARPPU — «Выручка SaaS»: «вся выручка периода, включая разовые платежи»;
       - HR («Выручка на сотрудника», «% ФОТ в выручке»), рентабельности Финансов,
         «Доходы», «Маржинальная рентабельность» — «Финансовая выручка»;
       - «ROI инфлюенсер-кампаний» — «Выручка по промокодам инфлюенсеров»; что продажи
         по utm тоже входят, говорит нюанс карточки.

  3. Ссылки в тексте (14): «Выручка» в финансовых карточках — «Финансовая выручка»;
     «средний чек» при оплате частями и уценке — «Средний чек (AOV)».

Проверки (`--check`): метрика заведена с разрезами, каждая формула и ссылка стоит,
у каждой ссылки [[…→адрес]] в этих полях адрес существует.

Идемпотентна: повторный запуск ничего не дублирует и не портит.
"""
import sys, sqlite3, shutil, pathlib, datetime, re

# ── 1. новая метрика ─────────────────────────────────────────────────────────
NOVAYA = {
    "id": 959,
    "slug": "vyruchka_onlayn",
    "name": "Выручка онлайн",
    "unit": "Деньги",
    "formula": "Σ сумм оплаченных заказов − Возвраты по этим заказам",
    "description": ("Сумма всех продаж через собственный сайт и приложение за период. "
                    "Считается по [[оплаченным заказам→zakazy/oplachennye_zakazy]]."),
    "nuances": (
        "Заказ относится к периоду **по дате размещения**, как в [[«Оплаченных заказах»→zakazy/oplachennye_zakazy]]: "
        "оплата, пришедшая в начале следующего месяца, засчитывается месяцу заказа. Иначе выручку делят "
        "на заказы другого месяца, и средний чек искажается."
        "<br>Возврат уменьшает выручку того периода, **в котором размещён исходный заказ**, а не того, когда "
        "товар вернули. Поэтому цифра свежего месяца завышена, пока по его заказам не истёк срок возврата."
        "<br>Заказ, оплаченный и **отменённый до отгрузки**, в выручку не входит: деньги вернули, продажи не было."
        "<br>Плата покупателя **за доставку входит** в выручку: это деньги, полученные за заказ."
        "<br>Сумма берётся **после скидок и промокодов**: столько заплатил покупатель."
        "<br>Деньги за подарочный сертификат **выручкой не становятся**: это предоплата. Выручка возникает, "
        "когда сертификатом расплатились за заказ."
    ),
    "example": (
        "Размещено и оплачено заказов в марте: 4 900 на сумму 12 850 000 ₽"
        "<br>Из них отменены до отгрузки с возвратом денег: 100 на 250 000 ₽ (не считаем)"
        "<br>Возвраты по мартовским заказам: 600 000 ₽"
        "<br><br>Выручка онлайн = 12 850 000 − 250 000 − 600 000 = **12 000 000 ₽**"
        "<br><br>Если вычитать возвраты по дате оформления, в мартовскую выручку попадут возвраты "
        "февральских заказов, и она разойдётся с 4 800 оплаченными заказами марта."
    ),
    "importance": (
        "К ней сводят план продаж интернет-магазина, и от неё же считают "
        "[[средний чек→zakazy/sredniy_chek_aov]] и долю возвратов. Сравнение с "
        "[[выручкой офлайн→riteyl/vyruchka]] показывает, какой канал даёт рост: в общей выручке "
        "компании каналы сливаются."
    ),
    "en": "Online Sales",
    "synonyms": "Выручка интернет-магазина",
    "essence": "больше-лучше",
    "essence_note": "это все деньги, которые интернет-магазин получил за период",
}
ADRES = "spravochnik/" + NOVAYA["slug"]
# разрез → заметка; порядок — приоритет
RAZREZY = [
    ("Товарная категория", "выявить категории со сравнительно низкой выручкой"),
    ("Канал привлечения", "выявить каналы, которые приносят сравнительно мало выручки"),
    ("Устройство", "сравнить выручку между устройствами"),
    ("Способ получения", "увидеть, как выручка распределена между способами получения"),
    ("Способ оплаты", "увидеть, какими способами оплачивают заказы"),
    ("Новый или повторный", "разделить выручку на новых и повторных покупателей"),
    ("География", "выявить территории со сравнительно низкой выручкой"),
    ("Календарный месяц", "увидеть, как выручка распределена по месяцам года"),
]

# ── 2–3. формулы и ссылки: (mid, поле, было, стало); «было» сверяется ────────
FORMULY = [
    (34, 'formula',  # Уникальная кликабельность
     'Уникальные клики / Охват × 100%',
     '[[Уникальные клики→mediynaya_reklama/unikalnye_kliki]] / [[Охват медийной рекламы→mediynaya_reklama/ohvat]] × 100%'),
    (35, 'formula',  # Кликабельность медийной рекламы
     'Клики / Показы × 100%',
     '[[Клики по медийной рекламе→mediynaya_reklama/kliki]] / [[Показы медийной рекламы→mediynaya_reklama/pokazy]] × 100%'),
    (36, 'formula',  # CPM (стоимость 1000 показов)
     'Расход / Показы × 1000',
     '[[Бюджет медийной рекламы→mediynaya_reklama/byudzhet]] / [[Показы медийной рекламы→mediynaya_reklama/pokazy]] × 1000'),
    (37, 'formula',  # Частота показов
     'Показы / Охват',
     '[[Показы медийной рекламы→mediynaya_reklama/pokazy]] / [[Охват медийной рекламы→mediynaya_reklama/ohvat]]'),
    (39, 'formula',  # Стоимость лида
     'Расход / Лиды',
     '[[Бюджет медийной рекламы→mediynaya_reklama/byudzhet]] / [[Лиды с медийной рекламы→mediynaya_reklama/lidy]]'),
    (40, 'formula',  # Стоимость клика медийной рекламы
     'Расход / Клики',
     '[[Бюджет медийной рекламы→mediynaya_reklama/byudzhet]] / [[Клики по медийной рекламе→mediynaya_reklama/kliki]]'),
    (49, 'formula',  # Стоимость конверсии медийной рекламы
     'Расход / Конверсии',
     '[[Бюджет медийной рекламы→mediynaya_reklama/byudzhet]] / [[Конверсии медийной рекламы→mediynaya_reklama/konversii]]'),
    (52, 'formula',  # Коэффициент конверсии медийной рекламы
     'Конверсии / Клики × 100%',
     '[[Конверсии медийной рекламы→mediynaya_reklama/konversii]] / [[Клики по медийной рекламе→mediynaya_reklama/kliki]] × 100%'),
    (52, 'alt_formula',  # Коэффициент конверсии медийной рекламы
     'Конверсии / Охват × 100%',
     '[[Конверсии медийной рекламы→mediynaya_reklama/konversii]] / [[Охват медийной рекламы→mediynaya_reklama/ohvat]] × 100%'),
    (458, 'formula',  # % показов в верхнем блоке страницы
     'Показы в верхнем блоке / Показы × 100%',
     'Показы в верхнем блоке / [[Показы поисковой рекламы→poiskovaya_reklama/pokazy]] × 100%'),
    (461, 'formula',  # Кликабельность поисковой рекламы
     'Клики / Показы × 100%',
     '[[Клики по поисковой рекламе→poiskovaya_reklama/kliki]] / [[Показы поисковой рекламы→poiskovaya_reklama/pokazy]] × 100%'),
    (463, 'formula',  # Коэффициент конверсии поисковой рекламы
     'Конверсии / Клики × 100%',
     '[[Конверсии поисковой рекламы→poiskovaya_reklama/konversii]] / [[Клики по поисковой рекламе→poiskovaya_reklama/kliki]] × 100%'),
    (464, 'formula',  # Ценность / стоимость
     'Ценность конверсий / Бюджет',
     '[[Ценность конверсий→poiskovaya_reklama/cennost_konversiy]] / [[Бюджет поисковой рекламы→poiskovaya_reklama/byudzhet]]'),
    (467, 'formula',  # Стоимость клика поисковой рекламы
     'Бюджет / Клики',
     '[[Бюджет поисковой рекламы→poiskovaya_reklama/byudzhet]] / [[Клики по поисковой рекламе→poiskovaya_reklama/kliki]]'),
    (468, 'formula',  # Стоимость 1000 показов (CPM)
     'Бюджет / Показы × 1000',
     '[[Бюджет поисковой рекламы→poiskovaya_reklama/byudzhet]] / [[Показы поисковой рекламы→poiskovaya_reklama/pokazy]] × 1000'),
    (478, 'formula',  # % показов на первой позиции
     'Показы на первой позиции / Показы × 100%',
     'Показы на первой позиции / [[Показы поисковой рекламы→poiskovaya_reklama/pokazy]] × 100%'),
    (480, 'formula',  # Стоимость конверсии поисковой рекламы
     'Бюджет / Конверсии',
     '[[Бюджет поисковой рекламы→poiskovaya_reklama/byudzhet]] / [[Конверсии поисковой рекламы→poiskovaya_reklama/konversii]]'),
    (482, 'formula',  # Средняя ценность конверсии
     'Ценность конверсий / Конверсии',
     '[[Ценность конверсий→poiskovaya_reklama/cennost_konversiy]] / [[Конверсии поисковой рекламы→poiskovaya_reklama/konversii]]'),
    (483, 'formula',  # Доля полученных показов
     'Показы / Доступные показы × 100%',
     '[[Показы поисковой рекламы→poiskovaya_reklama/pokazy]] / Доступные показы × 100%'),
    (234, 'formula',  # Кликабельность у инфлюенсеров
     '(Клики / Показы) × 100',
     '([[Клики по ссылкам инфлюенсеров→rabota_s_inflyuenserami/kliki_po_ssylkam_inflyuenserov]] / [[Показы у инфлюенсеров→rabota_s_inflyuenserami/pokazy_u_inflyuenserov]]) × 100'),
    (361, 'formula',  # Индекс вовлеченности
     '(Лайки + Комментарии + Репосты) / Охват × 100%',
     '([[Лайки→kontent_marketing/layki]] + [[Комментарии→kontent_marketing/kommentarii]] + [[Репосты→kontent_marketing/reposty]]) / Охват × 100%'),
    (528, 'formula',  # % лидов категории A
     'Лиды категории A / Квалифицированные лиды × 100%',
     'Лиды категории A / [[Квалифицированные лиды B2B→b2b_prodazhi/kvalificirovannye_lidy]] × 100%'),
    (529, 'formula',  # % лидов категории B
     'Лиды категории B / Квалифицированные лиды × 100%',
     'Лиды категории B / [[Квалифицированные лиды B2B→b2b_prodazhi/kvalificirovannye_lidy]] × 100%'),
    (530, 'formula',  # % лидов категории C
     'Лиды категории C / Квалифицированные лиды × 100%',
     'Лиды категории C / [[Квалифицированные лиды B2B→b2b_prodazhi/kvalificirovannye_lidy]] × 100%'),
    (538, 'formula',  # Конверсия квал. лид → встреча
     'Квалифицированные лиды, дошедшие до встречи / Квалифицированные лиды × 100%',
     'Квалифицированные лиды, дошедшие до встречи / [[Квалифицированные лиды B2B→b2b_prodazhi/kvalificirovannye_lidy]] × 100%'),
    (544, 'formula',  # % квал. лидов B2B
     'Квалифицированные лиды / Лиды × 100%',
     '[[Квалифицированные лиды B2B→b2b_prodazhi/kvalificirovannye_lidy]] / [[Лиды B2B→b2b_prodazhi/lidy]] × 100%'),
    (547, 'formula',  # Выручка на менеджера
     'Выручка / Количество менеджеров',
     '[[Выручка B2B→b2b_prodazhi/vyruchka]] / Количество менеджеров'),
    (550, 'formula',  # Стоимость квал. лида
     'Расходы на привлечение / Квалифицированные лиды',
     'Расходы на привлечение / [[Квалифицированные лиды B2B→b2b_prodazhi/kvalificirovannye_lidy]]'),
    (576, 'formula',  # Маржинальность
     'Чистая прибыль / Валовый оборот × 100%',
     '[[Прибыль с маркетплейса→marketpleysy/chistaya_pribyl]] / [[Валовый оборот→marketpleysy/valovyy_oborot]] × 100%'),
    (740, 'formula',  # Средняя цена курса
     'Выручка / Количество продаж',
     '[[Выручка обучения→onlayn_obuchenie/vyruchka]] / Количество продаж'),
    (742, 'formula',  # Прибыль
     'Выручка – Затраты на обучение – Затраты на маркетинг',
     '[[Выручка обучения→onlayn_obuchenie/vyruchka]] – [[Затраты на обучение→onlayn_obuchenie/zatraty_na_obuchenie]] – [[Затраты на маркетинг→onlayn_obuchenie/zatraty_na_marketing]]'),
    (688, 'formula',  # Продажи на сотрудника
     'Выручка / Количество сотрудников',
     '[[Выручка офлайн→riteyl/vyruchka]] / [[Количество сотрудников→riteyl/kolichestvo_sotrudnikov]]'),
    (710, 'formula',  # Выручка на м²
     'Выручка / Торговая площадь',
     '[[Выручка офлайн→riteyl/vyruchka]] / Торговая площадь'),
    (695, 'formula',  # Средний чек офлайн
     '[[Выручка→vyruchka/vyruchka]] / [[Количество чеков→vyruchka/kolichestvo_chekov]]',
     '[[Выручка офлайн→riteyl/vyruchka]] / [[Количество чеков→vyruchka/kolichestvo_chekov]]'),
    (711, 'formula',  # % промо-продаж
     'Выручка по акционным позициям / [[Выручка→vyruchka/vyruchka]] × 100%',
     'Выручка по акционным позициям / [[Выручка офлайн→riteyl/vyruchka]] × 100%'),
    (662, 'formula',  # Рентабельность валовой прибыли
     '(Валовая прибыль / Выручка) × 100',
     '([[Валовая прибыль→finansy/valovaya_pribyl]] / [[Финансовая выручка→finansy/vyruchka]]) × 100'),
    (663, 'formula',  # Валовая прибыль
     'Выручка − Себестоимость продаж',
     '[[Финансовая выручка→finansy/vyruchka]] − [[Себестоимость продаж→finansy/sebestoimost_prodazh]]'),
    (668, 'formula',  # Рентабельность чистой прибыли
     '(Чистая прибыль / Выручка) × 100',
     '([[Чистая прибыль→finansy/chistaya_pribyl]] / [[Финансовая выручка→finansy/vyruchka]]) × 100'),
    (684, 'formula',  # Рентабельность операционной прибыли
     '(Операционная прибыль / Выручка) × 100',
     '([[Операционная прибыль→finansy/operacionnaya_pribyl]] / [[Финансовая выручка→finansy/vyruchka]]) × 100'),
    (746, 'formula',  # Доходы
     '[[Выручка→chistaya-pribyl/vyruchka]] + [[Прочие доходы→chistaya-pribyl/prochie_dohody]]',
     '[[Финансовая выручка→chistaya-pribyl/vyruchka]] + [[Прочие доходы→chistaya-pribyl/prochie_dohody]]'),
    (198, 'formula',  # Средний чек (AOV)
     '[[Выручка→vyruchka/vyruchka]] / [[Оплаченные заказы→vyruchka/oplachennye_zakazy]]',
     '[[Выручка онлайн→spravochnik/vyruchka_onlayn]] / [[Оплаченные заказы→vyruchka/oplachennye_zakazy]]'),
    (198, 'alt_formula',  # Средний чек (AOV)
     'Средняя цена единицы товара × Среднее количество единиц в заказе',
     '[[Средняя цена за единицу товара→assortiment/srednyaya_cena_tovara]] × [[Среднее количество единиц в заказе→assortiment/srednee_kolichestvo_edinic_v_zakaze]]'),
    (697, 'formula',  # Средняя цена за единицу товара офлайн
     '[[Выручка→vyruchka/vyruchka]] / [[Проданные единицы→riteyl/prodannye_edinicy]]',
     '[[Выручка офлайн→riteyl/vyruchka]] / [[Проданные единицы→riteyl/prodannye_edinicy]]'),
    (159, 'formula',  # Средняя цена за единицу товара
     'Выручка / Количество проданных единиц',
     '[[Выручка онлайн→spravochnik/vyruchka_onlayn]] / [[Количество проданных единиц→assortiment/kolichestvo_prodannyh_edinic]]'),
    (921, 'formula',  # Средний доход на платящего пользователя (ARPPU)
     '[[Выручка→vyruchka/vyruchka]] / [[Платящие пользователи→vyruchka/platyaschie_polzovateli]]',
     '[[Выручка SaaS→saas_produkty/vyruchka]] / [[Платящие пользователи→vyruchka/platyaschie_polzovateli]]'),
    (582, 'formula',  # Выручка на сотрудника
     'Выручка / Средняя численность сотрудников за период',
     '[[Финансовая выручка→finansy/vyruchka]] / Средняя численность сотрудников за период'),
    (605, 'formula',  # % ФОТ в выручке
     'ФОТ / Выручка × 100%',
     '[[Фонд оплаты труда (ФОТ)→hr/fond_oplaty_truda]] / [[Финансовая выручка→finansy/vyruchka]] × 100%'),
    (334, 'formula',  # Доля возвратов от выручки
     '(Фактически возвращённая клиентам сумма / Выручка) × 100',
     '(Фактически возвращённая клиентам сумма / [[Выручка онлайн→spravochnik/vyruchka_onlayn]]) × 100'),
    (930, 'formula',  # Маржинальная рентабельность
     '(Выручка − Переменные затраты) / Выручка × 100',
     '([[Финансовая выручка→vyruchka/vyruchka]] − Переменные затраты) / Финансовая выручка × 100'),
    (238, 'formula',  # CPM у инфлюенсеров
     '(Затраты / Показы) × 1000',
     '([[Бюджет на инфлюенс-маркетинг→rabota_s_inflyuenserami/byudzhet_na_inflyuens_marketing]] / [[Показы у инфлюенсеров→rabota_s_inflyuenserami/pokazy_u_inflyuenserov]]) × 1000'),
    (239, 'formula',  # ROI инфлюенсер-кампаний
     '(Выручка − Затраты на кампанию) / Затраты × 100',
     '([[Выручка по промокодам инфлюенсеров→rabota_s_inflyuenserami/vyruchka_po_promokodam_inflyuenserov]] − [[Бюджет на инфлюенс-маркетинг→rabota_s_inflyuenserami/byudzhet_na_inflyuens_marketing]]) / Бюджет на инфлюенс-маркетинг × 100'),
]

SSYLKI = [
    (661, 'nuances',  # Чистая прибыль
     'Формула «[[Выручка→vyruchka/vyruchka]] − Все расходы»',
     'Формула «[[Финансовая выручка→vyruchka/vyruchka]] − Все расходы»'),
    (665, 'nuances',  # Комиссии площадок и платёжных сервисов
     '[[Выручка→finansy/vyruchka]] при этом',
     '[[Финансовая выручка→finansy/vyruchka]] при этом'),
    (684, 'nuances',  # Рентабельность операционной прибыли
     '[[Выручка→finansy/vyruchka]] в знаменателе',
     '[[Финансовая выручка→finansy/vyruchka]] в знаменателе'),
    (867, 'nuances',  # Комиссия маркетплейсов
     '[[Выручка→vyruchka/vyruchka]] признаётся',
     '[[Финансовая выручка→vyruchka/vyruchka]] признаётся'),
    (877, 'nuances',  # Затраты на промо-акции
     '[[Выручка→vyruchka/vyruchka]] уже посчитана',
     '[[Финансовая выручка→vyruchka/vyruchka]] уже посчитана'),
    (929, 'nuances',  # Средняя фактическая скидка
     'хотя в [[Выручке→vyruchka/vyruchka]] плата',
     'хотя в [[«Финансовой выручке»→vyruchka/vyruchka]] плата'),
    (711, 'nuances',  # % промо-продаж
     'иначе [[выручка→vyruchka/vyruchka]] по акции',
     'иначе [[выручка→riteyl/vyruchka]] по акции'),
    (711, 'importance',  # % промо-продаж
     'чем растёт [[выручка→vyruchka/vyruchka]]',
     'чем растёт [[выручка→riteyl/vyruchka]]'),
    (198, 'nuances',  # Средний чек (AOV)
     'Плата за доставку входит в [[выручку→vyruchka/vyruchka]]',
     'Плата за доставку входит в [[выручку→spravochnik/vyruchka_onlayn]]'),
    (198, 'importance',  # Средний чек (AOV)
     '[[выручка→vyruchka/vyruchka]] стоит',
     '[[выручка→spravochnik/vyruchka_onlayn]] стоит'),
    (921, 'nuances',  # Средний доход на платящего пользователя (ARPPU)
     'вся [[выручка→vyruchka/vyruchka]] периода',
     'вся [[выручка→saas_produkty/vyruchka]] периода'),
    (921, 'example',  # Средний доход на платящего пользователя (ARPPU)
     '[[Выручка→vyruchka/vyruchka]] за месяц',
     '[[Выручка SaaS→saas_produkty/vyruchka]] за месяц'),
    (866, 'importance',  # Комиссия за приём платежей
     'поднимает [[средний чек→vyruchka/sredniy_chek]] и конверсию',
     'поднимает [[средний чек→vyruchka/sredniy_chek_aov]] и конверсию'),
    (901, 'nuances',  # Стоимость списанного товара
     'уменьшает [[средний чек→vyruchka/sredniy_chek]].',
     'уменьшает [[средний чек→vyruchka/sredniy_chek_aov]].'),
]


POLYA_TEKSTA = ["formula", "alt_formula", "description", "nuances", "example",
                "importance", "not_needed", "essence_note"]


def zavesti(con, otchet):
    est = con.execute("select id, name from metric where slug=?", (NOVAYA["slug"],)).fetchone()
    if est:
        if est != (NOVAYA["id"], NOVAYA["name"]):
            sys.exit(f"✖ slug «{NOVAYA['slug']}» занят метрикой {est}")
        otchet.append(f"«{NOVAYA['name']}» уже заведена")
    else:
        if con.execute("select 1 from metric where id=?", (NOVAYA["id"],)).fetchone():
            sys.exit(f"✖ id {NOVAYA['id']} занят — кто-то завёл метрику раньше, взять следующий")
        polya = list(NOVAYA)
        con.execute(f"insert into metric ({', '.join(polya)}) values ({', '.join('?' * len(polya))})",
                    [NOVAYA[p] for p in polya])
        otchet.append(f"заведена «{NOVAYA['name']}» (id {NOVAYA['id']}, адрес {ADRES})")
    for i, (razrez, zametka) in enumerate(RAZREZY, 1):
        did = con.execute("select id from dimension where name=?", (razrez,)).fetchone()
        if not did:
            sys.exit(f"✖ разреза «{razrez}» нет в справочнике")
        con.execute("""insert or ignore into metric_dimension (metric_id, dimension_id, priority, note)
                       values (?, ?, ?, ?)""", (NOVAYA["id"], did[0], i, zametka))


def formuly(con, otchet):
    n = 0
    for mid, pole, bylo, stalo in FORMULY:
        tek = con.execute(f"select {pole} from metric where id=?", (mid,)).fetchone()[0]
        if tek == stalo:
            continue
        if tek != bylo:
            sys.exit(f"✖ {mid}.{pole} = {tek!r}, ожидалось {bylo!r}")
        con.execute(f"update metric set {pole}=? where id=?", (stalo, mid))
        n += 1
    otchet.append(f"формул поправлено: {n} из {len(FORMULY)}")
    n = 0
    for mid, pole, bylo, stalo in SSYLKI:
        tek = con.execute(f"select {pole} from metric where id=?", (mid,)).fetchone()[0] or ""
        if stalo in tek:
            continue
        if bylo not in tek:
            sys.exit(f"✖ {mid}.{pole}: нет {bylo!r}")
        con.execute(f"update metric set {pole}=? where id=?", (tek.replace(bylo, stalo), mid))
        n += 1
    otchet.append(f"ссылок в тексте поправлено: {n} из {len(SSYLKI)}")


def primenit(con):
    otchet = []
    zavesti(con, otchet)
    formuly(con, otchet)
    return otchet


def proverit(con):
    """Список претензий. Пустой список — всё чисто."""
    pretenzii = []
    if not con.execute("select 1 from metric where id=? and slug=?", (NOVAYA["id"], NOVAYA["slug"])).fetchone():
        pretenzii.append(f"⛔ «{NOVAYA['name']}» не заведена")
    n = con.execute("select count(*) from metric_dimension where metric_id=?", (NOVAYA["id"],)).fetchone()[0]
    if n != len(RAZREZY):
        pretenzii.append(f"⛔ у «{NOVAYA['name']}» разрезов {n}, ожидалось {len(RAZREZY)}")
    for mid, pole, _, stalo in FORMULY:
        if con.execute(f"select {pole} from metric where id=?", (mid,)).fetchone()[0] != stalo:
            pretenzii.append(f"⛔ {mid}.{pole} не поправлена")
    for mid, pole, _, stalo in SSYLKI:
        if stalo not in (con.execute(f"select {pole} from metric where id=?", (mid,)).fetchone()[0] or ""):
            pretenzii.append(f"⛔ {mid}.{pole}: нет {stalo!r}")
    # адреса ссылок существуют: узел места или адрес метрики без места
    uzly = {r[0] for r in con.execute("select node_id from metric_artifact")}
    uzly |= {"spravochnik/" + r[0] for r in con.execute(
        "select slug from metric m where not exists (select 1 from metric_artifact p where p.metric_id = m.id)")}
    mids = {m for m, *_ in FORMULY} | {m for m, *_ in SSYLKI} | {NOVAYA["id"]}
    for mid in mids:
        for pole in POLYA_TEKSTA:
            t = con.execute(f"select {pole} from metric where id=?", (mid,)).fetchone()[0] or ""
            for adres in re.findall(r"\[\[[^\]→]+→([^\]]+)\]\]", t):
                if adres not in uzly:
                    pretenzii.append(f"⛔ {mid}.{pole}: ссылка в никуда {adres}")
    return pretenzii


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    put = pathlib.Path(sys.argv[1]).resolve()
    tolko_proverka = "--check" in sys.argv
    if not put.exists():
        sys.exit(f"✖ базы нет: {put}")
    con = sqlite3.connect(put)
    con.execute("pragma foreign_keys=on")

    if not tolko_proverka:
        metka = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        kopiya = put.with_name(f"{put.stem}.before_016_{metka}{put.suffix}")
        shutil.copy2(put, kopiya)
        print(f"бэкап: {kopiya.name}")
        for s in primenit(con):
            print("  " + s)
        con.commit()

    print(f"метрик в Базе: {con.execute('select count(*) from metric').fetchone()[0]}")
    pretenzii = proverit(con)
    if pretenzii:
        print(f"\nпретензий: {len(pretenzii)}")
        for p in pretenzii:
            print(" ", p)
        sys.exit(1)
    print("проверка: чисто")


if __name__ == "__main__":
    main()
