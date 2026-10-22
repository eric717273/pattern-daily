import { Link } from 'react-router-dom';
import { CardStatus } from '../components/CardStatus';
import { GrammarTags } from '../components/GrammarTag';
import { ChevronRightIcon } from '../components/icons';
import { Badge, Card, PageHeader, cx } from '../components/ui';
import { DOZEN } from '../content';
import { useCardMap } from '../lib/hooks';

export function DozenListPage() {
  const cards = useCardMap();
  const started = cards ? DOZEN.filter((d) => cards.has(`dozen:${d.id}`)).length : 0;

  return (
    <>
      <PageHeader
        title="12 句解构"
        subtitle={cards ? `共 13 句，已加入复习 ${started} 句` : '共 13 句'}
      />

      <Card className="mb-5 border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/60 dark:bg-indigo-950/30">
        <h2 className="text-[15px] font-semibold text-indigo-900 dark:text-indigo-200">这套方法怎么用</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          Tim Ferriss 的“解构”：用 apple、John 这类假人词把词汇负担降到零，注意力全放在语序、代词、时态、疑问、否定和情态动词上。
          先看清每一句的骨架（中英逐字对照），再把真实词汇套进去。
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          前 12 句是核心，<span className="font-medium">第 13 句是彩蛋句（现在完成时）</span>。
        </p>
      </Card>

      <ul className="flex flex-col gap-3">
        {DOZEN.map((d) => (
          <li key={d.id}>
            <Link to={`/dozen/${d.id}`} className="block rounded-2xl" aria-label={`第 ${d.order} 句：${d.en}`}>
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
                      <CardStatus card={cards.get(`dozen:${d.id}`)} />
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
    </>
  );
}
