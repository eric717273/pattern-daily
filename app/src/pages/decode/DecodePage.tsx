import { Link } from 'react-router-dom';
import { CardStatus } from '../../components/CardStatus';
import { GrammarTags } from '../../components/GrammarTag';
import { ChevronRightIcon, DozenIcon, RefreshIcon, SparklesIcon } from '../../components/icons';
import { Badge, Card, PageHeader, SectionTitle, cx } from '../../components/ui';
import { DOZEN } from '../../content';
import { useCardMap } from '../../lib/hooks';

const ENTRIES = [
  { to: '/decode/practice?mode=transform', title: '变形练习', desc: '改疑问、否定、过去式、换代词，看骨架怎么变', Icon: RefreshIcon },
  { to: '/decode/practice?mode=label', title: '成分标注', desc: '给句子里的词标上主语、谓语、宾语和时态', Icon: DozenIcon },
  { to: '/decode/analyze', title: 'AI 解构任意句子', desc: '贴一句长句，看它的骨架和逐字对照', Icon: SparklesIcon },
] as const;

/** Decode track hub (Tim Ferriss): the 13 skeletons plus the practice entries. */
export function DecodePage() {
  const cards = useCardMap();
  const learned = cards ? DOZEN.filter((d) => cards.has(`dozen:${d.id}`)).length : 0;

  return (
    <>
      <PageHeader title="解码" subtitle={cards ? `13 个骨架句，已学 ${learned} 个` : '13 个骨架句'} />

      <Card className="mb-5 border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/60 dark:bg-indigo-950/30">
        <p className="text-[15px] leading-relaxed font-medium text-indigo-900 dark:text-indigo-200">
          解码练的是看懂句子的结构：语序、代词、时态、疑问、否定和情态。
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          看懂结构，不追求脱口而出——那是语块线的事。
        </p>
        <details className="group mt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-indigo-700 dark:text-indigo-300 [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon size={16} className="transition-transform group-open:rotate-90" />
            这套方法怎么用
          </summary>
          <div className="pt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            <p>
              Tim Ferriss 的“解构”：用 apple、John 这类假人词把词汇负担降到零，注意力全放在语序、代词、时态、疑问、否定和情态动词上。
              先看清每一句的骨架（中英逐字对照），再用变形练习确认你真的懂了。
            </p>
            <p className="mt-1.5">
              前 12 句是核心，<span className="font-medium">第 13 句是彩蛋句（现在完成时）</span>。前 13 天每天学一句，之后每天只用约 3 分钟维护。
            </p>
          </div>
        </details>
      </Card>

      <ul className="mb-7 grid gap-3 sm:grid-cols-3" aria-label="解码练习入口">
        {ENTRIES.map((e) => (
          <li key={e.to}>
            <Link to={e.to} className="block h-full rounded-2xl">
              <Card interactive className="flex h-full items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200">
                  <e.Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{e.title}</p>
                  <p className="mt-0.5 text-sm leading-snug text-slate-500 dark:text-slate-400">{e.desc}</p>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-label="13 个骨架句">
        <SectionTitle>13 个骨架句</SectionTitle>
        <ul className="flex flex-col gap-3">
          {DOZEN.map((d) => (
            <li key={d.id}>
              <Link to={`/decode/dozen/${d.id}`} className="block rounded-2xl" aria-label={`第 ${d.order} 句：${d.en}`}>
                <Card interactive className="flex items-start gap-3.5">
                  <span
                    className={cx(
                      'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                      d.order === 13
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                        : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200',
                    )}
                  >
                    {d.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-en text-lg leading-snug font-semibold text-slate-900 dark:text-white">{d.en}</p>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{d.zh}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {d.order === 13 && <Badge tone="amber">彩蛋句</Badge>}
                      <GrammarTags points={d.grammar} className="contents" />
                    </div>
                    <div className="mt-2">
                      {cards ? (
                        cards.has(`dozen:${d.id}`) ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <Badge tone="emerald">已学</Badge>
                            <CardStatus card={cards.get(`dozen:${d.id}`)} />
                          </span>
                        ) : (
                          <Badge tone="slate">未学</Badge>
                        )
                      ) : (
                        <span className="inline-block h-5 w-20 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
                      )}
                    </div>
                  </div>
                  <ChevronRightIcon size={20} className="mt-2 shrink-0 text-slate-300 dark:text-slate-600" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
