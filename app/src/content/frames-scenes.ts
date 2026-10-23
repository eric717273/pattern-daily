import type { SlotOption, SubstitutionFrame } from '../types';

/**
 * Scene-based Palmer substitution tables (母框) for real-life spoken English:
 * work 12 (f027-f038), daily 8 (f039-f046), travel 5 (f047-f051),
 * social 5 (f052-f056), study 4 (f057-f060).
 *
 * HARD RULE: every combination of one option per slot is grammatical, natural English
 * and reads acceptably in Chinese. Agreement is kept safe by putting the inflected
 * verb / contraction (I've, we're, it is ...) inside the same slot as its subject, and
 * by only offering objects, times and conditions that fit every verb in the table.
 */
const o = (en: string, zh: string): SlotOption => ({ en, zh });

export const FRAMES_SCENES: SubstitutionFrame[] = [
  // =====================================================================
  // WORK
  // =====================================================================

  // ---------- f027 汇报进度 ----------
  {
    id: 'f027',
    title: '汇报进度',
    pattern: '{opener} {subject} {done}.',
    patternZh: '{opener}{subject}{done}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Good news,', '好消息，'),
          o('Just so you know,', '跟你说一声，'),
          o('FYI,', '供你参考，'),
          o('By the way,', '顺便说一下，'),
        ],
      },
      {
        key: 'subject',
        labelZh: '主语+现在完成时',
        options: [
          o("I've already", '我已经'),
          o("we've already", '我们已经'),
          o("I've just", '我刚刚'),
          o("we've just", '我们刚刚'),
        ],
      },
      {
        key: 'done',
        labelZh: '完成的事',
        options: [
          o('sent the report to the client', '把报告发给客户了'),
          o('finished the first draft', '写完了初稿'),
          o('booked the meeting room', '订好了会议室'),
          o('fixed the bug', '修好了这个漏洞'),
          o('updated the schedule', '更新了日程'),
        ],
      },
    ],
    grammar: ['present-perfect'],
    scene: 'work',
    level: 1,
    examples: [
      o("Good news, we've already booked the meeting room.", '好消息，我们已经订好了会议室。'),
      o("Just so you know, I've just sent the report to the client.", '跟你说一声，我刚刚把报告发给客户了。'),
      o("FYI, I've already fixed the bug.", '供你参考，我已经修好了这个漏洞。'),
    ],
    tipZh:
      '汇报"已经做完"用现在完成时 have + 过去分词，重点是结果；already / just 放在 have 和过去分词之间。不要和 yesterday、last week 等明确的过去时间连用。',
    source: 'seed',
    category: 'work',
    freq: 1,
    soundZh: 'I\'ve already → I\'ve-ahl-ready；we\'ve → weev',
  },

  // ---------- f028 提出建议 ----------
  {
    id: 'f028',
    title: '提出建议',
    pattern: '{starter} {action} {time}?',
    patternZh: '我们{time}{action}，{starter}？',
    slots: [
      {
        key: 'starter',
        labelZh: '建议句头',
        options: [
          o('Why don\'t we', '怎么样'),
          o('Shall we', '好吗'),
          o('How about if we', '你觉得呢'),
          o('What if we', '可以吗'),
        ],
      },
      {
        key: 'action',
        labelZh: '动作',
        options: [
          o('have a quick meeting', '开个简短的会'),
          o('go over the budget', '过一遍预算'),
          o('split the work', '把工作分一下'),
          o('set up a call', '安排一次电话会议'),
          o('review the plan', '把计划再看一遍'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('this afternoon', '今天下午'),
          o('after lunch', '午饭后'),
          o('first thing tomorrow', '明天一早'),
          o('on Monday', '周一'),
          o('before the deadline', '截止日期前'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'work',
    level: 1,
    examples: [
      o("Why don't we split the work first thing tomorrow?", '我们明天一早把工作分一下，怎么样？'),
      o('Shall we go over the budget after lunch?', '我们午饭后过一遍预算，好吗？'),
      o('What if we set up a call on Monday?', '我们周一安排一次电话会议，可以吗？'),
    ],
    tipZh:
      '四种句头都能接动词原形，语气从直接到委婉：Why don\'t we 最常用，Shall we 稍正式，What if we 更像试探。时间放在句尾。',
    source: 'seed',
    category: 'offer',
    freq: 1,
    soundZh: 'Why don\'t we → Why-don-we（t 吞音）；What if we → Whadif-we',
  },

  // ---------- f029 请对方说明 ----------
  {
    id: 'f029',
    title: '请对方说明',
    pattern: '{opener} {problem} {topic}.',
    patternZh: '{opener}{problem}{topic}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Sorry,', '不好意思，'),
          o('Excuse me,', '打扰一下，'),
          o('Sorry to interrupt, but', '不好意思打断一下，不过'),
          o('Sorry about this, but', '抱歉，不过'),
        ],
      },
      {
        key: 'problem',
        labelZh: '没明白的程度',
        options: [
          o("I didn't catch", '我没听清'),
          o("I don't understand", '我不太明白'),
          o("I'm not sure about", '我不太确定'),
          o("I'm not clear on", '我不太清楚'),
        ],
      },
      {
        key: 'topic',
        labelZh: '不明白的内容',
        options: [
          o('the last part', '最后一部分'),
          o('the deadline', '截止日期'),
          o('what you just said', '你刚才说的内容'),
          o('the next step', '下一步'),
          o('the budget', '预算'),
        ],
      },
    ],
    grammar: ['negation-modal'],
    scene: 'work',
    level: 1,
    examples: [
      o("Sorry, I didn't catch the next step.", '不好意思，我没听清下一步。'),
      o("Excuse me, I'm not clear on what you just said.", '打扰一下，我不太清楚你刚才说的内容。'),
      o("Sorry to interrupt, but I'm not sure about the deadline.", '不好意思打断一下，不过我不太确定截止日期。'),
    ],
    tipZh:
      '没听懂时先说 Sorry 再坦白，比沉默或只说 "What?" 礼貌得多。didn\'t catch 指"没听清"，don\'t understand 指"没理解"，别混用。',
    source: 'seed',
    category: 'clarify',
    freq: 1,
    soundZh: 'didn\'t catch → didn(t)-catch（t 吞音）；Sorry to → Sorry-ta',
  },

  // ---------- f030 约时间 ----------
  {
    id: 'f030',
    title: '约时间',
    pattern: '{opener} are you {state} {time} {purpose}?',
    patternZh: '{opener}{time}你{state}{purpose}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Hi,', '你好，'),
          o('Quick question,', '问一下，'),
          o('By the way,', '对了，'),
          o('Excuse me,', '打扰一下，'),
        ],
      },
      {
        key: 'state',
        labelZh: '状态',
        options: [
          o('free', '有空'),
          o('available', '方便'),
          o('still free', '还有空'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('tomorrow morning', '明天上午'),
          o('on Thursday afternoon', '周四下午'),
          o('later today', '今天晚些时候'),
          o('sometime next week', '下周找个时间'),
          o('after the meeting', '会议结束后'),
        ],
      },
      {
        key: 'purpose',
        labelZh: '目的',
        options: [
          o('for a quick chat', '聊几分钟'),
          o('for a short call', '通个电话'),
          o('to go over the report', '过一下报告'),
          o('to discuss the budget', '讨论一下预算'),
        ],
      },
    ],
    grammar: ['question-inversion', 'be-adj'],
    scene: 'work',
    level: 1,
    examples: [
      o('Hi, are you free tomorrow morning for a quick chat?', '你好，明天上午你有空聊几分钟吗？'),
      o('Quick question, are you available later today for a short call?', '问一下，今天晚些时候你方便通个电话吗？'),
      o('By the way, are you still free after the meeting to discuss the budget?', '对了，会议结束后你还有空讨论一下预算吗？'),
    ],
    tipZh:
      '约时间用 Are you free / available + 时间，be 动词提到主语前面。free 更随意，available 更职场；时间放在形容词后面，不要加介词 at。',
    source: 'seed',
    category: 'plan',
    freq: 1,
    soundZh: 'are you free → Arya free',
  },

  // ---------- f031 请人转交 ----------
  {
    id: 'f031',
    title: '请人转交',
    pattern: '{opener} could you {verb} {object} to {person} {time}?',
    patternZh: '{opener}能不能{time}把{object}{verb}{person}？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Hi,', '你好，'),
          o('Hey,', '嘿，'),
          o('Sorry,', '抱歉，'),
          o('Excuse me,', '打扰一下，'),
        ],
      },
      {
        key: 'verb',
        labelZh: '动作',
        options: [
          o('send', '发给'),
          o('forward', '转发给'),
          o('give', '交给'),
          o('bring', '带给'),
          o('pass', '递给'),
        ],
      },
      {
        key: 'object',
        labelZh: '宾语（代词）',
        options: [
          o('it', '它'),
          o('them', '它们'),
          o('that', '那个'),
        ],
      },
      {
        key: 'person',
        labelZh: '接收人（代词）',
        options: [
          o('him', '他'),
          o('her', '她'),
          o('us', '我们'),
          o('me', '我'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('today', '今天'),
          o('before lunch', '午饭前'),
          o('by tomorrow', '明天之前'),
          o('when you have a chance', '有空的时候'),
          o('as soon as you can', '尽快'),
        ],
      },
    ],
    grammar: ['question-inversion', 'pronoun-order', 'object-pronoun'],
    scene: 'work',
    level: 2,
    examples: [
      o('Hi, could you send it to him today?', '你好，能不能今天把它发给他？'),
      o('Sorry, could you give them to her before lunch?', '抱歉，能不能午饭前把它们交给她？'),
      o('Excuse me, could you forward that to me as soon as you can?', '打扰一下，能不能尽快把那个转发给我？'),
    ],
    tipZh:
      '物品是代词（it / them / that）时，必须先说物品再说 to + 人：send it to him，不能说 send him it。如果物品是名词，才可以说 send him the file。',
    source: 'seed',
    category: 'request',
    freq: 2,
    soundZh: 'Could you → Couldja；send it to → sen-di-ta（it 与 to 连读）',
  },

  // ---------- f032 说明计划 ----------
  {
    id: 'f032',
    title: '说明计划',
    pattern: '{subject} {action} {time}.',
    patternZh: '{subject}{time}{action}。',
    slots: [
      {
        key: 'subject',
        labelZh: '主语+打算',
        options: [
          o("I'm planning to", '我打算'),
          o("We're planning to", '我们打算'),
          o("I'm hoping to", '我希望'),
          o("We're hoping to", '我们希望'),
        ],
      },
      {
        key: 'action',
        labelZh: '动作',
        options: [
          o('launch the new website', '上线新网站'),
          o('finish the first draft', '完成初稿'),
          o('hire two more designers', '再招两名设计师'),
          o('send the proposal', '发出方案'),
          o('book the venue', '订好场地'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('next week', '下周'),
          o('by the end of the month', '月底前'),
          o('before Friday', '周五之前'),
          o('early next quarter', '下个季度初'),
          o('sometime this month', '本月内'),
        ],
      },
    ],
    grammar: ['going-to', 'want-to'],
    scene: 'work',
    level: 2,
    examples: [
      o("We're planning to hire two more designers by the end of the month.", '我们打算月底前再招两名设计师。'),
      o("I'm hoping to book the venue early next quarter.", '我希望下个季度初订好场地。'),
      o("I'm planning to launch the new website next week.", '我打算下周上线新网站。'),
    ],
    tipZh:
      "be planning to / be hoping to 后面都接动词原形，比 I will 更委婉，适合向同事或上级说明还没完全确定的计划。be 动词要跟主语变化：I'm / We're。",
    source: 'seed',
    category: 'plan',
    freq: 2,
    soundZh: 'planning to → plannin\'-ta；hoping to → hopin\'-ta',
  },

  // ---------- f033 表达观点 ----------
  {
    id: 'f033',
    title: '表达观点',
    pattern: '{opener} we {modal} {action} {time}.',
    patternZh: '{opener}我们{modal}{time}{action}。',
    slots: [
      {
        key: 'opener',
        labelZh: '观点句头',
        options: [
          o('I think', '我认为'),
          o("I don't think", '我不认为'),
          o('I feel that', '我觉得'),
          o('It seems to me that', '在我看来'),
        ],
      },
      {
        key: 'modal',
        labelZh: '情态',
        options: [
          o('should', '应该'),
          o('can', '可以'),
          o('have to', '必须'),
        ],
      },
      {
        key: 'action',
        labelZh: '动作',
        options: [
          o('postpone the launch', '推迟发布'),
          o('ask for more time', '申请更多时间'),
          o('talk to the client', '和客户谈谈'),
          o('change the schedule', '调整日程'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('right away', '马上'),
          o('this week', '本周内'),
          o('at the next meeting', '在下次会议上'),
          o('first thing tomorrow', '明天一早'),
        ],
      },
    ],
    grammar: ['modal-must'],
    scene: 'work',
    level: 2,
    examples: [
      o('I think we should postpone the launch right away.', '我认为我们应该马上推迟发布。'),
      o("I don't think we can change the schedule this week.", '我不认为我们可以本周内调整日程。'),
      o('It seems to me that we have to talk to the client at the next meeting.', '在我看来我们必须在下次会议上和客户谈谈。'),
    ],
    tipZh:
      "否定观点时英语习惯说 I don't think we should...，而不是 I think we shouldn't...。情态动词 should / can / have to 后面一律接动词原形。",
    source: 'seed',
    category: 'opinion',
    freq: 1,
    soundZh: 'I think we should → I-think-we-shud；don\'t think → doan-think',
  },

  // ---------- f034 道歉并补救 ----------
  {
    id: 'f034',
    title: '道歉并补救',
    pattern: "{opener} I {problem} {action}. I'll do it {time}.",
    patternZh: '{opener}我{problem}{action}。我{time}就去做。',
    slots: [
      {
        key: 'opener',
        labelZh: '道歉',
        options: [
          o('Sorry,', '抱歉，'),
          o("I'm so sorry,", '真的很抱歉，'),
          o('My apologies,', '十分抱歉，'),
          o('Sorry about that,', '不好意思，'),
        ],
      },
      {
        key: 'problem',
        labelZh: '没做的原因',
        options: [
          o('forgot to', '忘了'),
          o("didn't have time to", '没时间'),
          o("wasn't able to", '没能'),
          o("didn't get a chance to", '没来得及'),
        ],
      },
      {
        key: 'action',
        labelZh: '没做的事',
        options: [
          o('reply to your email', '回复你的邮件'),
          o('finish the slides', '完成幻灯片'),
          o('call the client', '给客户打电话'),
          o('check the numbers', '核对数据'),
        ],
      },
      {
        key: 'time',
        labelZh: '补救时间',
        options: [
          o('right now', '现在马上'),
          o('tonight', '今晚'),
          o('first thing tomorrow', '明天一早'),
          o('before I leave today', '下班前'),
        ],
      },
    ],
    grammar: ['negation-modal'],
    scene: 'work',
    level: 2,
    examples: [
      o("Sorry, I forgot to reply to your email. I'll do it right now.", '抱歉，我忘了回复你的邮件。我现在马上就去做。'),
      o("I'm so sorry, I didn't have time to finish the slides. I'll do it tonight.", '真的很抱歉，我没时间完成幻灯片。我今晚就去做。'),
      o("My apologies, I didn't get a chance to call the client. I'll do it first thing tomorrow.", '十分抱歉，我没来得及给客户打电话。我明天一早就去做。'),
    ],
    tipZh:
      "道歉后一定要给出补救时间，这样才显得负责。过去没做的事用 didn't / wasn't able to + 动词原形；forgot to 后面也接原形。",
    source: 'seed',
    category: 'thanks',
    freq: 2,
    soundZh: 'forgot to → forgotta；didn\'t get a chance to → didn\' get-a chance-ta',
  },

  // ---------- f035 有条件的承诺 ----------
  {
    id: 'f035',
    title: '有条件的承诺',
    pattern: '{opener} if {condition}, {subject} {action}.',
    patternZh: '{opener}如果{condition}，{subject}{action}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Sure,', '没问题，'),
          o('OK,', '好的，'),
          o("Don't worry,", '别担心，'),
          o('Alright,', '行，'),
        ],
      },
      {
        key: 'condition',
        labelZh: '条件',
        options: [
          o('you send me the details', '你把详细资料发给我'),
          o('the client agrees', '客户同意'),
          o('we finish early', '我们提前完成'),
          o('the budget allows it', '预算允许'),
          o('everything goes well', '一切顺利'),
        ],
      },
      {
        key: 'subject',
        labelZh: '主语+will',
        options: [
          o("I'll", '我会'),
          o("we'll", '我们会'),
          o('my team will', '我的团队会'),
          o('my manager will', '我的经理会'),
        ],
      },
      {
        key: 'action',
        labelZh: '承诺的动作',
        options: [
          o('start on it right away', '马上着手处理'),
          o('let you know', '通知你'),
          o('send you an update', '给你发一份进展'),
          o('book the room', '订好会议室'),
          o('schedule a follow-up meeting', '安排一次后续会议'),
        ],
      },
    ],
    grammar: ['double-object', 'object-pronoun'],
    scene: 'work',
    level: 3,
    examples: [
      o("Sure, if you send me the details, I'll start on it right away.", '没问题，如果你把详细资料发给我，我会马上着手处理。'),
      o("Don't worry, if the budget allows it, my manager will send you an update.", '别担心，如果预算允许，我的经理会给你发一份进展。'),
      o("OK, if everything goes well, we'll schedule a follow-up meeting.", '好的，如果一切顺利，我们会安排一次后续会议。'),
    ],
    tipZh:
      'if 从句用一般现在时（if the client agrees），主句才用 will，不要在 if 后面再加 will。send you an update 是双宾语结构：先说人，再说东西。',
    source: 'seed',
    category: 'offer',
    freq: 3,
  },

  // ---------- f036 表达偏好 ----------
  {
    id: 'f036',
    title: '表达偏好',
    pattern: '{subject} rather {first} than {second}, {tail}.',
    patternZh: '{tail}，{subject}宁愿{first}，也不想{second}。',
    slots: [
      {
        key: 'subject',
        labelZh: '主语+would',
        options: [
          o("I'd", '我'),
          o("We'd", '我们'),
          o("I'd actually", '我其实'),
          o("We'd actually", '我们其实'),
        ],
      },
      {
        key: 'first',
        labelZh: '更想做的事',
        options: [
          o('meet in person', '当面谈'),
          o('talk on the phone', '打电话沟通'),
          o('have a video call', '开视频会议'),
          o('sit down and talk', '坐下来谈'),
        ],
      },
      {
        key: 'second',
        labelZh: '不想做的事',
        options: [
          o('write a long email', '写一封长邮件'),
          o('wait for a reply', '等对方回复'),
          o('send lots of messages', '发一堆消息'),
        ],
      },
      {
        key: 'tail',
        labelZh: '补充',
        options: [
          o('if possible', '如果可以的话'),
          o("if that's OK with you", '如果你同意的话'),
          o('this time', '这一次'),
          o('for this project', '在这个项目上'),
        ],
      },
    ],
    grammar: ['modal-must'],
    scene: 'work',
    level: 3,
    examples: [
      o("I'd rather meet in person than write a long email, if possible.", '如果可以的话，我宁愿当面谈，也不想写一封长邮件。'),
      o("We'd actually rather have a video call than wait for a reply, this time.", '这一次，我们其实宁愿开视频会议，也不想等对方回复。'),
      o("I'd actually rather talk on the phone than send lots of messages, for this project.", '在这个项目上，我其实宁愿打电话沟通，也不想发一堆消息。'),
    ],
    tipZh:
      "would rather 后面直接接动词原形（不加 to），than 后面也用原形：I'd rather meet than write。口语里 I'd 是 I would 的缩写，不是 I had。",
    source: 'seed',
    category: 'opinion',
    freq: 3,
    soundZh: 'I\'d rather → I\'d-rather（\'d 极弱）；rather than → rather-thn',
  },

  // ---------- f037 汇报未完成 ----------
  {
    id: 'f037',
    title: '汇报未完成的工作',
    pattern: '{opener} {subject} still working on {task}, but {status}.',
    patternZh: '{opener}{subject}还在处理{task}，不过{status}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Quick update,', '简单更新一下，'),
          o('As of now,', '目前，'),
          o('Right now,', '现在，'),
          o('Just so you know,', '跟你说一声，'),
        ],
      },
      {
        key: 'subject',
        labelZh: '主语+be',
        options: [
          o("we're", '我们'),
          o("I'm", '我'),
          o('the team is', '团队'),
          o('my team is', '我的团队'),
        ],
      },
      {
        key: 'task',
        labelZh: '工作内容',
        options: [
          o('the new design', '新设计'),
          o('the budget report', '预算报告'),
          o('the client proposal', '客户方案'),
          o('the user manual', '用户手册'),
        ],
      },
      {
        key: 'status',
        labelZh: '进展',
        options: [
          o('it should be ready by Friday', '周五前应该能完成'),
          o("it won't take much longer", '不会再花太久'),
          o("I'll send you a draft tomorrow", '我明天给你发一份草稿'),
          o("we've already finished the first part", '我们已经完成了第一部分'),
          o('we expect to finish next week', '我们预计下周完成'),
        ],
      },
    ],
    grammar: ['negation-modal', 'present-perfect'],
    scene: 'work',
    level: 3,
    examples: [
      o("Quick update, we're still working on the new design, but it should be ready by Friday.", '简单更新一下，我们还在处理新设计，不过周五前应该能完成。'),
      o("Right now, the team is still working on the client proposal, but I'll send you a draft tomorrow.", '现在，团队还在处理客户方案，不过我明天给你发一份草稿。'),
      o("As of now, I'm still working on the budget report, but we've already finished the first part.", '目前，我还在处理预算报告，不过我们已经完成了第一部分。'),
    ],
    tipZh:
      '先说"还没完成"，再用 but 给出积极的进展，是职场汇报的好习惯。still 放在 be 动词之后、working 之前。第二个分句里的 it 指前面的工作。',
    source: 'seed',
    category: 'work',
    freq: 1,
    soundZh: 'still working on → still workin\' on',
  },

  // ---------- f038 委婉请求 ----------
  {
    id: 'f038',
    title: '委婉请求',
    pattern: '{opener} would you mind {action} {tail}?',
    patternZh: '{opener}{tail}能不能麻烦你{action}？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Sorry to ask, but', '不好意思问一下，不过'),
          o("I know you're busy, but", '我知道你很忙，不过'),
          o('I hate to bother you, but', '实在不好意思打扰你，不过'),
        ],
      },
      {
        key: 'action',
        labelZh: '请求的动作（-ing）',
        options: [
          o('sending me the slides', '把幻灯片发给我'),
          o('giving me some feedback on my draft', '对我的草稿提点意见'),
          o('helping me with the report', '帮我处理一下报告'),
          o('introducing me to the new manager', '把我介绍给新经理'),
        ],
      },
      {
        key: 'tail',
        labelZh: '时间/条件',
        options: [
          o('when you have a moment', '有空的时候'),
          o("if it's not too much trouble", '如果方便的话'),
          o('after the meeting', '会议结束后'),
          o('before you leave today', '今天下班前'),
        ],
      },
    ],
    grammar: ['question-inversion', 'object-pronoun'],
    scene: 'work',
    level: 3,
    examples: [
      o("Sorry to ask, but would you mind sending me the slides when you have a moment?", '不好意思问一下，不过有空的时候能不能麻烦你把幻灯片发给我？'),
      o("I know you're busy, but would you mind introducing me to the new manager after the meeting?", '我知道你很忙，不过会议结束后能不能麻烦你把我介绍给新经理？'),
      o("I hate to bother you, but would you mind helping me with the report before you leave today?", '实在不好意思打扰你，不过今天下班前能不能麻烦你帮我处理一下报告？'),
    ],
    tipZh:
      'Would you mind 后面接动词 -ing，不是原形。想答应时说 "Not at all" 或 "Sure, no problem"（别说 Yes，Yes 会被理解为"介意"）。',
    source: 'seed',
    category: 'request',
    freq: 2,
    soundZh: 'Would you mind → Wouldja mind',
  },

  // =====================================================================
  // DAILY
  // =====================================================================

  // ---------- f039 说明要做的事 ----------
  {
    id: 'f039',
    title: '说明要做的事',
    pattern: '{modal} {action} {time}.',
    patternZh: '{time}{modal}{action}。',
    slots: [
      {
        key: 'modal',
        labelZh: '主语+情态',
        options: [
          o('I have to', '我得'),
          o('I need to', '我需要'),
          o("I'd better", '我最好'),
          o("I'm going to", '我打算'),
          o('I want to', '我想'),
        ],
      },
      {
        key: 'action',
        labelZh: '动作',
        options: [
          o('do the laundry', '洗衣服'),
          o('go grocery shopping', '去买菜'),
          o('call my mom', '给我妈妈打电话'),
          o('clean the kitchen', '打扫厨房'),
          o('take out the trash', '倒垃圾'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('tonight', '今晚'),
          o('this weekend', '这个周末'),
          o('after work', '下班后'),
          o('before dinner', '晚饭前'),
          o('tomorrow morning', '明天早上'),
        ],
      },
    ],
    grammar: ['modal-must', 'going-to', 'want-to'],
    scene: 'daily',
    level: 1,
    examples: [
      o('I have to do the laundry after work.', '下班后我得洗衣服。'),
      o("I'd better call my mom tomorrow morning.", '明天早上我最好给我妈妈打电话。'),
      o("I'm going to clean the kitchen before dinner.", '晚饭前我打算打扫厨房。'),
    ],
    tipZh:
      "这一组开头词的力度不同：have to / need to 是必须做，I'd better 是\"最好做，否则有麻烦\"，I'm going to 是已经决定，I want to 是个人意愿。后面都接动词原形。",
    source: 'seed',
    category: 'plan',
    freq: 1,
    soundZh: 'have to → hafta；I\'d better → I\'d-better（better 的 t 变轻 d）；going to → gonna；want to → wanna',
  },

  // ---------- f040 请求许可 ----------
  {
    id: 'f040',
    title: '请求许可',
    pattern: '{opener} can I {action}, {tail}?',
    patternZh: '{opener}{tail}，我可以{action}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '不好意思，'),
          o('Hi,', '嗨，'),
          o('Sorry,', '抱歉，'),
          o('Hey,', '嘿，'),
        ],
      },
      {
        key: 'action',
        labelZh: '想做的事',
        options: [
          o('borrow your charger', '借一下你的充电器'),
          o('use your phone for a second', '用一下你的手机'),
          o('sit here', '坐这里'),
          o('have a glass of water', '喝杯水'),
          o('open the window', '开一下窗户'),
        ],
      },
      {
        key: 'tail',
        labelZh: '客气话',
        options: [
          o("if that's OK", '如果可以的话'),
          o("if you don't mind", '如果你不介意的话'),
          o("if it's no trouble", '如果不麻烦的话'),
          o('if possible', '如果方便的话'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'daily',
    level: 1,
    examples: [
      o("Hey, can I sit here, if you don't mind?", '嘿，如果你不介意的话，我可以坐这里吗？'),
      o("Excuse me, can I borrow your charger, if it's no trouble?", '不好意思，如果不麻烦的话，我可以借一下你的充电器吗？'),
      o('Sorry, can I open the window, if possible?', '抱歉，如果方便的话，我可以开一下窗户吗？'),
    ],
    tipZh:
      'Can I... 是最常用的请求许可句型，朋友之间直接用；对陌生人在句尾加 if you don\'t mind 会更礼貌。借东西用 borrow（借入），不要和 lend（借出）弄混。',
    source: 'seed',
    category: 'request',
    freq: 1,
    soundZh: 'Can I → Can-nai；if you don\'t mind → if-ya-doan-mind',
  },

  // ---------- f041 询问物主 ----------
  {
    id: 'f041',
    title: '询问东西是谁的',
    pattern: "{opener} is that {owner}'s {thing} {place}?",
    patternZh: '{opener}{place}那个是{owner}的{thing}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '不好意思，'),
          o('Sorry,', '抱歉，'),
          o('By the way,', '对了，'),
          o('Quick question,', '问一下，'),
        ],
      },
      {
        key: 'owner',
        labelZh: '物主',
        options: [
          o('Anna', '安娜'),
          o('Tom', '汤姆'),
          o('Lisa', '丽莎'),
          o('your sister', '你姐姐'),
          o('your brother', '你哥哥'),
        ],
      },
      {
        key: 'thing',
        labelZh: '物品',
        options: [
          o('phone', '手机'),
          o('bag', '包'),
          o('coat', '外套'),
          o('umbrella', '雨伞'),
          o('laptop', '笔记本电脑'),
        ],
      },
      {
        key: 'place',
        labelZh: '地点',
        options: [
          o('on the table', '桌子上'),
          o('by the door', '门边'),
          o('in the kitchen', '厨房里'),
          o('on the sofa', '沙发上'),
        ],
      },
    ],
    grammar: ['possessive', 'question-inversion'],
    scene: 'daily',
    level: 1,
    examples: [
      o("Excuse me, is that Tom's laptop in the kitchen?", '不好意思，厨房里那个是汤姆的笔记本电脑吗？'),
      o("By the way, is that your sister's bag by the door?", '对了，门边那个是你姐姐的包吗？'),
      o("Sorry, is that Anna's umbrella on the sofa?", '抱歉，沙发上那个是安娜的雨伞吗？'),
    ],
    tipZh:
      "物主后面加 's 表示\"……的\"：Tom's laptop。问句要把 is 提到 that 前面（Is that...?）。如果物主是 your sister 这样的短语，'s 加在最后一个词上：your sister's bag。",
    source: 'seed',
    category: 'question',
    freq: 2,
    soundZh: 'Is that → Izzat',
  },

  // ---------- f042 说明谁把东西给了谁 ----------
  {
    id: 'f042',
    title: '说明东西给了谁',
    pattern: '{subject} {verb} {object} to {person} {time}.',
    patternZh: '{subject}{time}把{object}{verb}了{person}。',
    slots: [
      {
        key: 'subject',
        labelZh: '主语',
        options: [
          o('I', '我'),
          o('We', '我们'),
          o('My sister', '我姐姐'),
          o('My boss', '我老板'),
          o('My roommate', '我室友'),
        ],
      },
      {
        key: 'verb',
        labelZh: '动作（过去式）',
        options: [
          o('sent', '寄给'),
          o('gave', '交给'),
          o('lent', '借给'),
          o('passed', '递给'),
          o('brought', '带给'),
        ],
      },
      {
        key: 'object',
        labelZh: '物品（代词）',
        options: [
          o('it', '它'),
          o('them', '它们'),
          o('that', '那个'),
        ],
      },
      {
        key: 'person',
        labelZh: '接收人（代词）',
        options: [
          o('him', '他'),
          o('her', '她'),
          o('you', '你'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('yesterday', '昨天'),
          o('last week', '上周'),
          o('this morning', '今天早上'),
          o('a few days ago', '几天前'),
          o('on Monday', '周一'),
        ],
      },
    ],
    grammar: ['pronoun-order'],
    scene: 'daily',
    level: 2,
    examples: [
      o('I gave it to her yesterday.', '我昨天把它交给了她。'),
      o('My sister lent them to him last week.', '我姐姐上周把它们借给了他。'),
      o('We passed that to you this morning.', '我们今天早上把那个递给了你。'),
    ],
    tipZh:
      '宾语是代词时顺序固定：动词 + 物品 + to + 人（gave it to her）。不能说 gave her it。想用"人在前"的说法，物品必须是名词：gave her the book。',
    source: 'seed',
    category: 'experience',
    freq: 2,
  },

  // ---------- f043 从没做过 ----------
  {
    id: 'f043',
    title: '谈没做过的事',
    pattern: '{subject} {experience}, {tail}.',
    patternZh: '{subject}{experience}，{tail}。',
    slots: [
      {
        key: 'subject',
        labelZh: '主语+never',
        options: [
          o("I've never", '我从来没有'),
          o("I've never really", '我其实从来没有'),
          o("I've honestly never", '说实话我从来没有'),
          o("I've still never", '我至今还没有'),
        ],
      },
      {
        key: 'experience',
        labelZh: '没做过的事',
        options: [
          o('tried sushi', '尝过寿司'),
          o('been to Japan', '去过日本'),
          o('ridden a horse', '骑过马'),
          o('seen that movie', '看过那部电影'),
          o('learned to swim', '学过游泳'),
        ],
      },
      {
        key: 'tail',
        labelZh: '补充想法',
        options: [
          o("but I'd love to", '不过我很想试一试'),
          o("but I'd like to someday", '不过我希望哪天能试一试'),
          o('but I really want to', '不过我真的很想试一试'),
          o("and I don't really want to", '而且我也不太想试'),
          o("but I'm planning to", '不过我打算找机会试一试'),
        ],
      },
    ],
    grammar: ['present-perfect', 'want-to'],
    scene: 'daily',
    level: 2,
    examples: [
      o("I've never tried sushi, but I'd love to.", '我从来没有尝过寿司，不过我很想试一试。'),
      o("I've still never been to Japan, but I'm planning to.", '我至今还没有去过日本，不过我打算找机会试一试。'),
      o("I've honestly never ridden a horse, and I don't really want to.", '说实话我从来没有骑过马，而且我也不太想试。'),
    ],
    tipZh:
      "I've never + 过去分词 表示\"到现在为止从没有过\"的经历，不加具体时间。注意不规则过去分词：been、ridden、seen。结尾的 to 后面省略了重复的动词。",
    source: 'seed',
    category: 'experience',
    freq: 1,
    soundZh: 'I\'ve never → I\'ve-never；I\'d love to → I\'d-love-ta',
  },

  // ---------- f044 评价物品 ----------
  {
    id: 'f044',
    title: '评价物品',
    pattern: '{opener} {item} {adj}.',
    patternZh: '{opener}{item}{adj}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Honestly,', '说实话，'),
          o('I think', '我觉得'),
          o('Actually,', '其实'),
          o('To be honest,', '老实说，'),
        ],
      },
      {
        key: 'item',
        labelZh: '主语+be',
        options: [
          o('this jacket is', '这件夹克'),
          o('these shoes are', '这双鞋'),
          o('this bag is', '这个包'),
          o('these jeans are', '这条牛仔裤'),
          o('this coat is', '这件大衣'),
        ],
      },
      {
        key: 'adj',
        labelZh: '形容词',
        options: [
          o('too expensive', '太贵了'),
          o('a bit small', '有点小'),
          o('a little big', '有点大'),
          o('really comfortable', '挺舒服的'),
          o('pretty heavy', '挺重的'),
          o('really nice', '真不错'),
        ],
      },
    ],
    grammar: ['be-adj', 'plural'],
    scene: 'daily',
    level: 2,
    examples: [
      o('I think these shoes are a bit small.', '我觉得这双鞋有点小。'),
      o('Honestly, this jacket is too expensive.', '说实话，这件夹克太贵了。'),
      o('Actually, these jeans are really comfortable.', '其实这条牛仔裤挺舒服的。'),
    ],
    tipZh:
      'this + 单数名词用 is，these + 复数名词用 are，be 动词要和名词的单复数一致。shoes、jeans 总是复数形式，所以用 these ... are。程度词 a bit / a little 修饰形容词时，不要加 very。',
    source: 'seed',
    category: 'opinion',
    freq: 1,
  },

  // ---------- f045 有条件的计划 ----------
  {
    id: 'f045',
    title: '有条件的计划',
    pattern: '{subject} {action} {time}, as long as {condition}.',
    patternZh: '只要{condition}，{time}{subject}{action}。',
    slots: [
      {
        key: 'subject',
        labelZh: '主语+打算',
        options: [
          o("I'm going to", '我打算'),
          o("We're going to", '我们打算'),
          o("I'm probably going to", '我很可能会'),
          o("We're probably going to", '我们很可能会'),
        ],
      },
      {
        key: 'action',
        labelZh: '动作',
        options: [
          o('have a barbecue', '办烧烤'),
          o('go hiking', '去爬山'),
          o('visit my parents', '去看我父母'),
          o('go to the beach', '去海边'),
          o('go shopping', '去逛街'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('this weekend', '这个周末'),
          o('on Sunday', '周日'),
          o('next Saturday', '下周六'),
          o('tomorrow afternoon', '明天下午'),
        ],
      },
      {
        key: 'condition',
        labelZh: '条件',
        options: [
          o("it doesn't rain", '不下雨'),
          o('I feel better', '我感觉好些了'),
          o('I have enough time', '我有足够的时间'),
          o('nothing comes up', '没有别的事'),
          o('the weather stays nice', '天气一直不错'),
        ],
      },
    ],
    grammar: ['going-to'],
    scene: 'daily',
    level: 3,
    examples: [
      o("We're going to visit my parents on Sunday, as long as nothing comes up.", '只要没有别的事，周日我们打算去看我父母。'),
      o("I'm probably going to go to the beach next Saturday, as long as the weather stays nice.", '只要天气一直不错，下周六我很可能会去海边。'),
      o("I'm going to go hiking tomorrow afternoon, as long as I feel better.", '只要我感觉好些了，明天下午我打算去爬山。'),
    ],
    tipZh:
      'be going to 表示已有打算，加 probably 语气变弱。as long as 后面的条件从句用一般现在时，不要写 will。时间可以放在 as long as 之前。',
    source: 'seed',
    category: 'plan',
    freq: 3,
    soundZh: 'going to → gonna；as long as → as-long-az',
  },

  // ---------- f046 说别人的习惯 ----------
  {
    id: 'f046',
    title: '描述别人的习惯',
    pattern: '{opener} {who} {habit}, which {comment}.',
    patternZh: '{opener}{who}{habit}，{comment}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Actually,', '其实'),
          o('You know,', '你知道吗，'),
          o('Honestly,', '说实话，'),
          o('Well,', '嗯，'),
        ],
      },
      {
        key: 'who',
        labelZh: '某人（单数）',
        options: [
          o('my roommate', '我室友'),
          o('my brother', '我哥哥'),
          o('my neighbor', '我邻居'),
          o('my boss', '我老板'),
          o('my sister', '我姐姐'),
        ],
      },
      {
        key: 'habit',
        labelZh: '习惯（动词加-s）',
        options: [
          o('gets up at five every day', '每天五点起床'),
          o('works out before breakfast', '早饭前锻炼'),
          o('walks to work every morning', '每天早上走路上班'),
          o('cooks dinner every night', '每天晚上做晚饭'),
          o('calls home every weekend', '每个周末给家里打电话'),
        ],
      },
      {
        key: 'comment',
        labelZh: '感想',
        options: [
          o('I really admire', '这点我真的很佩服'),
          o('sometimes drives me crazy', '这有时让我很抓狂'),
          o('I think is great', '我觉得这很棒'),
          o('I find hard to believe', '我觉得这难以置信'),
        ],
      },
    ],
    grammar: ['third-person-s'],
    scene: 'daily',
    level: 3,
    examples: [
      o('Actually, my neighbor cooks dinner every night, which I really admire.', '其实我邻居每天晚上做晚饭，这点我真的很佩服。'),
      o('You know, my boss gets up at five every day, which I find hard to believe.', '你知道吗，我老板每天五点起床，我觉得这难以置信。'),
      o('Honestly, my roommate works out before breakfast, which sometimes drives me crazy.', '说实话，我室友早饭前锻炼，这有时让我很抓狂。'),
    ],
    tipZh:
      '主语是 he / she / my boss 这样的第三人称单数时，一般现在时的动词要加 -s（gets、works、cooks）。which 指代前面整件事，后面可以接评论。',
    source: 'seed',
    category: 'social',
    freq: 3,
  },

  // =====================================================================
  // TRAVEL
  // =====================================================================

  // ---------- f047 问路 ----------
  {
    id: 'f047',
    title: '问路',
    pattern: '{opener} how can I get to {place} {mode}?',
    patternZh: '{opener}{mode}怎么去{place}？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '不好意思，'),
          o('Sorry to bother you,', '打扰一下，'),
          o('Hi,', '你好，'),
          o('Pardon me,', '劳驾，'),
        ],
      },
      {
        key: 'place',
        labelZh: '目的地',
        options: [
          o('the train station', '火车站'),
          o('the airport', '机场'),
          o('the city center', '市中心'),
          o('the museum', '博物馆'),
          o('this address', '这个地址'),
        ],
      },
      {
        key: 'mode',
        labelZh: '方式',
        options: [
          o('from here', '从这里'),
          o('by bus', '坐公交'),
          o('on foot', '步行'),
          o('by taxi', '打车'),
          o('by subway', '坐地铁'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'travel',
    level: 1,
    examples: [
      o('Excuse me, how can I get to the museum from here?', '不好意思，从这里怎么去博物馆？'),
      o('Pardon me, how can I get to the airport by subway?', '劳驾，坐地铁怎么去机场？'),
      o('Hi, how can I get to this address on foot?', '你好，步行怎么去这个地址？'),
    ],
    tipZh:
      '问路先用 Excuse me 引起注意。how can I get to + 地点 是万能问法；交通方式用 by + 无冠词的交通工具（by bus），走路是 on foot。',
    source: 'seed',
    category: 'travel',
    freq: 1,
    soundZh: 'How can I → How-can-nai；get to → get-ta',
  },

  // ---------- f048 前台请求 ----------
  {
    id: 'f048',
    title: '向前台提要求',
    pattern: "{opener} I'd like to {action}, {tail}.",
    patternZh: '{opener}我想{action}，{tail}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Hi,', '你好，'),
          o('Hello,', '您好，'),
          o('Good morning,', '早上好，'),
          o('Excuse me,', '打扰一下，'),
        ],
      },
      {
        key: 'action',
        labelZh: '想做的事',
        options: [
          o('check in early', '提前入住'),
          o('check out late', '晚点退房'),
          o('extend my stay by one night', '多住一晚'),
          o('change my room', '换个房间'),
          o('book a taxi for tomorrow morning', '订一辆明天早上的出租车'),
        ],
      },
      {
        key: 'tail',
        labelZh: '客气话',
        options: [
          o('please', '麻烦你了'),
          o('if possible', '如果可以的话'),
          o("if that's OK with you", '如果你同意的话'),
          o("if that's not too much trouble", '如果不太麻烦的话'),
        ],
      },
    ],
    grammar: ['want-to'],
    scene: 'travel',
    level: 1,
    examples: [
      o("Good morning, I'd like to check out late, if possible.", '早上好，我想晚点退房，如果可以的话。'),
      o("Hi, I'd like to change my room, please.", '你好，我想换个房间，麻烦你了。'),
      o("Excuse me, I'd like to book a taxi for tomorrow morning, if that's OK with you.", '打扰一下，我想订一辆明天早上的出租车，如果你同意的话。'),
    ],
    tipZh:
      "I'd like to 比 I want to 礼貌得多，酒店、餐厅、柜台都适用，后面接动词原形。句尾加 please 或 if possible 能让语气更柔和。",
    source: 'seed',
    category: 'travel',
    freq: 2,
    soundZh: 'I\'d like to → I\'d like-ta',
  },

  // ---------- f049 买东西问货 ----------
  {
    id: 'f049',
    title: '购物问货',
    pattern: '{opener} do you have {item} in {variant} {tail}?',
    patternZh: '{opener}{item}你们{tail}有{variant}的吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '不好意思，'),
          o('Hi,', '你好，'),
          o('Sorry,', '抱歉，'),
          o('Hello,', '您好，'),
        ],
      },
      {
        key: 'item',
        labelZh: '商品（this/these）',
        options: [
          o('this jacket', '这件夹克'),
          o('these shoes', '这双鞋'),
          o('this shirt', '这件衬衫'),
          o('those jeans', '那条牛仔裤'),
        ],
      },
      {
        key: 'variant',
        labelZh: '尺码/颜色',
        options: [
          o('a bigger size', '大一号'),
          o('a smaller size', '小一号'),
          o('a different color', '别的颜色'),
          o('black', '黑色'),
          o('white', '白色'),
        ],
      },
      {
        key: 'tail',
        labelZh: '补充',
        options: [
          o('by any chance', '碰巧'),
          o('right now', '现在'),
          o('at the moment', '目前'),
          o('here', '这里'),
        ],
      },
    ],
    grammar: ['question-inversion', 'plural'],
    scene: 'travel',
    level: 2,
    examples: [
      o('Excuse me, do you have these shoes in a bigger size by any chance?', '不好意思，这双鞋你们碰巧有大一号的吗？'),
      o('Hi, do you have this shirt in black right now?', '你好，这件衬衫你们现在有黑色的吗？'),
      o('Sorry, do you have those jeans in a different color here?', '抱歉，那条牛仔裤你们这里有别的颜色的吗？'),
    ],
    tipZh:
      "指示词要和商品的单复数一致：this jacket / these shoes。鞋、裤子这类成对的东西在英语里是复数（shoes、jeans）。问尺码用 in a bigger size，问颜色直接 in black。",
    source: 'seed',
    category: 'travel',
    freq: 2,
    soundZh: 'Do you have → Dya have；by any chance → by-any-chance（连读）',
  },

  // ---------- f050 反映问题 ----------
  {
    id: 'f050',
    title: '反映问题',
    pattern: "{opener} I think there's a problem with {thing}. Could you {request}?",
    patternZh: '{opener}我觉得{thing}有问题。你能{request}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '不好意思，'),
          o('Sorry,', '抱歉，'),
          o('Hi,', '你好，'),
          o('Hello,', '您好，'),
        ],
      },
      {
        key: 'thing',
        labelZh: '有问题的东西',
        options: [
          o('my room', '我的房间'),
          o('my order', '我点的菜'),
          o('the air conditioning', '空调'),
          o('my booking', '我的预订'),
          o('the bill', '账单'),
        ],
      },
      {
        key: 'request',
        labelZh: '请求',
        options: [
          o('take a look at it', '看一下'),
          o('check it for me', '帮我查一下'),
          o('help me sort it out', '帮我解决一下'),
          o('talk to the manager about it', '和经理说一下'),
        ],
      },
    ],
    grammar: ['question-inversion', 'object-pronoun'],
    scene: 'travel',
    level: 2,
    examples: [
      o("Excuse me, I think there's a problem with my order. Could you check it for me?", '不好意思，我觉得我点的菜有问题。你能帮我查一下吗？'),
      o("Hi, I think there's a problem with the air conditioning. Could you talk to the manager about it?", '你好，我觉得空调有问题。你能和经理说一下吗？'),
      o("Sorry, I think there's a problem with the bill. Could you take a look at it?", '抱歉，我觉得账单有问题。你能看一下吗？'),
    ],
    tipZh:
      "先用 I think there's a problem with... 客观地说出问题，不要直接指责对方，再用 Could you... 提出请求。it 指代前面提到的东西，me 是宾格，不能写成 I。",
    source: 'seed',
    category: 'problem',
    freq: 1,
    soundZh: 'there\'s a → there-za；Could you → Couldja',
  },

  // ---------- f051 间接询问 ----------
  {
    id: 'f051',
    title: '礼貌地打听信息',
    pattern: '{opener} {situation}, so could you tell me {question}?',
    patternZh: '{opener}{situation}，你能告诉我{question}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '不好意思，'),
          o('Hi,', '你好，'),
          o('Sorry to bother you,', '打扰一下，'),
          o('Pardon me,', '劳驾，'),
        ],
      },
      {
        key: 'situation',
        labelZh: '自己的情况',
        options: [
          o("I'm new here", '我刚来这里'),
          o("I'm a bit lost", '我有点迷路了'),
          o("I'm in a hurry", '我很赶时间'),
          o("I'm just visiting", '我只是来旅游的'),
          o("I'm running late", '我快迟到了'),
        ],
      },
      {
        key: 'question',
        labelZh: '想问的问题',
        options: [
          o('what time the museum opens', '博物馆几点开门'),
          o('where I can buy a ticket', '我在哪里可以买票'),
          o('how much the ticket costs', '票多少钱'),
          o('which platform the train leaves from', '火车从哪个站台出发'),
          o('how long it takes to get there', '到那里要多长时间'),
        ],
      },
    ],
    grammar: ['question-inversion', 'be-adj'],
    scene: 'travel',
    level: 3,
    examples: [
      o("Excuse me, I'm a bit lost, so could you tell me where I can buy a ticket?", '不好意思，我有点迷路了，你能告诉我我在哪里可以买票吗？'),
      o("Hi, I'm in a hurry, so could you tell me which platform the train leaves from?", '你好，我很赶时间，你能告诉我火车从哪个站台出发吗？'),
      o("Pardon me, I'm just visiting, so could you tell me what time the museum opens?", '劳驾，我只是来旅游的，你能告诉我博物馆几点开门吗？'),
    ],
    tipZh:
      '嵌入式问句里不再倒装：说 where I can buy a ticket，不说 where can I buy a ticket。只有外层的 Could you 才倒装。先说明自己的处境，对方更愿意帮忙。',
    source: 'seed',
    category: 'question',
    freq: 2,
    soundZh: 'Could you tell me → Couldja tell me',
  },

  // =====================================================================
  // SOCIAL
  // =====================================================================

  // ---------- f052 问经历 ----------
  {
    id: 'f052',
    title: '问对方的经历',
    pattern: '{opener} have you ever {experience} {tail}?',
    patternZh: '{opener}你{tail}{experience}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('By the way,', '对了，'),
          o('Hey,', '嘿，'),
          o('So,', '那，'),
          o('Out of curiosity,', '我有点好奇，'),
        ],
      },
      {
        key: 'experience',
        labelZh: '经历（过去分词）',
        options: [
          o('been to Japan', '去过日本'),
          o('tried Thai food', '吃过泰国菜'),
          o('met a famous person', '见过名人'),
          o('ridden a horse', '骑过马'),
          o('lived abroad', '在国外生活过'),
          o('seen the northern lights', '看过北极光'),
        ],
      },
      {
        key: 'tail',
        labelZh: '补充',
        options: [
          o('before', '以前'),
          o('in your life', '这辈子'),
          o('by any chance', '碰巧'),
        ],
      },
    ],
    grammar: ['present-perfect', 'question-inversion'],
    scene: 'social',
    level: 1,
    examples: [
      o('By the way, have you ever been to Japan before?', '对了，你以前去过日本吗？'),
      o('Hey, have you ever met a famous person in your life?', '嘿，你这辈子见过名人吗？'),
      o('Out of curiosity, have you ever seen the northern lights by any chance?', '我有点好奇，你碰巧看过北极光吗？'),
    ],
    tipZh:
      'Have you ever + 过去分词? 是聊天破冰的经典问法，问的是\"有没有这种经历\"，不说具体时间。回答用 Yes, I have. / No, never. 追问细节时才改用一般过去时。',
    source: 'seed',
    category: 'experience',
    freq: 1,
    soundZh: 'Have you ever → Havya-ever',
  },

  // ---------- f053 发出邀请 ----------
  {
    id: 'f053',
    title: '发出邀请',
    pattern: '{opener} do you want to {action} {time}?',
    patternZh: '{opener}{time}想不想{action}？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Hey,', '嘿，'),
          o('So,', '那，'),
          o('Hi,', '嗨，'),
          o('By the way,', '对了，'),
        ],
      },
      {
        key: 'action',
        labelZh: '活动',
        options: [
          o('grab a bite', '吃点东西'),
          o('get a coffee', '喝杯咖啡'),
          o('go for a walk', '出去走走'),
          o('watch a movie', '看场电影'),
          o('hang out', '一起玩'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('tomorrow', '明天'),
          o('this weekend', '这个周末'),
          o('sometime next week', '下周找个时间'),
          o('after work', '下班后'),
          o('on Friday', '周五'),
        ],
      },
    ],
    grammar: ['want-to', 'question-inversion'],
    scene: 'social',
    level: 1,
    examples: [
      o('Hey, do you want to grab a bite after work?', '嘿，下班后想不想吃点东西？'),
      o('So, do you want to watch a movie this weekend?', '那，这个周末想不想看场电影？'),
      o('Hi, do you want to hang out sometime next week?', '嗨，下周找个时间想不想一起玩？'),
    ],
    tipZh:
      'Do you want to...? 是朋友间最自然的邀请。比它更随意的是 Wanna...?，更礼貌的是 Would you like to...?。助动词 do 放在主语 you 之前，want 后面的动词用原形。',
    source: 'seed',
    category: 'offer',
    freq: 1,
    soundZh: 'Do you want to → Dya wanna',
  },

  // ---------- f054 一直想做的事 ----------
  {
    id: 'f054',
    title: '分享一直想做的事',
    pattern: "{opener} I've always wanted to {action}, {tail}.",
    patternZh: '{opener}我一直想{action}，{tail}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Wow,', '哇，'),
          o('Oh really,', '真的吗，'),
          o('Me too,', '我也是，'),
          o('Honestly,', '说实话，'),
        ],
      },
      {
        key: 'action',
        labelZh: '想做的事',
        options: [
          o('visit Japan', '去日本看看'),
          o('learn to play the guitar', '学弹吉他'),
          o('run a marathon', '跑一次马拉松'),
          o('start my own business', '自己创业'),
          o('live by the sea', '住在海边'),
        ],
      },
      {
        key: 'tail',
        labelZh: '后续',
        options: [
          o("but I've never had the chance", '但是一直没有机会'),
          o("but I've never found the time", '但是一直没有时间'),
          o("but I've never been able to", '但是一直没能做到'),
          o("and this year I'm finally going to", '而且今年我终于打算去做了'),
        ],
      },
    ],
    grammar: ['present-perfect', 'want-to', 'going-to'],
    scene: 'social',
    level: 2,
    examples: [
      o("Me too, I've always wanted to learn to play the guitar, but I've never found the time.", '我也是，我一直想学弹吉他，但是一直没有时间。'),
      o("Wow, I've always wanted to run a marathon, and this year I'm finally going to.", '哇，我一直想跑一次马拉松，而且今年我终于打算去做了。'),
      o("Honestly, I've always wanted to live by the sea, but I've never had the chance.", '说实话，我一直想住在海边，但是一直没有机会。'),
    ],
    tipZh:
      "I've always wanted to + 动词原形，用现在完成时表示\"从以前一直到现在都想\"。后半句常用 but I've never... 说明还没实现的原因。",
    source: 'seed',
    category: 'feeling',
    freq: 2,
    soundZh: 'I\'ve always wanted to → I\'ve always wanted-ta',
  },

  // ---------- f055 婉拒邀请 ----------
  {
    id: 'f055',
    title: '婉拒邀请',
    pattern: "{opener} I can't make it to {owner}'s {event} {time}, because {reason}.",
    patternZh: '{opener}{time}我没办法参加{owner}的{event}，因为{reason}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o("I'm really sorry, but", '真的很抱歉，不过'),
          o('Thanks for the invitation, but', '谢谢邀请，不过'),
          o("I'd love to, but", '我很想去，不过'),
          o('Unfortunately,', '很遗憾，'),
        ],
      },
      {
        key: 'owner',
        labelZh: '主人',
        options: [
          o('Anna', '安娜'),
          o('Tom', '汤姆'),
          o('my boss', '我老板'),
          o('my friend', '我朋友'),
          o('my brother', '我哥哥'),
        ],
      },
      {
        key: 'event',
        labelZh: '活动',
        options: [
          o('party', '派对'),
          o('wedding', '婚礼'),
          o('birthday dinner', '生日晚宴'),
          o('housewarming', '乔迁派对'),
          o('farewell party', '欢送会'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('this Friday', '这个周五'),
          o('on Saturday', '周六'),
          o('tomorrow night', '明晚'),
          o('next weekend', '下个周末'),
        ],
      },
      {
        key: 'reason',
        labelZh: '理由',
        options: [
          o('I have to work late', '我得加班'),
          o('I already have plans', '我已经有安排了'),
          o("I'm visiting my parents", '我要去看我父母'),
          o('I have an early flight', '我有一趟早班飞机'),
        ],
      },
    ],
    grammar: ['negation-modal', 'possessive'],
    scene: 'social',
    level: 2,
    examples: [
      o("Unfortunately, I can't make it to Anna's wedding tomorrow night, because I have an early flight.", '很遗憾，明晚我没办法参加安娜的婚礼，因为我有一趟早班飞机。'),
      o("I'd love to, but I can't make it to my boss's farewell party this Friday, because I have to work late.", '我很想去，不过这个周五我没办法参加我老板的欢送会，因为我得加班。'),
      o("Thanks for the invitation, but I can't make it to Tom's housewarming on Saturday, because I'm visiting my parents.", '谢谢邀请，不过周六我没办法参加汤姆的乔迁派对，因为我要去看我父母。'),
    ],
    tipZh:
      "拒绝邀请的公式：先感谢或表示遗憾，再说 I can't make it，最后简短给出理由。can't 后面接动词原形；owner's 表示\"某人的\"活动，名字或名词后加 's。",
    source: 'seed',
    category: 'offer',
    freq: 2,
    soundZh: 'can\'t make it → can\'t-make-it（make it 连读成 makit）',
  },

  // ---------- f056 转述别人的看法 ----------
  {
    id: 'f056',
    title: '转述别人的看法',
    pattern: '{opener} {who} {verb} that {clause}.',
    patternZh: '{opener}{who}{verb}{clause}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Apparently,', '听说'),
          o('Actually,', '其实'),
          o('By the way,', '对了，'),
          o('Well,', '嗯，'),
        ],
      },
      {
        key: 'who',
        labelZh: '某人（单数）',
        options: [
          o('my friend', '我朋友'),
          o('my sister', '我姐姐'),
          o('my colleague', '我同事'),
          o('my neighbor', '我邻居'),
        ],
      },
      {
        key: 'verb',
        labelZh: '动词（加-s）',
        options: [
          o('said', '说'),
          o('told me', '告诉我'),
          o('mentioned', '提到'),
          o('thinks', '认为'),
          o('insists', '坚持说'),
        ],
      },
      {
        key: 'clause',
        labelZh: '内容',
        options: [
          o('this restaurant is really good', '这家餐厅真的很棒'),
          o("it's going to rain tomorrow", '明天会下雨'),
          o('we should leave early', '我们应该早点出发'),
          o('the movie starts at eight', '电影八点开始'),
        ],
      },
    ],
    grammar: ['third-person-s'],
    scene: 'social',
    level: 3,
    examples: [
      o("Apparently, my neighbor thinks that we should leave early.", '听说我邻居认为我们应该早点出发。'),
      o("By the way, my friend mentioned that it's going to rain tomorrow.", '对了，我朋友提到明天会下雨。'),
      o('Well, my sister told me that this restaurant is really good.', '嗯，我姐姐告诉我这家餐厅真的很棒。'),
    ],
    tipZh:
      "转述一次具体的话用过去式（said / told me / mentioned）；转述对方一贯的看法用一般现在时，第三人称单数动词要加 -s（my friend thinks）。口语里不必严格改时态，that 也常可省略。",
    source: 'seed',
    category: 'social',
    freq: 3,
  },

  // =====================================================================
  // STUDY
  // =====================================================================

  // ---------- f057 请教怎么说 ----------
  {
    id: 'f057',
    title: '请教怎么说',
    pattern: '{opener} how do you {verb} {thing} in English?',
    patternZh: '{opener}{thing}用英语怎么{verb}？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '打扰一下，'),
          o('Sorry,', '抱歉，'),
          o('Teacher,', '老师，'),
          o('Quick question,', '问一下，'),
        ],
      },
      {
        key: 'verb',
        labelZh: '动作',
        options: [
          o('say', '说'),
          o('spell', '拼'),
          o('pronounce', '读'),
        ],
      },
      {
        key: 'thing',
        labelZh: '对象',
        options: [
          o('this word', '这个词'),
          o('that word', '那个词'),
          o('this phrase', '这个短语'),
          o('this expression', '这个表达'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'study',
    level: 1,
    examples: [
      o('Excuse me, how do you say this word in English?', '打扰一下，这个词用英语怎么说？'),
      o('Teacher, how do you spell that word in English?', '老师，那个词用英语怎么拼？'),
      o('Quick question, how do you pronounce this phrase in English?', '问一下，这个短语用英语怎么读？'),
    ],
    tipZh:
      'How do you say X in English? 是学英语最有用的一句，无论词汇多少都能靠它继续对话。how 后面用 do you 倒装，动词用原形。',
    source: 'seed',
    category: 'question',
    freq: 1,
    soundZh: 'how do you → how-d\'ya',
  },

  // ---------- f058 学习目标 ----------
  {
    id: 'f058',
    title: '说明学习目标',
    pattern: '{subject} improve {skill} by {method}.',
    patternZh: '{subject}{method}来提高{skill}。',
    slots: [
      {
        key: 'subject',
        labelZh: '主语+想要',
        options: [
          o("I'm trying to", '我正在努力'),
          o('I want to', '我想'),
          o("I'm hoping to", '我希望'),
          o('I need to', '我需要'),
        ],
      },
      {
        key: 'skill',
        labelZh: '技能',
        options: [
          o('my English', '英语水平'),
          o('my speaking', '口语'),
          o('my vocabulary', '词汇量'),
          o('my pronunciation', '发音'),
        ],
      },
      {
        key: 'method',
        labelZh: '方法（-ing）',
        options: [
          o('practicing every day', '通过每天练习'),
          o('talking to native speakers', '通过和母语者交流'),
          o('taking an online class', '通过上网课'),
          o('studying with a partner', '通过和搭档一起学习'),
        ],
      },
    ],
    grammar: ['want-to'],
    scene: 'study',
    level: 2,
    examples: [
      o('I want to improve my speaking by taking an online class.', '我想通过上网课来提高口语。'),
      o("I'm trying to improve my vocabulary by practicing every day.", '我正在努力通过每天练习来提高词汇量。'),
      o("I'm hoping to improve my pronunciation by talking to native speakers.", '我希望通过和母语者交流来提高发音。'),
    ],
    tipZh:
      "want to / need to / hope to 后面接动词原形；by 是介词，后面必须接 -ing 形式（by practicing），不能接原形。",
    source: 'seed',
    category: 'plan',
    freq: 2,
    soundZh: 'want to → wanna；trying to → tryin\'-ta',
  },

  // ---------- f059 倾诉学习困难 ----------
  {
    id: 'f059',
    title: '倾诉学习困难',
    pattern: "{opener} I've been studying {language} for {duration}, but I still {problem}.",
    patternZh: '{opener}我学{language}已经{duration}了，但我还是{problem}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Honestly,', '说实话，'),
          o('The thing is,', '问题是，'),
          o('To be honest,', '老实说，'),
          o('Well,', '嗯，'),
        ],
      },
      {
        key: 'language',
        labelZh: '语言',
        options: [
          o('English', '英语'),
          o('Spanish', '西班牙语'),
          o('Japanese', '日语'),
          o('French', '法语'),
        ],
      },
      {
        key: 'duration',
        labelZh: '时长',
        options: [
          o('two years', '两年'),
          o('six months', '半年'),
          o('a long time', '很长时间'),
          o('about three weeks', '三周左右'),
        ],
      },
      {
        key: 'problem',
        labelZh: '问题',
        options: [
          o("can't follow fast speech", '跟不上快速的对话'),
          o('make a lot of mistakes', '会犯很多错误'),
          o('get nervous when I speak', '一说话就紧张'),
          o('find grammar difficult', '觉得语法很难'),
          o('forget new words quickly', '很快就忘记新单词'),
        ],
      },
    ],
    grammar: ['present-perfect'],
    scene: 'study',
    level: 3,
    examples: [
      o("Honestly, I've been studying Spanish for two years, but I still can't follow fast speech.", '说实话，我学西班牙语已经两年了，但我还是跟不上快速的对话。'),
      o("The thing is, I've been studying English for a long time, but I still get nervous when I speak.", '问题是，我学英语已经很长时间了，但我还是一说话就紧张。'),
      o("To be honest, I've been studying French for about three weeks, but I still forget new words quickly.", '老实说，我学法语已经三周左右了，但我还是很快就忘记新单词。'),
    ],
    tipZh:
      "I've been studying ... for + 一段时间，表示从过去持续到现在的动作；for 后面接时间长度（two years），since 后面才接起点。still 放在主语之后、动词之前。",
    source: 'seed',
    category: 'problem',
    freq: 2,
    soundZh: 'I\'ve been → I\'ve-bin（been 弱读）',
  },

  // ---------- f060 向老师求助 ----------
  {
    id: 'f060',
    title: '向老师求助',
    pattern: "{opener} I'm having trouble with {topic} because {reason}. Could you {request}?",
    patternZh: '{opener}我在{topic}上遇到了困难，因为{reason}。你能{request}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Sorry,', '抱歉，'),
          o('Excuse me,', '打扰一下，'),
          o('Teacher,', '老师，'),
          o('Honestly,', '说实话，'),
        ],
      },
      {
        key: 'topic',
        labelZh: '困难的内容',
        options: [
          o('the past tense', '过去时'),
          o('phrasal verbs', '短语动词'),
          o('word order in questions', '疑问句的语序'),
          o('the new vocabulary', '新词汇'),
          o('this exercise', '这个练习'),
        ],
      },
      {
        key: 'reason',
        labelZh: '原因',
        options: [
          o('I keep making the same mistakes', '我总是犯同样的错误'),
          o('I can never remember the rules', '我总是记不住规则'),
          o("I don't get enough practice", '我练习得不够'),
          o('I get confused easily', '我很容易搞混'),
        ],
      },
      {
        key: 'request',
        labelZh: '请求',
        options: [
          o('explain that again', '再解释一遍'),
          o('give me an example', '给我举个例子'),
          o('give me some tips', '给我一些建议'),
          o('help me practice', '带我练一练'),
        ],
      },
    ],
    grammar: ['double-object', 'object-pronoun'],
    scene: 'study',
    level: 3,
    examples: [
      o("Teacher, I'm having trouble with the past tense because I don't get enough practice. Could you give me some tips?", '老师，我在过去时上遇到了困难，因为我练习得不够。你能给我一些建议吗？'),
      o("Sorry, I'm having trouble with this exercise because I get confused easily. Could you explain that again?", '抱歉，我在这个练习上遇到了困难，因为我很容易搞混。你能再解释一遍吗？'),
      o("Honestly, I'm having trouble with phrasal verbs because I keep making the same mistakes. Could you give me an example?", '说实话，我在短语动词上遇到了困难，因为我总是犯同样的错误。你能给我举个例子吗？'),
    ],
    tipZh:
      'have trouble with + 名词 表示\"在……上有困难\"。give me an example 是双宾语结构：先说人（me），再说东西（an example）；人是代词时要用宾格 me，不能用 I。',
    source: 'seed',
    category: 'request',
    freq: 2,
    soundZh: 'Could you → Couldja',
  },
];
