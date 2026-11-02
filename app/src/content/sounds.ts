import type { SoundPattern } from '../types';

// S1: 40 种语流音变（美式英语 / General American），听辨 + 听写专项。
// 依据：Field 2008 —— 连读、弱读、吞音是“单词都认识却听不出来”的主要原因。
//
// heard 拼写约定（近似真实语速的听感，不是 IPA）：
//   gonna / wanna / gotta / hafta / dunno …… 通用缩读写法
//   ta / fer / uh / wuz / 'n ……………………… 弱读元音 /ə/
//   'im / 'er / 'em ………………………………… h、th 脱落
//   geddit / whadabout / lodda ……………… t 变闪音，听起来像 d
//   pi-kit-up / go-wout / she-yiz ……… 连在一起读的音节；w、y 是插入的过渡音
//   thir-TEEN / THIR-dee ………………… 大写 = 重读音节
//   can' / bu'n …………………………………… ' 表示被吞掉或喉塞的 t
// level：1 = 最常见、最影响听懂；3 = 较少见或更细的音变。

const ex = (en: string, zh: string, heard: string, target: string) => ({ en, zh, heard, target });

export const SOUNDS: SoundPattern[] = [
  // ================================================================ level 1 (14)
  {
    id: 's01',
    name: 'going to → gonna',
    kind: 'reduction',
    level: 1,
    explanationZh:
      '表示“将要做某事”的 going to 几乎总是读成 gonna /ˈɡʌnə/，听起来像一个词，to 只剩一个轻轻的 ə。听到“gonna + 动词”就是计划或预测；表示去某地的 going to the store 一般不缩。',
    examples: [
      ex("I'm going to call her tonight.", '我今晚要给她打电话。', "I'm gonna call her tonight.", 'going to call'),
      ex("It's going to rain this afternoon.", '今天下午要下雨。', "It's gonna rain this afternoon.", 'going to rain'),
      ex('What are you going to do?', '你打算怎么办？', "Whatcha gonna do?", 'you going to do'),
    ],
  },
  {
    id: 's02',
    name: 'want to → wanna',
    kind: 'reduction',
    level: 1,
    explanationZh:
      'want to 读成 wanna /ˈwɑnə/，t 消失，to 弱化成 ə，两个词连成一个。Do you want to 常变成 “d’ya wanna”，一听到 wanna 就知道后面接动词原形。',
    examples: [
      ex('I want to go home.', '我想回家。', 'I wanna go home.', 'want to'),
      ex('Do you want to grab some lunch?', '要不要一起吃个午饭？', "D'ya wanna grab some lunch?", 'want to grab'),
      ex("I don't want to wait.", '我不想等。', "I don't wanna wait.", 'want to wait'),
    ],
  },
  {
    id: 's03',
    name: 'to → /tə/ 弱读',
    kind: 'weak-form',
    level: 1,
    explanationZh:
      '句中的 to 几乎总是弱读成 /tə/，在元音后还会变成 /də/（need to → needa），又短又轻，初学者常以为它根本没说。听力里要习惯“动词和名词之间有个很轻的 ta/da”就是 to。',
    examples: [
      ex('I need to talk to you.', '我得跟你谈谈。', 'I needa talk ta you.', 'need to talk to'),
      ex("We're about to leave.", '我们正要走。', "We're about ta leave.", 'about to leave'),
      ex("It's ten to five.", '现在差十分钟五点。', "It's ten ta five.", 'ten to five'),
    ],
  },
  {
    id: 's04',
    name: 'can /kən/ vs can’t /kænt/',
    kind: 'weak-form',
    level: 1,
    explanationZh:
      '肯定句里的 can 不重读，读成 /kən/，几乎只有 kn；否定的 can’t 重读，元音饱满而且拖长 /kænt/，美式里末尾的 t 常听不见。分辨靠元音和重音：又短又轻是 can，又长又重是 can’t，也要结合上下文判断。',
    examples: [
      ex('I can come on Friday.', '我周五可以来。', "I k'n come on Friday.", 'can come'),
      ex("I can't come on Friday.", '我周五来不了。', "I CAN'T come on Friday.", "can't come"),
      ex("She can drive, but she can't park.", '她会开车，但不会停车。', "She k'n drive, but she CAN'T park.", "can drive, but she can't"),
    ],
  },
  {
    id: 's05',
    name: '辅音接元音连读 pick it up',
    kind: 'linking',
    level: 1,
    explanationZh:
      '前一个词以辅音结尾、后一个词以元音开头时，辅音“滑”到下一个词的开头：pick it up 听起来像 pi-ki-dup。不要按单词的边界切分，而要按音节去听。',
    examples: [
      ex('Can you pick it up?', '你能把它捡起来吗？', "Can ya pi-ki-dup?", 'pick it up'),
      ex('Turn it off before you leave.', '走之前把它关掉。', 'Tur-ni-doff before ya leave.', 'Turn it off'),
      ex('You should check it out.', '你应该去看看。', 'Ya shud che-ki-dout.', 'check it out'),
    ],
  },
  {
    id: 's06',
    name: 'I don’t know → I dunno',
    kind: 'reduction',
    level: 1,
    explanationZh:
      '说得快时 I don’t know 变成 I dunno /aɪ dəˈnoʊ/：don’t 里的 t 消失，元音变成 ə，整句只剩 “ai-də-no” 三拍。这是最高频的整句缩读之一，听到就是“我不知道”。',
    examples: [
      ex("I don't know what to say.", '我不知道该说什么。', 'I dunno whadda say.', "I don't know"),
      ex("I don't know him very well.", '我跟他不太熟。', "I dunno 'im very well.", "don't know him"),
      ex("Honestly, I don't know where it is.", '说实话，我不知道它在哪儿。', 'Honestly, I dunno where-ri-is.', "I don't know where"),
    ],
  },
  {
    id: 's07',
    name: '闪音 T/D：water, better',
    kind: 'flap',
    level: 1,
    explanationZh:
      '两个元音之间（重读音节之后）的 t、d 变成轻快的闪音 /ɾ/，听起来像一个很快的 d：water 像 wadder，better 像 bedder。听到 d 却找不到对应的拼写，多半就是 t。',
    examples: [
      ex('I need some water.', '我需要点水。', 'I need some wah-der.', 'some water'),
      ex("That's much better.", '这好多了。', "That's much beh-der.", 'much better'),
      ex("It's getting late.", '时间不早了。', "It's geh-ding late.", 'getting late'),
    ],
  },
  {
    id: 's08',
    name: 'got to → gotta',
    kind: 'reduction',
    level: 1,
    explanationZh:
      'got to 读成 gotta /ˈɡɑɾə/，t 变成闪音，to 弱化成 ə，I’ve got to 也就成了 I’ve gotta，表示“必须”。听到 gotta + 动词就是“得做某事”。',
    examples: [
      ex("I've got to go.", '我得走了。', "I've gotta go.", 'got to go'),
      ex("We've got to hurry.", '我们得快点。', "We've gotta hurry.", 'got to hurry'),
      ex("You've got to try this.", '你一定得尝尝这个。', "You've gotta try this.", 'got to try'),
    ],
  },
  {
    id: 's09',
    name: 'what do you → whaddya / what are you → whatcha',
    kind: 'reduction',
    level: 1,
    explanationZh:
      'What do you 读成 whaddya /ˈwʌɾjə/，What are you 读成 whatcha /ˈwʌtʃə/，t 与 you 的 y 融合成 “ch”。开头的 what 和结尾的 ya 之间几乎没有停顿，整个疑问句头像一个词。',
    examples: [
      ex('What do you want?', '你想要什么？', 'Whaddya want?', 'What do you want'),
      ex('What are you doing?', '你在干什么？', "Whatcha doin'?", 'What are you doing'),
      ex('What do you think?', '你怎么看？', 'Whaddya think?', 'What do you think'),
    ],
  },
  {
    id: 's10',
    name: 'you → ya',
    kind: 'reduction',
    level: 1,
    explanationZh:
      '不重读的 you 读成 /jə/，听起来像 ya，在 see you、Are you、How are you 中尤其明显。别等着听清晰的 /juː/，听到句中有个很轻的 ya 就是 you。',
    examples: [
      ex('How are you doing?', '你最近怎么样？', "How're ya doin'?", 'How are you'),
      ex("I'll see you tomorrow.", '明天见。', "I'll see ya tomorrow.", 'see you tomorrow'),
      ex('Are you ready?', '你准备好了吗？', 'Arya ready?', 'Are you ready'),
    ],
  },
  {
    id: 's11',
    name: 'and → /ən/ 弱读',
    kind: 'weak-form',
    level: 1,
    explanationZh:
      'and 弱读成 /ən/ 甚至只剩 /n/，d 消失：salt and pepper 听起来像 salt ’n’ pepper。听到两个词之间有个很轻的 n，那通常就是 and。',
    examples: [
      ex("I'll have a coffee and a bagel.", '我要一杯咖啡和一个贝果。', "I'll have a coffee 'n' a bagel.", 'coffee and a bagel'),
      ex('Salt and pepper, please.', '请给我盐和胡椒。', "Salt 'n' pepper, please.", 'Salt and pepper'),
      ex('Come in and sit down.', '进来坐吧。', "Come in 'n sit down.", 'in and sit'),
    ],
  },
  {
    id: 's12',
    name: 'of → /əv/ 弱读',
    kind: 'weak-form',
    level: 1,
    explanationZh:
      'of 弱读成 /əv/，在辅音前往往只剩 /ə/，cup of coffee 像 cuppa coffee；在元音前才会听到 v 并连到下一个词（sick of it → sick-uv-it）。它是两个词之间轻轻的一个 uh。',
    examples: [
      ex('I need a cup of coffee.', '我需要来杯咖啡。', 'I need a cuppa coffee.', 'cup of coffee'),
      ex('Most of my friends live nearby.', '我的朋友大多住在附近。', 'Mosta my friends live nearby.', 'Most of my'),
      ex("I'm sick of it.", '我受够了。', "I'm sick-uv-it.", 'sick of it'),
    ],
  },
  {
    id: 's13',
    name: 'for → /fər/ 弱读',
    kind: 'weak-form',
    level: 1,
    explanationZh:
      'for 弱读成 /fər/，元音变成 ə，只剩 f 加一个卷舌音，听起来像 fer。只有放在句末（What’s it for?）才会重读成 /fɔr/。',
    examples: [
      ex('Thanks for everything.', '谢谢你做的一切。', 'Thanks fer everything.', 'Thanks for everything'),
      ex('I waited for an hour.', '我等了一个小时。', 'I waited fer-an-our.', 'for an hour'),
      ex('This gift is for you.', '这份礼物是给你的。', 'This gift is fer ya.', 'is for you'),
    ],
  },
  {
    id: 's14',
    name: 'because → ’cause',
    kind: 'reduction',
    level: 1,
    explanationZh:
      'because 在口语里读成 ’cause /kəz/，常写成 cuz，开头的 be- 整个消失。句中听到一个很短的 cuz，后面接原因，就是“因为”。',
    examples: [
      ex('I stayed home because I was tired.', '我因为累所以待在家里。', 'I stayed home cuz I was tired.', 'because I was tired'),
      ex("I'm laughing because it's funny.", '我笑是因为它好笑。', "I'm laughing cuz it's funny.", "because it's funny"),
      ex('Why? Because I said so.', '为什么？因为我这么说。', 'Why? Cuz I said so.', 'Because I said so'),
    ],
  },

  // ================================================================ level 2 (14)
  {
    id: 's15',
    name: 'have to → hafta / has to → hasta',
    kind: 'reduction',
    level: 2,
    explanationZh:
      'have to 读成 hafta /ˈhæftə/，has to 读成 hasta /ˈhæstə/：后面清辅音 t 把 v、z 也“带清”成 f、s，to 弱化成 ə。听到 hafta/hasta 就是“必须”。',
    examples: [
      ex('I have to work late tonight.', '我今晚要加班。', 'I hafta work late tonight.', 'have to work'),
      ex('She has to leave early.', '她得早点走。', 'She hasta leave early.', 'has to leave'),
      ex('Do we have to go?', '我们非去不可吗？', 'Do we hafta go?', 'have to go'),
    ],
  },
  {
    id: 's16',
    name: 'give me → gimme',
    kind: 'reduction',
    level: 2,
    explanationZh:
      'give me 读成 gimme /ˈɡɪmi/，give 末尾的 v 被后面的 m 吞掉。常用来请求或要东西：Gimme a sec（等我一下）。',
    examples: [
      ex('Give me a second.', '等我一下。', 'Gimme a second.', 'Give me a second'),
      ex('Can you give me a hand?', '你能帮我一把吗？', "Can ya gimme a hand?", 'give me a hand'),
      ex('Just give me five minutes.', '再给我五分钟。', 'Just gimme five minutes.', 'give me five minutes'),
    ],
  },
  {
    id: 's17',
    name: 'let me → lemme',
    kind: 'reduction',
    level: 2,
    explanationZh:
      'let me 读成 lemme /ˈlɛmi/，t 被后面的 m 同化而消失。Lemme know、Lemme see、Lemme check 是固定搭配，听到句首的 lemme 就是 let me。',
    examples: [
      ex('Let me think about it.', '让我想想。', 'Lemme think about it.', 'Let me think'),
      ex('Let me know if you need anything.', '需要什么就告诉我。', 'Lemme know if ya need anything.', 'Let me know'),
      ex('Hold on, let me check.', '等一下，我查查看。', 'Hold on, lemme check.', 'let me check'),
    ],
  },
  {
    id: 's18',
    name: 'did you → didja',
    kind: 'assimilation',
    level: 2,
    explanationZh:
      'did you 中 d 与 you 的 y 融合成 /dʒ/，读成 didja /ˈdɪdʒə/，像一个词。疑问句开头听到 “didja” 就是 Did you…？',
    examples: [
      ex('Did you eat yet?', '你吃了吗？', 'Didja eat yet?', 'Did you eat'),
      ex('Did you hear the news?', '你听说那个消息了吗？', 'Didja hear the news?', 'Did you hear'),
      ex('Did you finish the report?', '你把报告写完了吗？', 'Didja finish the report?', 'Did you finish'),
    ],
  },
  {
    id: 's19',
    name: 'would you / could you → wouldja / couldja',
    kind: 'assimilation',
    level: 2,
    explanationZh:
      'would you、could you 里 d 与 y 融合成 /dʒ/，读成 wouldja /ˈwʊdʒə/、couldja /ˈkʊdʒə/。这是礼貌请求的开头，听到就知道对方在请你做事。',
    examples: [
      ex('Would you like some tea?', '你想喝点茶吗？', 'Wouldja like some tea?', 'Would you like'),
      ex('Could you close the window?', '你能把窗户关上吗？', 'Couldja close the window?', 'Could you close'),
      ex('Would you mind helping me?', '你介意帮我一下吗？', 'Wouldja mind helping me?', 'Would you mind'),
    ],
  },
  {
    id: 's20',
    name: 'should have → shoulda / could have → coulda / would have → woulda',
    kind: 'reduction',
    level: 2,
    explanationZh:
      '情态动词后的 have 弱读成 /ə/：should have → shoulda /ˈʃʊdə/，could have → coulda，would have → woulda，表示“本来应该／本来可以”。听起来像 should of，但 of 只是书写错误。',
    examples: [
      ex('I should have called you.', '我本该给你打电话的。', 'I shoulda called ya.', 'should have called'),
      ex('We could have taken the train.', '我们本来可以坐火车的。', 'We coulda taken the train.', 'could have taken'),
      ex("He would have helped if you'd asked.", '你要是开口，他会帮忙的。', "He woulda helped if ya'd asked.", 'would have helped'),
    ],
  },
  {
    id: 's21',
    name: 'them → ’em',
    kind: 'reduction',
    level: 2,
    explanationZh:
      '不重读的 them 读成 ’em /əm/，开头的 th 不发音，像是前一个动词的尾巴：tell ’em、call ’em。别把它听成 him。',
    examples: [
      ex('Just tell them the truth.', '就告诉他们实话吧。', "Just tell 'em the truth.", 'tell them the truth'),
      ex("I'll call them later.", '我待会儿给他们打电话。', "I'll call 'em later.", 'call them later'),
      ex("Let them know I'm late.", '告诉他们我会晚点到。', "Leh-dem know I'm late.", 'Let them know'),
    ],
  },
  {
    id: 's22',
    name: 'him / her 脱落 h：tell ’im',
    kind: 'weak-form',
    level: 2,
    explanationZh:
      '代词 him、her、his 不重读时 h 脱落，并与前一个词连在一起：tell him → tell ’im /tɛlɪm/，ask her → ask ’er /æskɚ/。动词后面多出一个很轻的 im 或 er，就是它们。',
    examples: [
      ex('Tell him I called.', '告诉他我来过电话。', "Tell 'im I called.", 'Tell him I called'),
      ex("I'll ask her tomorrow.", '我明天问问她。', "I'll ask 'er tomorrow.", 'ask her tomorrow'),
      ex('Did you give him the keys?', '你把钥匙给他了吗？', "Didja give 'im the keys?", 'give him the keys'),
    ],
  },
  {
    id: 's23',
    name: 'kind of → kinda / sort of → sorta',
    kind: 'reduction',
    level: 2,
    explanationZh:
      'kind of 读成 kinda /ˈkaɪndə/，sort of 读成 sorta /ˈsɔrɾə/，of 弱化成 ə。意思是“有点、有几分”，用来把话说得委婉。',
    examples: [
      ex("I'm kind of tired.", '我有点累。', "I'm kinda tired.", 'kind of tired'),
      ex("It's sort of expensive.", '这有点贵。', "It's sorta expensive.", 'sort of expensive'),
      ex('It was kind of weird.', '那有点怪。', 'It was kinda weird.', 'kind of weird'),
    ],
  },
  {
    id: 's24',
    name: 'T/D 吞音：next day, last night',
    kind: 'elision',
    level: 2,
    explanationZh:
      '词尾 t/d 夹在两个辅音之间时常被吞掉：last night → las’ night，next day → nex’ day，just moved → jus’ moved。你会听到辅音比拼写少，不要因为找不到 t 而卡住。',
    examples: [
      ex('I got home late last night.', '我昨晚很晚才到家。', 'I got home late las night.', 'last night'),
      ex('She called me the next day.', '她第二天给我打了电话。', 'She called me the nex day.', 'the next day'),
      ex('I just moved here.', '我刚搬来这里。', 'I jus moved here.', 'just moved here'),
    ],
  },
  {
    id: 's25',
    name: '跨词闪音：get it, what about, not at all',
    kind: 'flap',
    level: 2,
    explanationZh:
      '词尾的 t 后面接元音开头的词时，t 变成闪音，听起来像 d 并连到下一个词：get it → geddit，what about → whadabout，not at all → no-dadall。整串声音粘在一起，别按单词边界去切。',
    examples: [
      ex("I don't get it.", '我没明白。', "I don't geddit.", 'get it'),
      ex('What about tomorrow?', '明天怎么样？', 'Whadabout tomorrow?', 'What about tomorrow'),
      ex('Thanks. Not at all.', '谢谢。——不客气。', 'Thanks. No-dadall.', 'Not at all'),
    ],
  },
  {
    id: 's26',
    name: '元音接元音连读 /w/：go out, do it',
    kind: 'linking',
    level: 2,
    explanationZh:
      '词尾是 /oʊ/、/uː/、/aʊ/（圆唇）的词后接元音开头的词时，中间会滑出一个轻轻的 /w/：go out → go-wout，do it → doo-wit，who is → hoo-wiz。多出来的 w 不属于任何词。',
    examples: [
      ex("Let's go out for dinner.", '我们出去吃晚饭吧。', "Let's go-wout fer dinner.", 'go out for dinner'),
      ex('You can do it!', '你可以的！', "Ya k'n doo-wit!", 'can do it'),
      ex('Who is that guy?', '那个人是谁？', 'Hoo-wiz that guy?', 'Who is that'),
    ],
  },
  {
    id: 's27',
    name: '元音接元音连读 /j/：I asked, she is',
    kind: 'linking',
    level: 2,
    explanationZh:
      '词尾是 /i/、/eɪ/、/aɪ/（扁唇）的词后接元音开头的词时，中间会滑出一个轻轻的 /j/：I asked → I-yasked，she is → she-yiz，they are → they-yar。多出来的 y 不属于任何词。',
    examples: [
      ex('I asked her yesterday.', '我昨天问过她了。', "I-yasked 'er yesterday.", 'I asked her'),
      ex('She is waiting outside.', '她在外面等着。', 'She-yiz waiting outside.', 'She is waiting'),
      ex('They are late again.', '他们又迟到了。', 'They-yar late again.', 'They are late'),
    ],
  },
  {
    id: 's28',
    name: 'got you → gotcha / meet you → meetcha',
    kind: 'assimilation',
    level: 2,
    explanationZh:
      '词尾 t 与 you 的 y 融合成 /tʃ/：got you → gotcha，meet you → meetcha，get you → getcha。Gotcha 单独说就是“明白了”。',
    examples: [
      ex('Okay, got you.', '好，明白了。', 'Okay, gotcha.', 'got you'),
      ex('Nice to meet you.', '很高兴认识你。', 'Nice ta meetcha.', 'Nice to meet you'),
      ex("I'll get you there on time.", '我会准时送你到那儿。', "I'll getcha there on time.", 'get you there'),
    ],
  },

  // ================================================================ level 3 (12)
  {
    id: 's29',
    name: 'don’t you → dontcha',
    kind: 'assimilation',
    level: 3,
    explanationZh:
      'don’t you 中 t 与 y 融合成 /tʃ/，读成 dontcha /ˈdoʊntʃə/。常出现在反问和劝说里：Don’t you think…？ Why don’t you…？',
    examples: [
      ex("Don't you think it's too late?", '你不觉得太晚了吗？', "Dontcha think it's too late?", "Don't you think"),
      ex("Don't you want to come?", '你不想来吗？', 'Dontcha wanna come?', "Don't you want to"),
      ex("Why don't you ask him?", '你为什么不去问问他？', "Why dontcha ask 'im?", "don't you ask him"),
    ],
  },
  {
    id: 's30',
    name: 'where did you → where’dja',
    kind: 'assimilation',
    level: 3,
    explanationZh:
      '疑问词后的 did you 缩得更短，did 只剩 ’d，再和 you 融合成 /dʒ/：where did you → where’dja，how did you → how’dja，why did you → why’dja。听到 -dja 结尾就是 did you。',
    examples: [
      ex('Where did you go?', '你去哪儿了？', "Where'dja go?", 'Where did you go'),
      ex('How did you know?', '你怎么知道的？', "How'dja know?", 'How did you know'),
      ex('Why did you leave?', '你为什么离开？', "Why'dja leave?", 'Why did you leave'),
    ],
  },
  {
    id: 's31',
    name: 'out of → outta / a lot of → a lotta',
    kind: 'reduction',
    level: 3,
    explanationZh:
      'out of 读成 outta /ˈaʊɾə/，a lot of 读成 a lotta /ə ˈlɑɾə/：of 弱化成 ə，t 变成闪音。Get outta here（别开玩笑了）也是常用感叹。',
    examples: [
      ex('Get out of here!', '少来！／不会吧！', 'Get outta here!', 'out of here'),
      ex("I'm out of money.", '我没钱了。', "I'm outta money.", 'out of money'),
      ex("There's a lot of traffic today.", '今天车很多。', "There's a lotta traffic today.", 'a lot of traffic'),
    ],
  },
  {
    id: 's32',
    name: 'this year → thish year',
    kind: 'assimilation',
    level: 3,
    explanationZh:
      's 后面紧跟 y 时，两者融合成 /ʃ/：this year → thish year，miss you → mish you。听到词中冒出 sh，却没有 sh 的拼写，可能就是它。',
    examples: [
      ex("I'm moving this year.", '我今年要搬家。', "I'm moving thish year.", 'this year'),
      ex('I miss you so much.', '我好想你。', 'I mish you so much.', 'miss you so much'),
      ex("I haven't finished this yet.", '这个我还没做完。', "I haven't finished thish yet.", 'this yet'),
    ],
  },
  {
    id: 's33',
    name: 'used to → usta / supposed to → supposta',
    kind: 'reduction',
    level: 3,
    explanationZh:
      'used to 读成 usta /ˈjustə/，supposed to 读成 supposta，词尾 d 被吞掉，to 弱化。used to do（过去常常）和 be used to（习惯于）读音相同。',
    examples: [
      ex('I used to live in Boston.', '我以前住在波士顿。', 'I usta live in Boston.', 'used to live'),
      ex("We're supposed to meet at six.", '我们应该六点见面。', "We're supposta meet at six.", 'supposed to meet'),
      ex("I'm not used to this weather.", '我不习惯这种天气。', "I'm not usta this weather.", 'used to this weather'),
    ],
  },
  {
    id: 's34',
    name: 'was / were 弱读',
    kind: 'weak-form',
    level: 3,
    explanationZh:
      '不重读的 was 读成 /wəz/（像 wuz），were 读成 /wɚ/，元音都变成 ə，又轻又短，容易被当成没说。was a 常连成 wuza。',
    examples: [
      ex('I was at home.', '我当时在家。', 'I wuz-at home.', 'was at home'),
      ex('Where were you last night?', '你昨晚在哪儿？', 'Where wer ya las night?', 'were you last night'),
      ex('It was a great trip.', '那是一次很棒的旅行。', 'It wuza great trip.', 'was a great trip'),
    ],
  },
  {
    id: 's35',
    name: 'have / has 弱读：where’ve you',
    kind: 'weak-form',
    level: 3,
    explanationZh:
      '助动词 have 弱读成 /əv/，has 弱读成 /əz/ 甚至只剩 /z/（She’s already left），并粘在前一个词上：where have → where’ve，I have → I’ve。它几乎总是轻声，最容易漏听。',
    examples: [
      ex('Where have you been?', '你去哪儿了？', "Where'v ya been?", 'Where have you been'),
      ex('She has already left.', '她已经走了。', "She's already left.", 'has already left'),
      ex('I have no idea.', '我完全不知道。', "I'v no idea.", 'have no idea'),
    ],
  },
  {
    id: 's36',
    name: '数字重音：thirteen vs thirty',
    kind: 'reduction',
    level: 3,
    explanationZh:
      '-teen 的重音在后，thir-TEEN 尾音又长又清楚；-ty 的重音在前，THIR-dee 尾音轻短（t 变闪音）。听数字先判断重音位置：重音在后是 13、15、18，重音在前是 30、50、80。',
    examples: [
      ex('It costs thirteen dollars.', '这要十三美元。', 'It costs thir-TEEN dollars.', 'thirteen dollars'),
      ex('It costs thirty dollars.', '这要三十美元。', 'It costs THIR-dee dollars.', 'thirty dollars'),
      ex('Is it eighteen or eighty?', '是十八还是八十？', 'Is it ay-TEEN or AY-dee?', 'eighteen or eighty'),
    ],
  },
  {
    id: 's37',
    name: 'N 后吞 T：winter, internet',
    kind: 'elision',
    level: 3,
    explanationZh:
      '重读元音之后，n 和 t 相连时 t 常被吞掉：winter → winner，internet → innernet，twenty → twenny。听到的是 winner，其实说的是 winter，要靠上下文判断。',
    examples: [
      ex('It gets cold in winter.', '冬天会变冷。', 'It gets cold in winner.', 'cold in winter'),
      ex('The internet is down again.', '网又断了。', "The innernet is down again.", 'The internet is down'),
      ex("I'm twenty years old.", '我二十岁。', "I'm twenny years old.", 'twenty years old'),
    ],
  },
  {
    id: 's38',
    name: '喉塞音 T：button, can’t go',
    kind: 'elision',
    level: 3,
    explanationZh:
      't 出现在鼻音 n 之前，或在辅音之前的词尾，常变成喉塞音 /ʔ/，也就是喉咙突然一卡，不出 t 声：button → bu’n，mountain → moun’n，can’t go → can’ go，not sure → no’ sure。',
    examples: [
      ex("I can't go tonight.", '我今晚去不了。', "I can' go tonight.", "can't go tonight"),
      ex('Press the button.', '按下按钮。', "Press the bu'n.", 'the button'),
      ex('We climbed a mountain.', '我们爬了一座山。', "We climbed a moun'n.", 'a mountain'),
    ],
  },
  {
    id: 's39',
    name: '吞音节：probably, interesting, different',
    kind: 'reduction',
    level: 3,
    explanationZh:
      '多音节词中间不重读的音节常整个消失：probably → prob’ly，interesting → in’resting，different → diff’rent。词的节奏比拼写少一个音节，要按听到的音节数来辨认。',
    examples: [
      ex("I'll probably be late.", '我可能会晚到。', "I'll prob'ly be late.", 'probably be late'),
      ex("It's a really interesting story.", '这个故事真有意思。', "It's a really in'resting story.", 'interesting story'),
      ex("That's totally different.", '那完全不一样。', "That's totally diff'rent.", 'totally different'),
    ],
  },
  {
    id: 's40',
    name: '-ing → -in’',
    kind: 'reduction',
    level: 3,
    explanationZh:
      '词尾不重读的 -ing 常读成 -in’，ng 变成 n：working → workin’，running → runnin’。听到词尾只有一个轻轻的 n，而不是 -ing 的鼻音，很可能是同一个形式。',
    examples: [
      ex("I'm working on it.", '我正在处理。', "I'm workin' on it.", 'working on it'),
      ex("She's running late.", '她要迟到了。', "She's runnin' late.", 'running late'),
      ex("I'm thinking about quitting.", '我在考虑辞职。', "I'm thinkin' about quittin'.", 'thinking about quitting'),
    ],
  },
];
