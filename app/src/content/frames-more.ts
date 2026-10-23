import type { SlotOption, SubstitutionFrame } from '../types';

/**
 * More everyday spoken-English Palmer substitution tables (母框), f061-f100:
 * daily 14 (f061-f074), work 10 (f075-f084), travel 7 (f085-f091),
 * social 6 (f092-f097), study 3 (f098-f100).
 *
 * HARD RULE: every combination of one option per slot is grammatical, natural English
 * and reads acceptably in Chinese. Agreement is kept safe by putting the inflected
 * verb / contraction (I'm, we're, she's ...) inside the same slot as its subject, and
 * by only offering objects, times and reasons that fit every verb in the table.
 */
const o = (en: string, zh: string): SlotOption => ({ en, zh });

export const FRAMES_MORE: SubstitutionFrame[] = [
  // =====================================================================
  // DAILY
  // =====================================================================

  // ---------- f061 表达心情 ----------
  {
    id: 'f061',
    title: '表达心情',
    pattern: '{subject} {degree} {feeling} about {thing}.',
    patternZh: '{subject}对{thing}{degree}{feeling}。',
    slots: [
      {
        key: 'subject',
        labelZh: '主语+be',
        options: [
          o("I'm", '我'),
          o("We're", '我们'),
          o("She's", '她'),
          o("He's", '他'),
          o("They're", '他们'),
        ],
      },
      {
        key: 'degree',
        labelZh: '程度词',
        options: [
          o('so', '特别'),
          o('really', '真的很'),
          o('a bit', '有点'),
          o('pretty', '挺'),
        ],
      },
      {
        key: 'feeling',
        labelZh: '心情',
        options: [
          o('excited', '兴奋'),
          o('nervous', '紧张'),
          o('worried', '担心'),
          o('happy', '高兴'),
          o('upset', '难过'),
        ],
      },
      {
        key: 'thing',
        labelZh: '原因',
        options: [
          o('the interview', '这次面试'),
          o('the results', '结果'),
          o('the move', '搬家'),
          o('the trip', '这次旅行'),
          o('the weekend', '周末'),
        ],
      },
    ],
    grammar: ['be-adj'],
    scene: 'daily',
    level: 1,
    examples: [
      o("I'm so nervous about the interview.", '我对这次面试特别紧张。'),
      o("We're pretty excited about the trip.", '我们对这次旅行挺兴奋。'),
      o("She's a bit worried about the results.", '她对结果有点担心。'),
    ],
    tipZh:
      '表达心情用 be + 形容词 + about + 引起心情的事。be 动词不能省（不能说 I so nervous），程度词 so / really / a bit / pretty 放在形容词前面。',
    source: 'seed',
  },

  // ---------- f062 说明原因 ----------
  {
    id: 'f062',
    title: '说明原因',
    pattern: '{opener} {action} because {reason}.',
    patternZh: '{opener}{action}，因为{reason}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Sorry,', '抱歉，'),
          o('Honestly,', '说实话，'),
          o('To be honest,', '老实说，'),
          o('Well,', '嗯，'),
        ],
      },
      {
        key: 'action',
        labelZh: '做了什么',
        options: [
          o('I left early', '我提前走了'),
          o('I took a taxi', '我打车了'),
          o('I stayed in', '我待在家里了'),
          o('I skipped the gym', '我没去健身房'),
        ],
      },
      {
        key: 'reason',
        labelZh: '原因',
        options: [
          o('I was exhausted', '我累坏了'),
          o('it was freezing outside', '外面冷得要命'),
          o('the weather was awful', '天气太糟了'),
          o("I wasn't feeling well", '我觉得不舒服'),
        ],
      },
    ],
    grammar: ['be-adj'],
    scene: 'daily',
    level: 1,
    examples: [
      o('Sorry, I left early because I was exhausted.', '抱歉，我提前走了，因为我累坏了。'),
      o('Honestly, I took a taxi because the weather was awful.', '说实话，我打车了，因为天气太糟了。'),
      o("Well, I skipped the gym because I wasn't feeling well.", '嗯，我没去健身房，因为我觉得不舒服。'),
    ],
    tipZh:
      '先说结果，再用 because 说原因：结果 + because + 完整的句子（主语 + 动词）。不要像中文那样把 because 后面的句子省掉主语。',
    source: 'seed',
  },

  // ---------- f063 问对方过去做过什么 ----------
  {
    id: 'f063',
    title: '问对方过去做过什么',
    pattern: '{opener} did you {action} {time}?',
    patternZh: '{opener}你{time}{action}了吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('So,', '那，'),
          o('Hey,', '嘿，'),
          o('By the way,', '对了，'),
          o('Oh,', '哎，'),
        ],
      },
      {
        key: 'action',
        labelZh: '动作',
        options: [
          o('watch the match', '看比赛'),
          o('go to the gym', '去健身房'),
          o('finish the book', '读完那本书'),
          o('call your mom', '给你妈妈打电话'),
          o('see the doctor', '去看医生'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('yesterday', '昨天'),
          o('last night', '昨晚'),
          o('last weekend', '上周末'),
          o('on Sunday', '周日'),
          o('this morning', '今天早上'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'daily',
    level: 1,
    examples: [
      o('So, did you watch the match yesterday?', '那，你昨天看比赛了吗？'),
      o('By the way, did you call your mom this morning?', '对了，你今天早上给你妈妈打电话了吗？'),
      o('Hey, did you go to the gym on Sunday?', '嘿，你周日去健身房了吗？'),
    ],
    tipZh:
      '问过去的事用 Did you + 动词原形：Did you go，不是 Did you went。时间词 yesterday / last night 等放在句尾，且要用过去的时间，不能和 have 连用。',
    source: 'seed',
  },

  // ---------- f064 主动提出帮忙 ----------
  {
    id: 'f064',
    title: '主动提出帮忙',
    pattern: '{offer} {action} {tail}?',
    patternZh: '{offer}{tail}{action}吗？',
    slots: [
      {
        key: 'offer',
        labelZh: '提议句头',
        options: [
          o('Would you like me to', '你想让我'),
          o('Do you want me to', '你要我'),
          o('Do you need me to', '需要我'),
          o('Can I', '我可以'),
        ],
      },
      {
        key: 'action',
        labelZh: '动作',
        options: [
          o('carry that', '拿那个'),
          o('open the window', '把窗户打开'),
          o('call a taxi', '叫辆出租车'),
          o('make some coffee', '煮点咖啡'),
          o('turn the heat up', '把暖气调高'),
        ],
      },
      {
        key: 'tail',
        labelZh: '时间或对象',
        options: [
          o('for you', '替你'),
          o('right now', '现在'),
          o('before you go', '在你走之前'),
          o('later', '待会儿'),
        ],
      },
    ],
    grammar: ['question-inversion', 'object-pronoun'],
    scene: 'daily',
    level: 1,
    examples: [
      o('Would you like me to carry that for you?', '你想让我替你拿那个吗？'),
      o('Do you need me to call a taxi before you go?', '需要我在你走之前叫辆出租车吗？'),
      o('Can I turn the heat up later?', '我可以待会儿把暖气调高吗？'),
    ],
    tipZh:
      'Would you like me to / Do you want me to 后面接动词原形（不加 to）：Would you like me to call a taxi? 主动帮忙时用这几个句头最自然，Can I 更随意。',
    source: 'seed',
  },

  // ---------- f065 点餐 ----------
  {
    id: 'f065',
    title: '点餐',
    pattern: '{starter} {main} and {drink}, {tail}?',
    patternZh: '{starter}{main}和{drink}，{tail}。',
    slots: [
      {
        key: 'starter',
        labelZh: '点餐句头',
        options: [
          o('Can I have', '我想点'),
          o('Could I have', '我想要'),
          o('Can I get', '我要点'),
          o('Could I get', '我想来'),
        ],
      },
      {
        key: 'main',
        labelZh: '主食',
        options: [
          o('the burger', '汉堡'),
          o('the grilled chicken', '烤鸡'),
          o('the pasta', '意面'),
          o('the soup of the day', '今日例汤'),
          o('the veggie wrap', '蔬菜卷饼'),
        ],
      },
      {
        key: 'drink',
        labelZh: '饮料',
        options: [
          o('a coffee', '一杯咖啡'),
          o('an iced tea', '一杯冰茶'),
          o('a glass of water', '一杯水'),
          o('an orange juice', '一杯橙汁'),
          o('a cola', '一杯可乐'),
        ],
      },
      {
        key: 'tail',
        labelZh: '收尾',
        options: [
          o('please', '麻烦了'),
          o('to go', '外带'),
          o('for here', '在这里吃'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'daily',
    level: 1,
    examples: [
      o('Can I have the burger and a cola, to go?', '我想点汉堡和一杯可乐，外带。'),
      o('Could I have the pasta and an iced tea, please?', '我想要意面和一杯冰茶，麻烦了。'),
      o('Could I get the soup of the day and a glass of water, for here?', '我想来今日例汤和一杯水，在这里吃。'),
    ],
    tipZh:
      'Can I have / Could I get 是点餐万能开头，比 I want 礼貌得多。to go 是外带（英国多说 to take away），for here 是堂食。饮料前别忘了 a / an。',
    source: 'seed',
  },

  // ---------- f066 说明会需要什么 ----------
  {
    id: 'f066',
    title: '说明会需要什么',
    pattern: '{subject} need {thing} for {event}.',
    patternZh: '为了{event}，{subject}需要{thing}。',
    slots: [
      {
        key: 'subject',
        labelZh: '主语+将来',
        options: [
          o("I'm going to", '我会'),
          o("We're going to", '我们会'),
          o("You're going to", '你会'),
          o("I'm probably going to", '我很可能会'),
        ],
      },
      {
        key: 'thing',
        labelZh: '需要的东西',
        options: [
          o('a haircut', '剪个头发'),
          o('a new outfit', '一套新衣服'),
          o("a good night's sleep", '好好睡一觉'),
          o('some more time', '多一点时间'),
          o('a lot of help', '很多帮助'),
        ],
      },
      {
        key: 'event',
        labelZh: '事件',
        options: [
          o('the interview', '这次面试'),
          o('the wedding', '婚礼'),
          o('the party', '派对'),
          o('the trip', '这次旅行'),
          o('the presentation', '这次演讲'),
        ],
      },
    ],
    grammar: ['going-to'],
    scene: 'daily',
    level: 2,
    examples: [
      o("I'm going to need a haircut for the interview.", '为了这次面试，我会需要剪个头发。'),
      o("You're going to need a lot of help for the trip.", '为了这次旅行，你会需要很多帮助。'),
      o("I'm probably going to need a good night's sleep for the wedding.", '为了婚礼，我很可能会需要好好睡一觉。'),
    ],
    tipZh:
      "I'm going to need … 表示“到时候我会需要……”，比直接说 I need 更有预见感。need 后面接名词，不是动词：need a haircut；for + 事件说明用途。",
    source: 'seed',
  },

  // ---------- f067 向医生说明症状 ----------
  {
    id: 'f067',
    title: '向医生说明症状',
    pattern: "{opener} I've had {symptom} since {time}.",
    patternZh: '{opener}我从{time}起一直{symptom}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Doctor,', '医生，'),
          o('Excuse me,', '打扰一下，'),
          o('Hi,', '你好，'),
          o('Well,', '嗯，'),
        ],
      },
      {
        key: 'symptom',
        labelZh: '症状',
        options: [
          o('a headache', '头疼'),
          o('a sore throat', '嗓子疼'),
          o('a fever', '发烧'),
          o('a bad cough', '咳得厉害'),
          o('a stomachache', '胃疼'),
        ],
      },
      {
        key: 'time',
        labelZh: '起点',
        options: [
          o('yesterday', '昨天'),
          o('last night', '昨晚'),
          o('Monday', '周一'),
          o('this morning', '今天早上'),
          o('the weekend', '周末'),
        ],
      },
    ],
    grammar: ['present-perfect'],
    scene: 'daily',
    level: 2,
    examples: [
      o("Doctor, I've had a fever since Monday.", '医生，我从周一起一直发烧。'),
      o("Excuse me, I've had a bad cough since last night.", '打扰一下，我从昨晚起一直咳得厉害。'),
      o("Well, I've had a stomachache since the weekend.", '嗯，我从周末起一直胃疼。'),
    ],
    tipZh:
      "症状持续到现在，用现在完成时 I've had …，再用 since + 起点（昨天、周一）。如果说一段时间则用 for：for three days。症状名词前通常要加 a。",
    source: 'seed',
  },

  // ---------- f068 请人帮忙解决设备问题 ----------
  {
    id: 'f068',
    title: '请人帮忙解决设备问题',
    pattern: '{opener} my {device} {problem}. {help}?',
    patternZh: '{opener}我的{device}{problem}。{help}？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '打扰一下，'),
          o('Sorry,', '不好意思，'),
          o('Hey,', '嘿，'),
          o('Hi,', '你好，'),
        ],
      },
      {
        key: 'device',
        labelZh: '设备',
        options: [
          o('laptop', '笔记本电脑'),
          o('phone', '手机'),
          o('printer', '打印机'),
          o('tablet', '平板电脑'),
        ],
      },
      {
        key: 'problem',
        labelZh: '问题',
        options: [
          o("won't turn on", '开不了机'),
          o("isn't working properly", '运转不正常'),
          o("can't connect to the Wi-Fi", '连不上无线网'),
        ],
      },
      {
        key: 'help',
        labelZh: '请求帮助',
        options: [
          o('Could you take a look at it', '你能帮我看一下吗'),
          o('Do you know how to fix it', '你知道怎么修吗'),
          o('Could you show me how to reset it', '你能教我怎么重置吗'),
        ],
      },
    ],
    grammar: ['negation-modal', 'question-inversion'],
    scene: 'daily',
    level: 2,
    examples: [
      o("Excuse me, my laptop won't turn on. Could you take a look at it?", '打扰一下，我的笔记本电脑开不了机。你能帮我看一下吗？'),
      o("Sorry, my phone can't connect to the Wi-Fi. Could you show me how to reset it?", '不好意思，我的手机连不上无线网。你能教我怎么重置吗？'),
      o("Hi, my printer isn't working properly. Do you know how to fix it?", '你好，我的打印机运转不正常。你知道怎么修吗？'),
    ],
    tipZh:
      "描述设备坏了：won't + 动词原形（won't turn on）表示“怎么也打不开”，can't connect 表示“连不上”。my 后面不要再加 the。请求帮助用 Could you … 更礼貌。",
    source: 'seed',
  },

  // ---------- f069 询问数量 ----------
  {
    id: 'f069',
    title: '询问数量',
    pattern: 'How {quantity} {aux} {tail}?',
    patternZh: '{tail}{aux}{quantity}？',
    slots: [
      {
        key: 'quantity',
        labelZh: '数量',
        options: [
          o('many people', '多少人'),
          o('much time', '多少时间'),
          o('much money', '多少钱'),
          o('many bags', '多少个包'),
          o('many days', '多少天'),
        ],
      },
      {
        key: 'aux',
        labelZh: '助动词+主语',
        options: [
          o('do we need', '我们需要'),
          o('will we need', '我们会需要'),
          o('do you think we need', '你觉得我们需要'),
          o("do you think we'll need", '你觉得我们会需要'),
        ],
      },
      {
        key: 'tail',
        labelZh: '范围',
        options: [
          o('for tomorrow', '明天'),
          o('for the trip', '这次旅行'),
          o('for the party', '派对'),
          o('in total', '总共'),
          o('altogether', '一共'),
        ],
      },
    ],
    grammar: ['question-inversion', 'plural'],
    scene: 'daily',
    level: 2,
    examples: [
      o('How many people do we need for the party?', '派对我们需要多少人？'),
      o('How much money will we need in total?', '总共我们会需要多少钱？'),
      o("How many days do you think we'll need for the trip?", '这次旅行你觉得我们会需要多少天？'),
    ],
    tipZh:
      '可数名词（people、bags、days）用 How many，不可数名词（time、money）用 How much。疑问句里助动词放在主语前面：How much time do we need，不是 we need。',
    source: 'seed',
  },

  // ---------- f070 预约或改约 ----------
  {
    id: 'f070',
    title: '预约或改约',
    pattern: "{opener} I'd like to {request}, {tail}.",
    patternZh: '{opener}我想{request}，{tail}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Hello,', '你好，'),
          o('Hi,', '你好，'),
          o('Good morning,', '早上好，'),
          o('Hi there,', '你好呀，'),
        ],
      },
      {
        key: 'request',
        labelZh: '想做的事',
        options: [
          o('book an appointment for Friday afternoon', '预约周五下午的号'),
          o('cancel my appointment for tomorrow', '取消明天的预约'),
          o('reschedule my appointment to next week', '把预约改到下周'),
          o('confirm my appointment for Monday morning', '确认周一上午的预约'),
          o('change my appointment to a later time', '把预约改到晚一点'),
        ],
      },
      {
        key: 'tail',
        labelZh: '收尾',
        options: [
          o('please', '麻烦了'),
          o('if possible', '如果可以的话'),
          o("if that's okay", '如果你方便的话'),
        ],
      },
    ],
    grammar: ['want-to'],
    scene: 'daily',
    level: 1,
    examples: [
      o("Hello, I'd like to book an appointment for Friday afternoon, please.", '你好，我想预约周五下午的号，麻烦了。'),
      o("Good morning, I'd like to reschedule my appointment to next week, if possible.", '早上好，我想把预约改到下周，如果可以的话。'),
      o("Hi there, I'd like to cancel my appointment for tomorrow, if that's okay.", '你好呀，我想取消明天的预约，如果你方便的话。'),
    ],
    tipZh:
      "I'd like to + 动词原形 是电话预约、改约时最礼貌的开头。appointment 指与医生、律师、理发师等的预约；餐厅订位说 reservation。",
    source: 'seed',
  },

  // ---------- f071 比较两样东西 ----------
  {
    id: 'f071',
    title: '比较两样东西',
    pattern: '{subject} is {degree} {adjective} than {other}.',
    patternZh: '{subject}比{other}{adjective}{degree}。',
    slots: [
      {
        key: 'subject',
        labelZh: '主语',
        options: [
          o('This one', '这个'),
          o('That one', '那个'),
          o('The new one', '新的'),
          o('Mine', '我的'),
        ],
      },
      {
        key: 'degree',
        labelZh: '程度',
        options: [
          o('much', '得多'),
          o('a lot', '很多'),
          o('a bit', '一点'),
          o('slightly', '一点点'),
        ],
      },
      {
        key: 'adjective',
        labelZh: '比较级',
        options: [
          o('cheaper', '便宜'),
          o('better', '好'),
          o('easier', '容易'),
          o('bigger', '大'),
          o('smaller', '小'),
        ],
      },
      {
        key: 'other',
        labelZh: '比较对象',
        options: [
          o('I expected', '我预想的'),
          o('I thought', '我想的'),
          o('the old one', '旧的'),
          o('the other one', '另一个'),
        ],
      },
    ],
    grammar: ['be-adj'],
    scene: 'daily',
    level: 3,
    examples: [
      o('This one is much cheaper than I expected.', '这个比我预想的便宜得多。'),
      o('The new one is a bit easier than the old one.', '新的比旧的容易一点。'),
      o('Mine is slightly better than I thought.', '我的比我想的好一点点。'),
    ],
    tipZh:
      '比较级 + than：cheaper than、better than、more … than。程度词放在比较级前面：much / a lot / a bit / slightly cheaper，不要放在 than 后面。than I expected 是“比我预想的”常用说法。',
    source: 'seed',
  },

  // ---------- f072 谈过去的习惯 ----------
  {
    id: 'f072',
    title: '谈过去的习惯',
    pattern: '{opener} I used to {action} {age}.',
    patternZh: '{opener}我{age}常常{action}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Believe it or not,', '说来你可能不信，'),
          o('Actually,', '其实，'),
          o('Funny enough,', '说来好笑，'),
          o('Honestly,', '说实话，'),
        ],
      },
      {
        key: 'action',
        labelZh: '过去的习惯',
        options: [
          o('play football', '踢足球'),
          o('ride my bike to school', '骑自行车上学'),
          o('stay up until midnight', '熬夜到半夜'),
          o('read comic books', '看漫画书'),
          o('walk to school', '走路上学'),
        ],
      },
      {
        key: 'age',
        labelZh: '时期',
        options: [
          o('when I was a kid', '小时候'),
          o('when I was a student', '上学的时候'),
          o('when I was in high school', '上高中的时候'),
          o('when I was young', '年轻的时候'),
          o('when I was in college', '上大学的时候'),
        ],
      },
    ],
    grammar: [],
    scene: 'daily',
    level: 3,
    examples: [
      o('Believe it or not, I used to play football when I was a kid.', '说来你可能不信，我小时候常常踢足球。'),
      o('Actually, I used to stay up until midnight when I was young.', '其实，我年轻的时候常常熬夜到半夜。'),
      o('Honestly, I used to walk to school when I was in high school.', '说实话，我上高中的时候常常走路上学。'),
    ],
    tipZh:
      'used to + 动词原形 说“过去经常……，现在不了”，to 后面是原形，不要写成 used to played。否定和疑问用 didn’t use to / Did you use to。',
    source: 'seed',
  },

  // ---------- f073 预测将来 ----------
  {
    id: 'f073',
    title: '预测将来',
    pattern: '{opener} {prediction} {time}.',
    patternZh: '{opener}{time}{prediction}。',
    slots: [
      {
        key: 'opener',
        labelZh: '语气',
        options: [
          o('I think', '我觉得'),
          o('I guess', '我猜'),
          o('I bet', '我敢打赌'),
          o("I'm pretty sure", '我很确定'),
        ],
      },
      {
        key: 'prediction',
        labelZh: '预测内容',
        options: [
          o("it'll rain", '会下雨'),
          o("it'll be sunny", '会是晴天'),
          o('the traffic will be terrible', '路上会很堵'),
          o('the shop will be closed', '那家店会关门'),
          o('the weather will get better', '天气会好起来'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('tomorrow', '明天'),
          o('this weekend', '这个周末'),
          o('later this week', '这周晚些时候'),
          o('by tonight', '到今晚'),
        ],
      },
    ],
    grammar: ['modal-must'],
    scene: 'daily',
    level: 3,
    examples: [
      o("I think it'll rain tomorrow.", '我觉得明天会下雨。'),
      o('I bet the traffic will be terrible this weekend.', '我敢打赌这个周末路上会很堵。'),
      o("I'm pretty sure the weather will get better by tonight.", '我很确定到今晚天气会好起来。'),
    ],
    tipZh:
      "预测将来用 will（常缩写成 it'll）：I think + 句子，that 可以省略。语气从弱到强：I guess < I think < I'm pretty sure。时间词放在句尾。",
    source: 'seed',
  },

  // ---------- f074 给对方建议 ----------
  {
    id: 'f074',
    title: '给对方建议',
    pattern: "{opener} if I were you, I'd {action} {tail}.",
    patternZh: '{opener}如果我是你，我会{tail}{action}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Honestly,', '说实话，'),
          o('Well,', '嗯，'),
          o('Personally,', '我个人觉得，'),
          o('Look,', '听我说，'),
        ],
      },
      {
        key: 'action',
        labelZh: '建议',
        options: [
          o('see a doctor', '去看医生'),
          o('talk to your boss', '跟你老板谈谈'),
          o('get a second opinion', '征求第二个意见'),
          o('take a few days off', '休息几天'),
          o('call the bank', '给银行打个电话'),
        ],
      },
      {
        key: 'tail',
        labelZh: '时机',
        options: [
          o('first', '先'),
          o('right away', '马上'),
          o('as soon as possible', '尽快'),
          o('before doing anything else', '在做别的事之前先'),
        ],
      },
    ],
    grammar: ['modal-must'],
    scene: 'daily',
    level: 3,
    examples: [
      o("Honestly, if I were you, I'd see a doctor first.", '说实话，如果我是你，我会先去看医生。'),
      o("Personally, if I were you, I'd take a few days off right away.", '我个人觉得，如果我是你，我会马上休息几天。'),
      o("Look, if I were you, I'd call the bank before doing anything else.", '听我说，如果我是你，我会在做别的事之前先给银行打个电话。'),
    ],
    tipZh:
      "If I were you, I'd … 是给建议的经典句式，假设语气里 if 后面用 were（不是 was）。后面接动词原形。比 You should 更委婉，不会显得在命令别人。",
    source: 'seed',
  },

  // =====================================================================
  // WORK
  // =====================================================================

  // ---------- f075 打电话找人 ----------
  {
    id: 'f075',
    title: '打电话找人',
    pattern: 'Hello, this is {name} from {company}. Could I speak to {person}, please?',
    patternZh: '你好，我是{company}的{name}。请问我可以和{person}通话吗？',
    slots: [
      {
        key: 'name',
        labelZh: '自报姓名',
        options: [
          o('Anna', '安娜'),
          o('Tom Lee', '汤姆·李'),
          o('David Chen', '大卫·陈'),
          o('Linda Wu', '琳达·吴'),
        ],
      },
      {
        key: 'company',
        labelZh: '所属单位',
        options: [
          o('the Shanghai office', '上海办公室'),
          o('the sales team', '销售团队'),
          o('ABC Logistics', 'ABC物流'),
          o('the front desk', '前台'),
        ],
      },
      {
        key: 'person',
        labelZh: '要找的人',
        options: [
          o('Mr. Brown', '布朗先生'),
          o('Ms. Taylor', '泰勒女士'),
          o('someone in accounting', '会计部的人'),
          o('the person in charge of billing', '负责账单的人'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'work',
    level: 1,
    examples: [
      o('Hello, this is Anna from the Shanghai office. Could I speak to Mr. Brown, please?', '你好，我是上海办公室的安娜。请问我可以和布朗先生通话吗？'),
      o('Hello, this is Tom Lee from the sales team. Could I speak to someone in accounting, please?', '你好，我是销售团队的汤姆·李。请问我可以和会计部的人通话吗？'),
      o('Hello, this is Linda Wu from ABC Logistics. Could I speak to the person in charge of billing, please?', '你好，我是ABC物流的琳达·吴。请问我可以和负责账单的人通话吗？'),
    ],
    tipZh:
      '电话里自报家门用 This is …（不说 I am …），找人用 Could I speak to …?。找不到具体的人时，可以说 someone in + 部门 / the person in charge of + 事情。',
    source: 'seed',
  },

  // ---------- f076 写邮件说明来意 ----------
  {
    id: 'f076',
    title: '写邮件说明来意',
    pattern: "{opener} I'm writing to {purpose}. {closing}.",
    patternZh: '{opener}我写这封邮件是想{purpose}。{closing}。',
    slots: [
      {
        key: 'opener',
        labelZh: '称呼',
        options: [
          o('Hi Anna,', '安娜你好，'),
          o('Dear Mr. Lee,', '尊敬的李先生，'),
          o('Hello team,', '大家好，'),
          o('Dear all,', '各位好，'),
        ],
      },
      {
        key: 'purpose',
        labelZh: '来意',
        options: [
          o('follow up on our meeting', '跟进一下我们的会议'),
          o("confirm tomorrow's schedule", '确认明天的日程'),
          o('ask about the invoice', '询问发票的事'),
          o('let you know about a delay', '通知你们有一处延误'),
          o('ask for your feedback', '征求你的反馈'),
        ],
      },
      {
        key: 'closing',
        labelZh: '结尾',
        options: [
          o('Please let me know if you have any questions', '如有任何问题，请告诉我'),
          o('Thanks in advance for your help', '先谢谢你的帮助'),
          o('I look forward to hearing from you', '期待你的回复'),
          o('Please reply when you get a chance', '方便时请回复我'),
        ],
      },
    ],
    grammar: [],
    scene: 'work',
    level: 2,
    examples: [
      o("Hi Anna, I'm writing to follow up on our meeting. Please let me know if you have any questions.", '安娜你好，我写这封邮件是想跟进一下我们的会议。如有任何问题，请告诉我。'),
      o("Dear Mr. Lee, I'm writing to ask about the invoice. Please reply when you get a chance.", '尊敬的李先生，我写这封邮件是想询问发票的事。方便时请回复我。'),
      o("Hello team, I'm writing to let you know about a delay. Thanks in advance for your help.", '大家好，我写这封邮件是想通知你们有一处延误。先谢谢你的帮助。'),
    ],
    tipZh:
      "I'm writing to + 动词原形 是邮件开头点明来意的固定说法，to 后面不要加 for。结尾一句要跟着来意走，Please let me know … 和 I look forward to … 最常用。",
    source: 'seed',
  },

  // ---------- f077 说明操作步骤 ----------
  {
    id: 'f077',
    title: '说明操作步骤',
    pattern: '{opener} first, you need to {first}. Then, you can {then}.',
    patternZh: '{opener}首先，你需要{first}。然后，你就可以{then}了。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o("Sure, it's simple:", '当然，很简单：'),
          o('No problem:', '没问题：'),
          o("Okay, here's how it works:", '好的，流程是这样的：'),
          o("It's easy:", '很容易：'),
        ],
      },
      {
        key: 'first',
        labelZh: '第一步',
        options: [
          o('log in to the system', '登录系统'),
          o('open the shared folder', '打开共享文件夹'),
          o('fill out the form', '填写表格'),
          o('set up your account', '设置好你的账号'),
        ],
      },
      {
        key: 'then',
        labelZh: '第二步',
        options: [
          o('upload your file', '上传文件'),
          o('choose your team', '选择你的团队'),
          o('submit the request', '提交申请'),
          o('check the status', '查看状态'),
        ],
      },
    ],
    grammar: ['modal-must'],
    scene: 'work',
    level: 2,
    examples: [
      o("Sure, it's simple: first, you need to log in to the system. Then, you can upload your file.", '当然，很简单：首先，你需要登录系统。然后，你就可以上传文件了。'),
      o("Okay, here's how it works: first, you need to fill out the form. Then, you can submit the request.", '好的，流程是这样的：首先，你需要填写表格。然后，你就可以提交申请了。'),
      o("It's easy: first, you need to set up your account. Then, you can choose your team.", '很容易：首先，你需要设置好你的账号。然后，你就可以选择你的团队了。'),
    ],
    tipZh:
      'First … Then … 让步骤一目了然。需要先完成的事用 you need to，完成之后才可以做的事用 you can。后面都接动词原形。',
    source: 'seed',
  },

  // ---------- f078 通知安排有变 ----------
  {
    id: 'f078',
    title: '通知安排有变',
    pattern: '{opener} {change} {time}. {tail}.',
    patternZh: '{opener}{change}{time}。{tail}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('FYI,', '供你参考：'),
          o('Just a heads-up:', '提前说一声：'),
          o('Please note that', '请注意，'),
          o('Quick update:', '最新消息：'),
        ],
      },
      {
        key: 'change',
        labelZh: '变更内容',
        options: [
          o('the meeting has been moved to', '会议已经改到'),
          o('the deadline has been extended to', '截止日期已经延长到'),
          o('the launch has been postponed to', '发布已经推迟到'),
          o('the call has been rescheduled to', '电话会议已经改期到'),
          o('the review has been pushed back to', '评审已经推迟到'),
        ],
      },
      {
        key: 'time',
        labelZh: '新时间',
        options: [
          o('Friday morning', '周五上午'),
          o('next Monday', '下周一'),
          o('3 p.m. tomorrow', '明天下午三点'),
          o('the end of the month', '月底'),
        ],
      },
      {
        key: 'tail',
        labelZh: '补充',
        options: [
          o('Sorry for the late notice', '抱歉通知得这么晚'),
          o('Hope that works for everyone', '希望对大家都合适'),
          o("Let me know if that's a problem", '如果有问题请告诉我'),
          o('Please update your calendar', '请更新一下你的日历'),
        ],
      },
    ],
    grammar: ['present-perfect'],
    scene: 'work',
    level: 2,
    examples: [
      o('FYI, the meeting has been moved to Friday morning. Sorry for the late notice.', '供你参考：会议已经改到周五上午。抱歉通知得这么晚。'),
      o('Please note that the call has been rescheduled to 3 p.m. tomorrow. Hope that works for everyone.', '请注意，电话会议已经改期到明天下午三点。希望对大家都合适。'),
      o('Quick update: the deadline has been extended to the end of the month. Please update your calendar.', '最新消息：截止日期已经延长到月底。请更新一下你的日历。'),
    ],
    tipZh:
      'has been + 过去分词 是被动语态的现在完成时，强调“已经改了”，不必说是谁改的。后面的 to + 新时间 说明改到什么时候。',
    source: 'seed',
  },

  // ---------- f079 解释为什么没能及时处理 ----------
  {
    id: 'f079',
    title: '解释为什么没能及时处理',
    pattern: '{opener} I had to {action} {time}, so {result}.',
    patternZh: '{opener}{time}我得{action}，所以{result}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Sorry,', '抱歉，'),
          o('Apologies,', '十分抱歉，'),
          o('Sorry about that,', '对不起，'),
          o('Sorry again,', '再次抱歉，'),
        ],
      },
      {
        key: 'action',
        labelZh: '被迫做的事',
        options: [
          o('deal with an urgent problem', '处理一个紧急问题'),
          o('take my son to the doctor', '带儿子去看医生'),
          o('go to another meeting', '去参加另一个会议'),
          o('help a colleague with a report', '帮同事处理一份报告'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('yesterday', '昨天'),
          o('last night', '昨晚'),
          o('this morning', '今天早上'),
          o('earlier today', '今天早些时候'),
        ],
      },
      {
        key: 'result',
        labelZh: '结果',
        options: [
          o('I missed your call', '我错过了你的电话'),
          o("I'm running a bit behind", '我进度有点落后'),
          o("I couldn't reply earlier", '我没能早点回复'),
          o("I haven't finished it yet", '我还没做完'),
        ],
      },
    ],
    grammar: ['modal-must'],
    scene: 'work',
    level: 2,
    examples: [
      o('Sorry, I had to deal with an urgent problem yesterday, so I missed your call.', '抱歉，昨天我得处理一个紧急问题，所以我错过了你的电话。'),
      o("Apologies, I had to take my son to the doctor last night, so I'm running a bit behind.", '十分抱歉，昨晚我得带儿子去看医生，所以我进度有点落后。'),
      o("Sorry again, I had to help a colleague with a report this morning, so I couldn't reply earlier.", '再次抱歉，今天早上我得帮同事处理一份报告，所以我没能早点回复。'),
    ],
    tipZh:
      'had to 是 have to 的过去式，表示“当时不得不……”，后面接动词原形。先说原因（I had to …），再用 so 带出结果，比单纯说 Sorry 更有说服力。',
    source: 'seed',
  },

  // ---------- f080 礼貌地表示不同意 ----------
  {
    id: 'f080',
    title: '礼貌地表示不同意',
    pattern: '{agree}, but {counter} {tail}.',
    patternZh: '{agree}，但{tail}{counter}。',
    slots: [
      {
        key: 'agree',
        labelZh: '先认同',
        options: [
          o('I see what you mean', '我明白你的意思'),
          o("That's a fair point", '你说得有道理'),
          o('I understand your concern', '我理解你的顾虑'),
          o('You may be right', '你可能是对的'),
        ],
      },
      {
        key: 'counter',
        labelZh: '再反对',
        options: [
          o("that won't work", '那行不通'),
          o("we shouldn't rush into it", '我们不应该操之过急'),
          o("we can't afford it", '我们承担不起'),
          o("we can't commit to that", '我们没法答应下来'),
        ],
      },
      {
        key: 'tail',
        labelZh: '限定范围',
        options: [
          o('for now', '目前'),
          o('right now', '现在'),
          o('at this stage', '现阶段'),
        ],
      },
    ],
    grammar: ['negation-modal'],
    scene: 'work',
    level: 3,
    examples: [
      o("I see what you mean, but that won't work for now.", '我明白你的意思，但目前那行不通。'),
      o("I understand your concern, but we shouldn't rush into it at this stage.", '我理解你的顾虑，但现阶段我们不应该操之过急。'),
      o("You may be right, but we can't commit to that right now.", '你可能是对的，但现在我们没法答应下来。'),
    ],
    tipZh:
      '先认同、再用 but 提出不同意见，是职场里最不伤人的说法。for now / right now / at this stage 把反对限定在“现在”，给对方留面子。',
    source: 'seed',
  },

  // ---------- f081 委婉地提出协商 ----------
  {
    id: 'f081',
    title: '委婉地提出协商',
    pattern: '{opener} would it be possible to {action} {tail}?',
    patternZh: '{opener}{tail}，有没有可能{action}？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Sorry to ask, but', '不好意思问一下，不过'),
          o('Excuse me,', '打扰一下，'),
          o('Hi there,', '你好，'),
          o("I know it's a lot, but", '我知道要求有点多，但'),
        ],
      },
      {
        key: 'action',
        labelZh: '想争取的事',
        options: [
          o('move the deadline back a week', '把截止日期延后一周'),
          o('reschedule our call to Friday', '把我们的电话会议改到周五'),
          o('get a small discount', '拿到一点小折扣'),
          o('extend the contract by a month', '把合同延长一个月'),
          o('have a little more time', '多给我们一点时间'),
        ],
      },
      {
        key: 'tail',
        labelZh: '缓和语气',
        options: [
          o("if that's not too much trouble", '如果不太麻烦的话'),
          o('just this once', '就这一次'),
          o('given the circumstances', '考虑到目前的情况'),
          o("if you don't mind", '如果你不介意的话'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'work',
    level: 3,
    examples: [
      o("Sorry to ask, but would it be possible to move the deadline back a week if that's not too much trouble?", '不好意思问一下，不过如果不太麻烦的话，有没有可能把截止日期延后一周？'),
      o("I know it's a lot, but would it be possible to get a small discount just this once?", '我知道要求有点多，但就这一次，有没有可能拿到一点小折扣？'),
      o('Hi there, would it be possible to have a little more time given the circumstances?', '你好，考虑到目前的情况，有没有可能多给我们一点时间？'),
    ],
    tipZh:
      'Would it be possible to + 动词原形 是协商、争取让步时最常用的委婉句式，比 Can you 客气得多。句尾加 just this once 之类的缓和语，更容易被接受。',
    source: 'seed',
  },

  // ---------- f082 确认自己的理解 ----------
  {
    id: 'f082',
    title: '确认自己的理解',
    pattern: "{opener} what you're saying is that {summary}, {tag}?",
    patternZh: '{opener}你的意思是{summary}，{tag}？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('So', '所以，'),
          o('Okay, so', '好的，所以'),
          o('Just to be clear,', '为了确认一下，'),
          o('Just to confirm,', '跟你确认一下，'),
        ],
      },
      {
        key: 'summary',
        labelZh: '复述内容',
        options: [
          o('we need more time', '我们需要更多时间'),
          o('the budget has been cut', '预算被削减了'),
          o('the launch will be delayed', '发布会被推迟'),
          o("we can't go ahead yet", '我们还不能继续推进'),
          o("you'd like to start over", '你想重新开始'),
        ],
      },
      {
        key: 'tag',
        labelZh: '确认',
        options: [
          o('is that right', '是这样吗'),
          o('is that correct', '对吗'),
          o('did I get that right', '我理解对了吗'),
          o('am I right', '我说得对吗'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'work',
    level: 3,
    examples: [
      o("So what you're saying is that we need more time, is that right?", '所以，你的意思是我们需要更多时间，是这样吗？'),
      o("Just to be clear, what you're saying is that the launch will be delayed, did I get that right?", '为了确认一下，你的意思是发布会被推迟，我理解对了吗？'),
      o("Okay, so what you're saying is that you'd like to start over, am I right?", '好的，所以你的意思是你想重新开始，我说得对吗？'),
    ],
    tipZh:
      '复述对方的话来确认理解：what you’re saying is that + 完整句子。末尾的确认问句要用倒装：is that right / did I get that right，不能说 that is right?。',
    source: 'seed',
  },

  // ---------- f083 递上对方要的东西 ----------
  {
    id: 'f083',
    title: '递上对方要的东西',
    pattern: "{opener} here's the {thing} that {clause}. {tail}.",
    patternZh: '{opener}这是{clause}的{thing}。{tail}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Sure,', '当然，'),
          o('Okay,', '好的，'),
          o('No problem,', '没问题，'),
          o('Of course,', '当然可以，'),
        ],
      },
      {
        key: 'thing',
        labelZh: '东西',
        options: [
          o('report', '报告'),
          o('link', '链接'),
          o('photo', '照片'),
          o('schedule', '日程表'),
          o('file', '文件'),
        ],
      },
      {
        key: 'clause',
        labelZh: '定语从句',
        options: [
          o('I told you about', '我跟你提过'),
          o('you asked me for', '你向我要'),
          o('I promised you', '我答应过你'),
          o('I showed you yesterday', '我昨天给你看过'),
        ],
      },
      {
        key: 'tail',
        labelZh: '收尾',
        options: [
          o('Hope that helps', '希望有帮助'),
          o('Let me know what you think', '看完告诉我你的想法'),
          o('Take a look when you can', '有空时看一下'),
        ],
      },
    ],
    grammar: ['object-pronoun'],
    scene: 'work',
    level: 3,
    examples: [
      o("Sure, here's the report that I told you about. Hope that helps.", '当然，这是我跟你提过的报告。希望有帮助。'),
      o("Okay, here's the link that you asked me for. Let me know what you think.", '好的，这是你向我要的链接。看完告诉我你的想法。'),
      o("Of course, here's the file that I showed you yesterday. Take a look when you can.", '当然可以，这是我昨天给你看过的文件。有空时看一下。'),
    ],
    tipZh:
      '用 that 引导定语从句来说明“哪一个”：the report that I told you about。从句里的 that 指的是宾语，常常可以省略：the report I told you about。',
    source: 'seed',
  },

  // ---------- f084 不确定但答应查清楚 ----------
  {
    id: 'f084',
    title: '不确定但答应查清楚',
    pattern: "{opener} I'm not sure {clause}, but I'll check and let you know {time}.",
    patternZh: '{opener}我不确定{clause}，但我会查一下，{time}告诉你。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Honestly,', '说实话，'),
          o('To be honest,', '老实说，'),
          o('Sorry,', '抱歉，'),
          o('Actually,', '其实，'),
        ],
      },
      {
        key: 'clause',
        labelZh: '不确定的事',
        options: [
          o('where the file is', '文件在哪儿'),
          o('when the meeting starts', '会议什么时候开始'),
          o("who's in charge", '谁负责'),
          o('how much it costs', '要花多少钱'),
          o('what time the office closes', '办公室几点关门'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('later today', '今天晚些时候'),
          o('by tonight', '今晚之前'),
          o('this afternoon', '今天下午'),
          o('as soon as I can', '一有消息就'),
          o('first thing tomorrow', '明天一早'),
        ],
      },
    ],
    grammar: ['modal-must'],
    scene: 'work',
    level: 3,
    examples: [
      o("Honestly, I'm not sure where the file is, but I'll check and let you know later today.", '说实话，我不确定文件在哪儿，但我会查一下，今天晚些时候告诉你。'),
      o("Sorry, I'm not sure how much it costs, but I'll check and let you know as soon as I can.", '抱歉，我不确定要花多少钱，但我会查一下，一有消息就告诉你。'),
      o("To be honest, I'm not sure what time the office closes, but I'll check and let you know first thing tomorrow.", '老实说，我不确定办公室几点关门，但我会查一下，明天一早告诉你。'),
    ],
    tipZh:
      "I'm not sure + 疑问词 + 陈述语序：I’m not sure where the file is，不是 where is the file。I'll check and let you know 是不知道答案时的体面回答。",
    source: 'seed',
  },

  // =====================================================================
  // TRAVEL
  // =====================================================================

  // ---------- f085 询问附近有没有某地 ----------
  {
    id: 'f085',
    title: '询问附近有没有某地',
    pattern: '{opener} is there {thing} {tail}?',
    patternZh: '{opener}{tail}有{thing}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '打扰一下，'),
          o('Sorry,', '不好意思，'),
          o('Hi there,', '你好，'),
          o('Quick question,', '请问一下，'),
        ],
      },
      {
        key: 'thing',
        labelZh: '地点',
        options: [
          o('a pharmacy', '药店'),
          o('an ATM', '取款机'),
          o('a supermarket', '超市'),
          o('a bus stop', '公交站'),
          o('a public restroom', '公共厕所'),
        ],
      },
      {
        key: 'tail',
        labelZh: '范围',
        options: [
          o('near here', '这附近'),
          o('around here', '这一带'),
          o('nearby', '附近'),
          o('in this area', '这个区域'),
          o('close to here', '离这儿不远的地方'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'travel',
    level: 1,
    examples: [
      o('Excuse me, is there a pharmacy near here?', '打扰一下，这附近有药店吗？'),
      o('Sorry, is there an ATM in this area?', '不好意思，这个区域有取款机吗？'),
      o('Quick question, is there a public restroom nearby?', '请问一下，附近有公共厕所吗？'),
    ],
    tipZh:
      'Is there + a / an + 单数名词 问“有没有”，注意 a pharmacy / an ATM 的 a / an。复数用 Are there any …?。near here 和 around here 都是“这附近”。',
    source: 'seed',
  },

  // ---------- f086 告诉别人某地在哪 ----------
  {
    id: 'f086',
    title: '告诉别人某地在哪',
    pattern: '{opener} {subject} is {location}.',
    patternZh: '{opener}{subject}{location}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Sure,', '好的，'),
          o('Yes,', '有的，'),
          o('Actually,', '其实，'),
          o('Oh,', '哦，'),
        ],
      },
      {
        key: 'subject',
        labelZh: '地点',
        options: [
          o('the pharmacy', '药店'),
          o('the ATM', '取款机'),
          o('the supermarket', '超市'),
          o('the bus stop', '公交站'),
          o('the post office', '邮局'),
        ],
      },
      {
        key: 'location',
        labelZh: '位置',
        options: [
          o('next to the bank', '就在银行旁边'),
          o('across from the station', '就在车站对面'),
          o('around the corner', '就在拐角处'),
          o('at the end of this street', '就在这条街的尽头'),
          o('behind the hotel', '就在酒店后面'),
        ],
      },
    ],
    grammar: ['be-adj'],
    scene: 'travel',
    level: 1,
    examples: [
      o('Sure, the pharmacy is next to the bank.', '好的，药店就在银行旁边。'),
      o('Yes, the bus stop is across from the station.', '有的，公交站就在车站对面。'),
      o('Oh, the post office is behind the hotel.', '哦，邮局就在酒店后面。'),
    ],
    tipZh:
      '说位置用 be + 介词短语：is next to / is across from / is behind。next to = 紧挨着，across from = 在对面，around the corner = 拐个弯就到。',
    source: 'seed',
  },

  // ---------- f087 问班次时间 ----------
  {
    id: 'f087',
    title: '问班次时间',
    pattern: '{opener} what time does {vehicle} {verb} {tail}?',
    patternZh: '{opener}{tail}{vehicle}几点{verb}？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '打扰一下，'),
          o('Sorry,', '不好意思，'),
          o('Hi,', '你好，'),
          o('Quick question,', '问一下，'),
        ],
      },
      {
        key: 'vehicle',
        labelZh: '交通工具',
        options: [
          o('the last train', '末班火车'),
          o('the first bus', '首班公交'),
          o('the next flight', '下一个航班'),
          o('the airport shuttle', '机场大巴'),
          o('the ferry', '渡轮'),
        ],
      },
      {
        key: 'verb',
        labelZh: '动词',
        options: [
          o('leave', '出发'),
          o('arrive', '到达'),
          o('get here', '到这儿'),
        ],
      },
      {
        key: 'tail',
        labelZh: '时间',
        options: [
          o('tomorrow', '明天'),
          o('today', '今天'),
          o('on Sundays', '周日'),
          o('on weekdays', '工作日'),
          o('on Saturdays', '周六'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'travel',
    level: 1,
    examples: [
      o('Excuse me, what time does the last train leave tomorrow?', '打扰一下，明天末班火车几点出发？'),
      o('Sorry, what time does the first bus arrive on Sundays?', '不好意思，周日首班公交几点到达？'),
      o('Quick question, what time does the airport shuttle get here on weekdays?', '问一下，工作日机场大巴几点到这儿？'),
    ],
    tipZh:
      'What time does + 主语 + 动词原形？助动词 does 已经带了第三人称 -s，所以后面是 leave，不是 leaves。arrive / leave / depart 是班次时间最常用的三个动词。',
    source: 'seed',
  },

  // ---------- f088 请人推荐 ----------
  {
    id: 'f088',
    title: '请人推荐',
    pattern: '{opener} {verb} {thing} {tail}?',
    patternZh: '{opener}{tail}{verb}{thing}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '打扰一下，'),
          o('Hi,', '你好，'),
          o('Sorry,', '不好意思，'),
          o('By the way,', '对了，'),
        ],
      },
      {
        key: 'verb',
        labelZh: '请求句头',
        options: [
          o('can you recommend', '你能推荐'),
          o('could you recommend', '你可以推荐'),
          o('do you happen to know', '你碰巧知道'),
          o('would you recommend', '你会推荐'),
        ],
      },
      {
        key: 'thing',
        labelZh: '想找的',
        options: [
          o('a good restaurant', '一家不错的餐厅'),
          o('a good coffee shop', '一家不错的咖啡店'),
          o('a good hotel', '一家不错的酒店'),
          o('a good dentist', '一位不错的牙医'),
          o('a good bookstore', '一家不错的书店'),
        ],
      },
      {
        key: 'tail',
        labelZh: '范围',
        options: [
          o('near here', '这附近'),
          o('nearby', '附近'),
          o('around here', '这一带'),
          o('in this area', '这个区域'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'travel',
    level: 2,
    examples: [
      o('Excuse me, can you recommend a good restaurant near here?', '打扰一下，这附近你能推荐一家不错的餐厅吗？'),
      o('Hi, could you recommend a good dentist around here?', '你好，这一带你可以推荐一位不错的牙医吗？'),
      o('By the way, would you recommend a good bookstore in this area?', '对了，这个区域你会推荐一家不错的书店吗？'),
    ],
    tipZh:
      'recommend 后面直接跟名词：recommend a good restaurant，不用 to。Do you happen to know … 语气更随意，像是“碰巧你知道的话”。',
    source: 'seed',
  },

  // ---------- f089 问路程要多久 ----------
  {
    id: 'f089',
    title: '问路程要多久',
    pattern: '{opener} how long does it take to get to {place} {mode}?',
    patternZh: '{opener}从这里{mode}到{place}要多长时间？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '打扰一下，'),
          o('Sorry,', '不好意思，'),
          o('Hi,', '你好，'),
          o('Quick question,', '问一下，'),
        ],
      },
      {
        key: 'place',
        labelZh: '目的地',
        options: [
          o('the airport', '机场'),
          o('the city centre', '市中心'),
          o('the beach', '海滩'),
          o('the train station', '火车站'),
          o('the old town', '老城区'),
        ],
      },
      {
        key: 'mode',
        labelZh: '交通方式',
        options: [
          o('by bus', '坐公交'),
          o('by taxi', '打车'),
          o('by subway', '坐地铁'),
          o('on foot', '步行'),
          o('by bike', '骑车'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'travel',
    level: 2,
    examples: [
      o('Excuse me, how long does it take to get to the airport by bus?', '打扰一下，从这里坐公交到机场要多长时间？'),
      o('Sorry, how long does it take to get to the beach on foot?', '不好意思，从这里步行到海滩要多长时间？'),
      o('Quick question, how long does it take to get to the old town by taxi?', '问一下，从这里打车到老城区要多长时间？'),
    ],
    tipZh:
      'How long does it take to + 动词原形 问“要花多长时间”，it 是固定的形式主语。交通方式用 by + 无冠词名词（by bus），步行说 on foot。',
    source: 'seed',
  },

  // ---------- f090 买车票 ----------
  {
    id: 'f090',
    title: '买车票',
    pattern: "{opener} I'd like {ticket} to {place} {time}, please.",
    patternZh: '{opener}我想买{time}去{place}的{ticket}，麻烦了。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Hi,', '你好，'),
          o('Hello,', '您好，'),
          o('Excuse me,', '打扰一下，'),
          o('Good morning,', '早上好，'),
        ],
      },
      {
        key: 'ticket',
        labelZh: '票种',
        options: [
          o('one single ticket', '一张单程票'),
          o('two single tickets', '两张单程票'),
          o('one return ticket', '一张往返票'),
          o('two return tickets', '两张往返票'),
          o('two adult tickets', '两张成人票'),
        ],
      },
      {
        key: 'place',
        labelZh: '目的地',
        options: [
          o('Oxford', '牛津'),
          o('Paris', '巴黎'),
          o('the airport', '机场'),
          o('Central Station', '中央车站'),
          o('Edinburgh', '爱丁堡'),
        ],
      },
      {
        key: 'time',
        labelZh: '时间',
        options: [
          o('for Friday', '周五'),
          o('for tomorrow morning', '明天早上'),
          o('for this afternoon', '今天下午'),
          o('for the next departure', '下一班'),
        ],
      },
    ],
    grammar: [],
    scene: 'travel',
    level: 2,
    examples: [
      o("Hi, I'd like one single ticket to Oxford for Friday, please.", '你好，我想买周五去牛津的一张单程票，麻烦了。'),
      o("Excuse me, I'd like two return tickets to Paris for tomorrow morning, please.", '打扰一下，我想买明天早上去巴黎的两张往返票，麻烦了。'),
      o("Good morning, I'd like two adult tickets to Central Station for the next departure, please.", '早上好，我想买下一班去中央车站的两张成人票，麻烦了。'),
    ],
    tipZh:
      "I'd like + 名词 是买票、点东西的礼貌说法。single = 单程（美式说 one-way），return = 往返（美式说 round-trip）。票数和 ticket 的单复数要一致。",
    source: 'seed',
  },

  // ---------- f091 说明东西落在哪了 ----------
  {
    id: 'f091',
    title: '说明东西落在哪了',
    pattern: "{opener} I think I've left {thing} in {place}. Could you {request}?",
    patternZh: '{opener}我好像把{thing}落在{place}了。你能{request}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Excuse me,', '打扰一下，'),
          o('Sorry to bother you,', '不好意思打扰一下，'),
          o('Hi,', '你好，'),
          o('Hello,', '您好，'),
        ],
      },
      {
        key: 'thing',
        labelZh: '落下的东西',
        options: [
          o('my passport', '护照'),
          o('my umbrella', '雨伞'),
          o('my phone', '手机'),
          o('my wallet', '钱包'),
          o('my jacket', '外套'),
        ],
      },
      {
        key: 'place',
        labelZh: '地点',
        options: [
          o('the taxi', '出租车上'),
          o('the restaurant', '餐厅里'),
          o('the lobby', '大堂里'),
          o('the shop', '店里'),
        ],
      },
      {
        key: 'request',
        labelZh: '请求',
        options: [
          o('check the lost and found', '查一下失物招领处'),
          o('call me if you find it', '在找到后给我打个电话'),
          o('ask the staff to look for it', '让工作人员帮忙找一找'),
          o('keep it for me until tomorrow', '替我保管到明天'),
        ],
      },
    ],
    grammar: ['present-perfect', 'question-inversion'],
    scene: 'travel',
    level: 3,
    examples: [
      o("Excuse me, I think I've left my passport in the taxi. Could you check the lost and found?", '打扰一下，我好像把护照落在出租车上了。你能查一下失物招领处吗？'),
      o("Sorry to bother you, I think I've left my phone in the restaurant. Could you call me if you find it?", '不好意思打扰一下，我好像把手机落在餐厅里了。你能在找到后给我打个电话吗？'),
      o("Hello, I think I've left my jacket in the shop. Could you keep it for me until tomorrow?", '您好，我好像把外套落在店里了。你能替我保管到明天吗？'),
    ],
    tipZh:
      "leave 的过去分词是 left：I've left my phone in the taxi。I think 让语气更不肯定、更礼貌。忘带用 leave，丢了用 lose：I've lost my wallet。",
    source: 'seed',
  },

  // =====================================================================
  // SOCIAL
  // =====================================================================

  // ---------- f092 寒暄问近况 ----------
  {
    id: 'f092',
    title: '寒暄问近况',
    pattern: "{opener} how's {thing} going {tail}?",
    patternZh: '{opener}{tail}{thing}怎么样了？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Hey,', '嘿，'),
          o('Hi there,', '你好呀，'),
          o('So,', '那么，'),
          o('By the way,', '对了，'),
        ],
      },
      {
        key: 'thing',
        labelZh: '关心的事',
        options: [
          o('your new job', '你的新工作'),
          o('your class', '你的课'),
          o('the move', '搬家的事'),
          o('the renovation', '装修'),
          o('your project', '你的项目'),
        ],
      },
      {
        key: 'tail',
        labelZh: '时间',
        options: [
          o('so far', '到目前为止'),
          o('lately', '最近'),
          o('these days', '这段时间'),
          o('this week', '这周'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'social',
    level: 1,
    examples: [
      o("Hey, how's your new job going so far?", '嘿，到目前为止你的新工作怎么样了？'),
      o("Hi there, how's the move going this week?", '你好呀，这周搬家的事怎么样了？'),
      o("By the way, how's the renovation going lately?", '对了，最近装修怎么样了？'),
    ],
    tipZh:
      "How's + 事情 + going? 是关心别人近况的万能问法，how's 是 how is 的缩写。不要说 How is your job going on。",
    source: 'seed',
  },

  // ---------- f093 感谢并说明原因 ----------
  {
    id: 'f093',
    title: '感谢并说明原因',
    pattern: '{thanks} for {reason} {tail}.',
    patternZh: '{thanks}{tail}{reason}。',
    slots: [
      {
        key: 'thanks',
        labelZh: '感谢语',
        options: [
          o('Thanks so much', '非常感谢你'),
          o('Thank you so much', '真的很感谢你'),
          o('Many thanks', '多谢你'),
          o('Thanks a lot', '谢谢你'),
        ],
      },
      {
        key: 'reason',
        labelZh: '感谢的原因',
        options: [
          o('helping me move', '帮我搬家'),
          o('picking me up', '来接我'),
          o('lending me your charger', '借我充电器'),
          o('covering for me', '替我顶班'),
          o('waiting for me', '等我'),
        ],
      },
      {
        key: 'tail',
        labelZh: '时间',
        options: [
          o('last night', '昨晚'),
          o('yesterday', '昨天'),
          o('this morning', '今天早上'),
          o('today', '今天'),
        ],
      },
    ],
    grammar: ['object-pronoun'],
    scene: 'social',
    level: 1,
    examples: [
      o('Thanks so much for helping me move last night.', '非常感谢你昨晚帮我搬家。'),
      o('Thank you so much for lending me your charger yesterday.', '真的很感谢你昨天借我充电器。'),
      o('Thanks a lot for waiting for me today.', '谢谢你今天等我。'),
    ],
    tipZh:
      '感谢的原因放在 for 后面，动词要用 -ing 形式：Thanks for helping me，不是 Thanks for help me。me 是宾语，不能说 helping I。',
    source: 'seed',
  },

  // ---------- f094 夸奖别人 ----------
  {
    id: 'f094',
    title: '夸奖别人',
    pattern: '{opener} {phrase} {thing}.',
    patternZh: '{opener}{phrase}{thing}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Wow,', '哇，'),
          o('Hey,', '嘿，'),
          o('By the way,', '对了，'),
          o('Honestly,', '说实话，'),
        ],
      },
      {
        key: 'phrase',
        labelZh: '喜欢的程度',
        options: [
          o('I really like', '我真的很喜欢'),
          o('I absolutely love', '我超级喜欢'),
          o("I'm crazy about", '我特别喜欢'),
          o('I just love', '我特别爱'),
        ],
      },
      {
        key: 'thing',
        labelZh: '夸奖的对象',
        options: [
          o('your jacket', '你的外套'),
          o('your new haircut', '你的新发型'),
          o('your handwriting', '你的字'),
          o('your accent', '你的口音'),
          o('your cooking', '你做的菜'),
        ],
      },
    ],
    grammar: [],
    scene: 'social',
    level: 1,
    examples: [
      o('Wow, I really like your jacket.', '哇，我真的很喜欢你的外套。'),
      o('By the way, I absolutely love your handwriting.', '对了，我超级喜欢你的字。'),
      o("Honestly, I'm crazy about your cooking.", '说实话，我特别喜欢你做的菜。'),
    ],
    tipZh:
      '夸别人用 I really like / I love + your + 名词，对方的东西前要有 your。夸奖后常常接一个问题，比如 Where did you get it?，聊天就能继续下去。',
    source: 'seed',
  },

  // ---------- f095 聊自己的爱好 ----------
  {
    id: 'f095',
    title: '聊自己的爱好',
    pattern: "{opener} I've been really into {hobby} lately. {tail}?",
    patternZh: '{opener}我最近特别迷{hobby}。{tail}？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Actually,', '其实，'),
          o('Honestly,', '说实话，'),
          o('Well,', '嗯，'),
          o('Funny you ask:', '你这么一问：'),
        ],
      },
      {
        key: 'hobby',
        labelZh: '爱好',
        options: [
          o('hiking', '徒步'),
          o('baking', '烘焙'),
          o('photography', '摄影'),
          o('yoga', '瑜伽'),
          o('board games', '桌游'),
        ],
      },
      {
        key: 'tail',
        labelZh: '把话题抛回去',
        options: [
          o('Do you want to try it with me', '你想跟我一起试试吗'),
          o('Have you ever tried it', '你试过吗'),
          o('Do you have any hobbies yourself', '你自己有什么爱好吗'),
          o('Would you like to join me sometime', '改天你想一起来吗'),
        ],
      },
    ],
    grammar: ['present-perfect'],
    scene: 'social',
    level: 2,
    examples: [
      o("Actually, I've been really into hiking lately. Do you want to try it with me?", '其实，我最近特别迷徒步。你想跟我一起试试吗？'),
      o("Well, I've been really into photography lately. Have you ever tried it?", '嗯，我最近特别迷摄影。你试过吗？'),
      o("Honestly, I've been really into yoga lately. Would you like to join me sometime?", '说实话，我最近特别迷瑜伽。改天你想一起来吗？'),
    ],
    tipZh:
      "be into + 名词 / 动名词 = 迷上了……。I've been into … lately 表示“最近一直迷着”。说完后抛一个问题给对方，对话才不会冷场。",
    source: 'seed',
  },

  // ---------- f096 表示惊讶 ----------
  {
    id: 'f096',
    title: '表示惊讶',
    pattern: '{reaction}! {know} {news}. {tail}.',
    patternZh: '{reaction}！{know}{news}。{tail}。',
    slots: [
      {
        key: 'reaction',
        labelZh: '惊讶的反应',
        options: [
          o('Wow', '哇'),
          o('No way', '不会吧'),
          o('Oh wow', '天哪'),
          o('Whoa', '哇哦'),
        ],
      },
      {
        key: 'know',
        labelZh: '之前不知道',
        options: [
          o("I didn't know", '我不知道'),
          o('I had no idea', '我完全不知道'),
          o('I never knew', '我从来不知道'),
        ],
      },
      {
        key: 'news',
        labelZh: '新信息',
        options: [
          o('you could play the piano', '你会弹钢琴'),
          o('you spoke French', '你会说法语'),
          o('you used to live in Paris', '你以前住在巴黎'),
          o('you were a professional dancer', '你以前是专业舞者'),
          o('you had a twin sister', '你有个双胞胎姐妹'),
        ],
      },
      {
        key: 'tail',
        labelZh: '后续',
        options: [
          o("That's so cool", '太酷了'),
          o("You're full of surprises", '你真是深藏不露'),
          o('Tell me more', '快多跟我说说'),
        ],
      },
    ],
    grammar: [],
    scene: 'social',
    level: 2,
    examples: [
      o("Wow! I didn't know you could play the piano. That's so cool.", '哇！我不知道你会弹钢琴。太酷了。'),
      o("No way! I had no idea you used to live in Paris. You're full of surprises.", '不会吧！我完全不知道你以前住在巴黎。你真是深藏不露。'),
      o('Whoa! I never knew you had a twin sister. Tell me more.', '哇哦！我从来不知道你有个双胞胎姐妹。快多跟我说说。'),
    ],
    tipZh:
      '表示惊讶：No way! / Wow! 开头，再用 I didn’t know / I had no idea 说“我之前不知道”，后面接完整句子。I never knew 语气更强。',
    source: 'seed',
  },

  // ---------- f097 指认某个人 ----------
  {
    id: 'f097',
    title: '指认某个人',
    pattern: '{opener} {who} is the one who {description}.',
    patternZh: '{opener}{who}就是{description}的那个人。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Oh,', '哦，'),
          o('Yes,', '是的，'),
          o('Actually,', '其实，'),
          o('You know,', '你知道吗，'),
        ],
      },
      {
        key: 'who',
        labelZh: '指的人',
        options: [
          o('Anna', '安娜'),
          o('Mr. Lee', '李先生'),
          o('my brother', '我哥哥'),
          o('the woman in the red coat', '穿红外套的那位女士'),
        ],
      },
      {
        key: 'description',
        labelZh: '特征',
        options: [
          o('lives next door to me', '住在我隔壁'),
          o('sits by the window', '坐在窗边'),
          o('always makes everyone laugh', '总能把大家逗笑'),
          o('knows everything about the city', '对这座城市了如指掌'),
          o('works in the finance team', '在财务组工作'),
        ],
      },
    ],
    grammar: ['third-person-s'],
    scene: 'social',
    level: 3,
    examples: [
      o('Oh, Anna is the one who lives next door to me.', '哦，安娜就是住在我隔壁的那个人。'),
      o('Actually, Mr. Lee is the one who knows everything about the city.', '其实，李先生就是对这座城市了如指掌的那个人。'),
      o('Yes, the woman in the red coat is the one who always makes everyone laugh.', '是的，穿红外套的那位女士就是总能把大家逗笑的那个人。'),
    ],
    tipZh:
      'the one who + 动词 用来说明“就是那个……的人”。who 在从句里当主语，所以后面的动词要跟着变：lives、sits、knows 都要加 -s。',
    source: 'seed',
  },

  // =====================================================================
  // STUDY
  // =====================================================================

  // ---------- f098 说自己的强项和弱项 ----------
  {
    id: 'f098',
    title: '说自己的强项和弱项',
    pattern: '{first} is {easy} for me, but {second} is {hard}.',
    patternZh: '{first}对我来说{easy}，但{second}{hard}。',
    slots: [
      {
        key: 'first',
        labelZh: '擅长的',
        options: [
          o('Reading', '阅读'),
          o('Grammar', '语法'),
          o('Writing', '写作'),
        ],
      },
      {
        key: 'easy',
        labelZh: '轻松的程度',
        options: [
          o('easy', '很容易'),
          o('fun', '很有意思'),
          o('pretty simple', '挺简单'),
        ],
      },
      {
        key: 'second',
        labelZh: '不擅长的',
        options: [
          o('speaking', '口语'),
          o('pronunciation', '发音'),
          o('listening to fast speech', '听语速快的内容'),
        ],
      },
      {
        key: 'hard',
        labelZh: '困难的程度',
        options: [
          o('hard', '很难'),
          o('tricky', '有点棘手'),
          o('really difficult', '非常困难'),
        ],
      },
    ],
    grammar: ['be-adj'],
    scene: 'study',
    level: 1,
    examples: [
      o('Reading is easy for me, but speaking is hard.', '阅读对我来说很容易，但口语很难。'),
      o('Grammar is fun for me, but pronunciation is tricky.', '语法对我来说很有意思，但发音有点棘手。'),
      o('Writing is pretty simple for me, but listening to fast speech is really difficult.', '写作对我来说挺简单，但听语速快的内容非常困难。'),
    ],
    tipZh:
      '“A 对我来说……，但 B ……”用 A is … for me, but B is …。for me 说明“对我而言”，放在形容词后面。speaking、pronunciation 这类做主语的名词不用加 the。',
    source: 'seed',
  },

  // ---------- f099 请老师讲解区别 ----------
  {
    id: 'f099',
    title: '请老师讲解区别',
    pattern: '{opener} could you explain {pair} {tail}?',
    patternZh: '{opener}你能{tail}解释一下 {pair}吗？',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Sorry,', '不好意思，'),
          o('Excuse me,', '打扰一下，'),
          o('Teacher,', '老师，'),
          o('Hi,', '你好，'),
        ],
      },
      {
        key: 'pair',
        labelZh: '要区分的词',
        options: [
          o('the difference between say and tell', 'say 和 tell 的区别'),
          o('the difference between make and do', 'make 和 do 的区别'),
          o('the difference between since and for', 'since 和 for 的区别'),
          o('the difference between much and many', 'much 和 many 的区别'),
          o('the difference between borrow and lend', 'borrow 和 lend 的区别'),
        ],
      },
      {
        key: 'tail',
        labelZh: '请求方式',
        options: [
          o('again', '再'),
          o('with an example', '举个例子'),
          o('in simple English', '用简单的英语'),
          o('one more time', '再一次'),
        ],
      },
    ],
    grammar: ['question-inversion'],
    scene: 'study',
    level: 2,
    examples: [
      o('Sorry, could you explain the difference between say and tell again?', '不好意思，你能再解释一下 say 和 tell 的区别吗？'),
      o('Teacher, could you explain the difference between much and many with an example?', '老师，你能举个例子解释一下 much 和 many 的区别吗？'),
      o('Excuse me, could you explain the difference between borrow and lend in simple English?', '打扰一下，你能用简单的英语解释一下 borrow 和 lend 的区别吗？'),
    ],
    tipZh:
      'the difference between A and B = A 和 B 的区别。请对方换一种讲法，可以加 with an example（举个例子）或 in simple English（用简单的英语）。',
    source: 'seed',
  },

  // ---------- f100 表达学习上的遗憾 ----------
  {
    id: 'f100',
    title: '表达学习上的遗憾',
    pattern: '{opener} I wish I could {skill}, but {obstacle}.',
    patternZh: '{opener}我真希望自己能{skill}，但{obstacle}。',
    slots: [
      {
        key: 'opener',
        labelZh: '开场白',
        options: [
          o('Honestly,', '说实话，'),
          o('Sometimes', '有时候'),
          o('To be honest,', '老实说，'),
          o('Frankly,', '坦白说，'),
        ],
      },
      {
        key: 'skill',
        labelZh: '想做到的事',
        options: [
          o('speak English more fluently', '把英语说得更流利'),
          o('give presentations in English', '用英语做演讲'),
          o('chat with foreigners without panicking', '跟外国人聊天时不慌张'),
          o('answer questions quickly in English', '快速用英语回答问题'),
        ],
      },
      {
        key: 'obstacle',
        labelZh: '障碍',
        options: [
          o("I'm too shy", '我太害羞了'),
          o('I get nervous easily', '我很容易紧张'),
          o("I don't have enough time to practise", '我没有足够的时间练习'),
          o('my vocabulary is too small', '我的词汇量太小了'),
        ],
      },
    ],
    grammar: ['modal-must'],
    scene: 'study',
    level: 3,
    examples: [
      o("Honestly, I wish I could speak English more fluently, but I'm too shy.", '说实话，我真希望自己能把英语说得更流利，但我太害羞了。'),
      o('Sometimes I wish I could give presentations in English, but I get nervous easily.', '有时候我真希望自己能用英语做演讲，但我很容易紧张。'),
      o('Frankly, I wish I could chat with foreigners without panicking, but my vocabulary is too small.', '坦白说，我真希望自己能跟外国人聊天时不慌张，但我的词汇量太小了。'),
    ],
    tipZh:
      'I wish I could + 动词原形 表达“要是我能……就好了”（现实中做不到）。wish 后面的 could 是对现在的遗憾，不要用 can。后面的 but 说明原因。',
    source: 'seed',
  },
];
