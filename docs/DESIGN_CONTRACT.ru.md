# Do indeksa: контракт источников дизайна

Статус: утверждено владельцем продукта, 11 августа 2026 года.

Этот документ отделяет продуктовую правду, UX-структуру, целевой дизайн и
текущее состояние кода. Для каждого существующего экрана Figma является
обязательной pixel-perfect спецификацией. Текущая реализация от нее заметно
отклоняется и не является допустимым визуальным референсом для следующих UI PR.

## 1. Иерархия источников

| Решение                                                               | Авторитетный источник                                    | Как использовать остальные источники                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Факты FTN, экзамены, баллы, время и таксономия                        | Официальные источники, затем `PROJECT_INDEX.ru.md` и ADR | Любые противоречащие числа и категории из PDF/Figma заменить                       |
| Ценность продукта и пользовательский цикл                             | `PRODUCT.md`, `DEVELOPMENT_PLAN.ru.md` и принятые ADR    | PDF использовать как UX-задание после доменной коррекции                           |
| Композиция, размеры, отступы, типографика, assets и responsive states | Конкретный Figma node для экрана и языка                 | Воспроизводить буквально; самовольные блоки, перестановки и другой shell запрещены |
| Реализованное поведение и контракты данных                            | Код, схемы и автоматические тесты                        | Сохранять при визуальной переработке, если продуктовый контракт не меняется        |
| Текущие screenshots                                                   | Characterization и regression evidence                   | Не считать утверждением целевого дизайна                                           |

Локальная PDF-спецификация фиксирует исходную UX-логику и прямо говорит, что ее
wireframes не нужно копировать пиксель в пиксель. Figma фиксирует более поздний
целевой UI: его нужно копировать pixel-perfect. Исключение относится только к
текстам и mock data, которые противоречат подтвержденным фактам о продукте.

## 2. Неподвижные продуктовые границы

- MVP полностью работает только для FTN P1 по математике.
- В актуальной структуре нет P2 и отдельного вступительного экзамена по физике.
- P3-P8 могут находиться в справочнике, но не являются предметами или уровнями
  тренажера P1.
- P1 содержит 10 задач, длится 4 часа и оценивается максимум в 60 баллов с
  возможным частичным баллом за ход решения.
- Канонический учебный контент написан на сербской латинице; UI поддерживает
  `sr-Latn`, `en` и `ru`.
- Первое задание, диагностика и пробник доступны гостю.
- План показывает следующий проверяемый шаг, а не курс и не выдуманное число
  часов до успеха.
- Machine-check конечного ответа не выдается за официальную проверку полного
  решения.

Следовательно, из Figma всегда удаляются Physics/P2, фиктивные объемы
`2 345`/`1 876`, результат выше 60 баллов, цель `8+ баллов` без единицы
измерения и неподтвержденные оценки требуемых часов.

## 3. Pixel-perfect контракт Figma

Файл: [Do indeksa - UX/UI demo](https://www.figma.com/design/d7BeJCrce0Z1kedvphZQJo/Do-indeksa-%E2%80%94-UX-UI-%D0%B4%D0%B5%D0%BC%D0%BE).

Базовые tokens уже перенесены в `apps/web/src/app/globals.css`:

- Onest как основной sans-serif;
- text primary `#0a0b1e`, secondary `#5f6475`;
- page `#fcfcfe`, surface `#ffffff`, subtle `#f5f0ff`;
- action primary `#6535f2`, text brand `#4b22d5`;
- border `#e7e8ed`.

Канонические component nodes:

| Компонент                                            | Node                              |
| ---------------------------------------------------- | --------------------------------- |
| Language Switcher                                    | `143:38`                          |
| App Header component set                             | `144:170`                         |
| App Header SR: desktop / tablet / mobile             | `144:48` / `144:113` / `144:158`  |
| Marketing Header component set                       | `172:750`                         |
| Marketing Header SR guest: desktop / tablet / mobile | `172:630` / `172:682` / `172:732` |

Для каждого UI PR обязательны конкретный frame и его screenshot/export. Реализация
повторяет:

- состав, порядок и иерархию блоков;
- размеры контейнеров, grid, padding, gap, radius, border и shadow;
- font family, size, weight, line height, цвет и выравнивание;
- иконки, иллюстрации, изображения и их crop/position;
- desktop, tablet и mobile composition;
- состояния компонентов и интеракции, показанные в Figma.

Нельзя добавлять собственные cards, sections, navigation, hero, декоративные
элементы или менять порядок блоков. Figma App Header не содержит текущую нижнюю
mobile-навигацию, поэтому она не входит в целевой app shell.

Доменная подстановка выполняется внутри исходного слота и с минимальным
изменением геометрии. Например, Physics/P2, фиктивный счетчик или балл выше 60
заменяются фактическим P1-контентом, но это не дает права пересобирать соседние
блоки. Если ложный элемент нельзя честно заменить, минимальное структурное
отклонение документируется в PR и проверяется владельцем на overlay.

Если нужного screen/state в Figma нет, разрешен provisional skeleton из
существующих Figma components и tokens. Он должен иметь отдельную issue, не
выдаваться за финальный дизайн и не становиться утвержденным Figma baseline.

## 4. Карта экранов

| Поверхность            | Текущее состояние                                                                                  | PDF                                                                           | Figma desktop / mobile                      | Целевой контракт                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Public landing         | `/` воспроизводит SR guest frames и их responsive geometry; EN/RU локализованы в той же композиции | В результат дизайнера marketing landing не входил; W-01 описывает P1 overview | SR `175:390` / `176:1706` / `177:2854`      | Поддерживать literal Figma-match; менять только подтвержденные факты, copy и реальные данные без перекомпоновки      |
| P1 overview / cabinet  | Functional overview перенесен на `/cabinet` и явно помечен provisional до отдельного UI slice      | W-01/W-02, S-01                                                               | Cabinet SR `154:572` / `154:916`            | Повторить nodes на отдельной app surface; реальные данные подставлять в те же widgets                                |
| Task bank              | `/tasks` функционален, но визуально и композиционно не совпадает                                   | W-03, S-02                                                                    | RU default `195:141` / `195:1090`           | Пересобрать по этим nodes; отсутствующую функциональность довести или временно реализовать честным provisional state |
| Task workspace         | Standalone task, diagnostic и simulation имеют собственные shells, не совпадающие с Figma Solution | W-04/W-05/W-07/W-09, S-03/S-04/S-06/S-08                                      | Solution SR `155:477` / `155:757`           | Standalone/practice workspace повторяет nodes; exam-only ограничения меняют поведение, а не произвольно композицию   |
| Training builder       | Быстрый builder находится на overview; selected tasks стартуют из банка                            | W-06, S-03/S-05                                                               | RU `219:4` / `219:424`                      | Реализовать отдельный экран по nodes, заменив предметы на позиции/темы P1 в существующих slots                       |
| Study plan             | `/prep` функционален, но имеет самостоятельную композицию                                          | W-10, S-09                                                                    | RU `214:4` / `214:450`                      | Пересобрать по nodes; фактический next action, readiness и progress занимают соответствующие Figma widgets           |
| History                | `/history` функционален, но имеет самостоятельную композицию                                       | W-11, S-10                                                                    | RU all history `223:8` / `223:1160`         | Пересобрать populated/empty/filter states по nodes и подставить реальные attempt/run types                           |
| Diagnostic result      | Реализован отдельный честный стартовый результат                                                   | W-09, S-08                                                                    | Отдельного production-ready экрана нет      | Считать provisional skeleton до появления утвержденного Figma node; доменная модель остается рабочей                 |
| Mock result / rubric   | Реализованы 0-60, self-rubric и weak-position action                                               | W-08, S-07                                                                    | Отдельного production-ready rubric flow нет | Считать provisional skeleton до появления утвержденного Figma node; Figma mock scores не использовать                |
| Exam catalog / faculty | Реализован актуальный FTN P1/P3-P8 catalog                                                         | W-12/W-13, S-11/S-12                                                          | Landing содержит демонстрационные cards     | Использовать точные landing card patterns; отдельные отсутствующие screens остаются provisional                      |

## 5. Правила реализации по поверхностям

### Landing

Figma landing переносится целиком: header, hero, benefits, exam selection,
faculties, process и CTA остаются в том же порядке и геометрии. Copy внутри этих
блоков сужается до реального FTN P1; Physics/P2 и неподдержанный широкий
multi-university promise не показываются. CTA ведет прямо в guest-first P1 flow.
Canonical SR regression frames: desktop `175:390`, tablet `176:1706`, mobile
`177:2854`. Их размеры составляют соответственно `1440x2898`, `1024x3094` и
`390x6120`; Linux screenshots проверяются после side-by-side и overlay review.

### Cabinet / overview

Figma Cabinet переносится с continue-card, картой позиций, последними
результатами, сохраненными факультетами и иллюстрацией в исходных slots. Числа
должны раскрываться до конкретных attempts/runs. Если нужного empty/loading
state в Figma нет, используется provisional вариант тех же components, а не
новый dashboard layout.

### Task bank

Точно воспроизводятся Figma search, rows, chips, counters, no-results и
multiple-selection states. Subject controls заполняются допустимыми P1 filters
в том же component slot; Physics/P2 не показываются. Счетчик использует
фактическое число задач.

### Task workspace

Figma Solution задает обязательную desktop/mobile композицию: progress, task
navigation, условие/ответ и help. Она воспроизводится без собственного shell и
перестановок. Подсказки разблокируются по текущим правилам; в simulation помощь
и мгновенная правильность отсутствуют до сдачи.

### Plan

Композиция Figma Study Plan переносится целиком. Объяснимый next action,
position rows и summary заполняются реальными observations и ведут к конкретной
practice action в предусмотренных design slots. Readiness не называется
вероятностью поступления или официальным баллом.

### History

Figma unified feed, filters, rows и responsive states являются точной целью.
Данные различают standalone answer, practice run, diagnostic и полный mock.
Task/mock detail сохраняет revision и grading provenance. Для отсутствующих в
Figma degraded/error states используются provisional варианты тех же components.

## 6. Зафиксированные решения владельца

| ID   | Решение                                                                                    | Статус     |
| ---- | ------------------------------------------------------------------------------------------ | ---------- |
| D-01 | Публичный `/` повторяет Figma Landing; рабочий Cabinet является отдельной app surface      | Утверждено |
| D-02 | Каждый существующий экран и responsive state повторяет конкретный Figma node pixel-perfect | Утверждено |
| D-03 | Самостоятельные блоки и нижняя mobile-навигация удаляются, если их нет в выбранном node    | Утверждено |
| D-04 | Ложные Physics/P2 и mock data заменяются без свободной перекомпоновки экрана               | Утверждено |
| D-05 | Экраны без Figma разрешены только как явно provisional skeleton                            | Утверждено |

## 7. Definition of ready для UI issue

Перед началом реализации issue содержит:

1. route и список обязательных состояний;
2. точные desktop/tablet/mobile Figma nodes или явную запись, что node нет;
3. список доменных substitutions и provisional states;
4. реальные data contracts и список удаляемых demo assumptions;
5. locale-copy для `sr-Latn`, `en` и `ru` либо правило fallback;
6. keyboard, focus, loading, empty, degraded и error acceptance;
7. план visual regression на 360x800, 768x1024 и 1440x900.

## 8. Definition of done для UI PR

- Реализация сравнена с Figma export side-by-side и через полупрозрачный overlay
  на точном размере frame; необъясненных геометрических отличий нет.
- Состав блоков, typography, spacing, colors, borders, radii, shadows, icons и
  assets совпадают с утвержденными nodes.
- Все состояния доступны через реальные contracts или детерминированные test
  fixtures, а не через production mock markup.
- На трех целевых ширинах нет horizontal overflow, обрезанного текста и
  перекрытия действий.
- `sr-Latn`, `en` и `ru` проходят functional tests; Serbian first viewport
  имеет проверенный Linux screenshot.
- Существующие domain, ownership, resume и grading tests остаются зелеными.
- Только проверенный Figma-match становится новым regression baseline;
  автоматически обновленный PNG без overlay-review не принимается.

## 9. Рекомендуемый порядок реализации

1. Пересобрать Marketing/App Header и shared components по canonical nodes.
2. Пересобрать публичный Landing и выделить отдельный Cabinet route.
3. Пересобрать Task Bank, Training Builder и Task Workspace.
4. Пересобрать Study Plan, History и Cabinet states.
5. Оставшиеся diagnostic/mock/catalog screens держать provisional до появления
   утвержденных Figma nodes, не ломая уже реализованное поведение.

Каждый пункт выполняется отдельной rebase-only веткой с self-review,
functional/visual gates и без одновременного production rollout.
