/* Beachcombing · 赶海 — the Chinese text.
 * English lives in index.html and app.js as it always has; this file holds only the Chinese, keyed to the
 * data-i18n attributes in the page (html), their aria labels (aria), and the strings app.js builds (the rest).
 * The fonts are subset to exactly these characters (see _build/subset_zh.py), so rerun that after editing.
 */
window.BEACH_ZH = {
  title: "赶海 · Beachcombing",
  langButton: { en: "中文", zh: "EN" },
  langAria: { en: "切换到中文", zh: "Switch to English" },

  html: {
    wordmark: "赶海",
    specimens: "标本",
    notesOpen: "田野笔记",
    "gauge.0": "海滩",
    "gauge.1": "I · 拾贝",
    "gauge.2": "II · 晾晒",
    "gauge.3": "III · 学习",
    "gauge.4": "IV · 分拣",
    "gauge.5": "V · 铺陈",
    "gauge.6": "VI · 打磨",

    "hero.kicker": "在线作品 · 六个乐章",
    "hero.title": "赶海",
    "hero.lede": "潮水退去，海滩上留下了什么？",
    "hero.cue": "顺潮而下",

    "ch1.title": "拾贝",
    "ch1.text": "在图像档案里翻找，也是一种赶海。从一套公开的贝壳照片集（134 个物种）里，捡回<em>三百枚</em>：六十种，每种五枚，磕碰和伤痕一并留下。",
    "ch1.fine": "并非都来自海里，其中也有陆地和河里的蜗牛。",

    "ch2.title": "晾晒",
    "ch2.text": "摊在日光下晒着，颜色褪去，只剩形状。每张照片都化成一张<em>深度图</em>：越亮越近，越暗越远。从这里开始，一枚贝壳只用明暗来度量。",
    "ch2.fine": "Depth Anything V2 Small · 320 × 320 · 去除背景，用于生成浮雕",

    "ch3.title": "学习",
    "ch3.text1": "自编码器把每一块浮雕压缩成<em>六十四个数</em>，再试着只凭这六十四个数，把它重新还原出来。",
    "ch3.text2": "其中 <span id=\"n-train\">240</span> 枚用来训练，<span class=\"held\">红框里的 60 枚</span>留作检验。越过那条线，贝壳便以重建后的样子出现：形还在，磕碰的细节却被抹平了。",
    "ch3.caption": "训练 <span id=\"n-epochs\">80</span> 轮 · 检验误差下降 <b id=\"reduction\">94.5%</b>",
    "ch3.fine": "CNN · 输入 128 × 128 · 133 万参数 · 第 <span id=\"n-best\">71</span> 轮的模型最佳",

    "ch4.title": "分拣",
    "ch4.text": "六十四个数彼此相近的贝壳，被归到一起。<span class=\"nw\">k-means</span> 把它们分成<em>六堆</em>，看的是形状，不是名字。坐在每一堆正中的，是最能代表这一堆的那一枚。",
    "ch4.fine": "k-means，k = 6，基于标准化后的编码",

    "ch5.title": "铺陈",
    "ch5.text": "<span class=\"nw\">t-SNE</span> 把六十四维的数字摊平成一张地图：在编码里彼此相近的贝壳，在这里也挨在一起。深度变成了高度，每枚贝壳最高 <em>18 毫米</em>。",
    free: "自由",
    grid: "网格",

    "ch6.title": "打磨",

    raking: "侧光",
    top: "俯视",
    names: "名称",
    save: "保存图片",
    "finish.0": "<i class=\"sw contour\"></i>等高线",
    "finish.1": "<i class=\"sw line\"></i>线描",
    "finish.2": "<i class=\"sw cast\"></i>石膏",
    "finish.3": "<i class=\"sw fossil\"></i>化石",
    "finish.4": "<i class=\"sw nacre\"></i>螺钿",
    "finish.5": "<i class=\"sw rubbing\"></i>拓印",
    hint: "拖动可转动作品 · 向上滚动，沿着海滩往回走",
    specimenNo: "编号",

    "notes.kicker": "赶海",
    "notes.title": "田野笔记",
    "notes.intro": "这是一件关于数字手艺的小作品。AI 搜索代替了在海滩上的漫步；自编码器端详捡回来的东西，投影把它们一一摆开，几种材质研究为表面收尾。每一步都对应一门手艺，只是改由计算来完成。",
    "notes.collection": "收集",
    "notes.collectionText": "300 张照片（60 种 × 每种 5 个标本），出自 <a href=\"https://springernature.figshare.com/articles/dataset/134_shell_species_images/9122627\" target=\"_blank\" rel=\"noopener\">134 Shell Species Images</a> 数据集，CC0 授权。物种名沿用原始数据。",
    "notes.depth": "深度",
    "notes.depthText": "使用 Depth Anything V2 Small，输入为 320 × 320 的裁切图。这是从单张照片估计出的相对深度，并非实物扫描。生成浮雕之前，先用遮罩去掉了背景。",
    "notes.ae": "自编码器",
    "notes.aeText": "CNN，输入 128 × 128，64 维编码，133 万参数。训练集 240 张、检验集 60 张，训练 80 轮（CPU 上约四分半钟），第 71 轮在检验集上表现最好。检验误差（均方误差）从 0.069 降到 0.0038，下降了 94.5%。重建后的贝壳只出现在第三章；浮雕始终使用原始深度。",
    "notes.sorting": "分拣",
    "notes.sortingText": "在标准化后的编码上做 k-means（k = 6）。这六组是模型学到的视觉相似，并不是生物分类。作品最后的自由排列里，每组最大的那座岛都起了一个海图式的名字：名字是虚构的，分组和数量都是真实的。",
    "notes.layout": "排布",
    "notes.layoutText": "t-SNE（perplexity 30，k = 10 时 trustworthiness 为 <span id=\"trust\">0.96</span>）。<b>自由</b>：贝壳保留原始坐标，落在边长 2100 毫米的范围内，每枚 97 毫米，z = Σ 18·depth（毫米），呈现为海中的群岛；Rhino 模型另加 6 毫米底座。<b>网格</b>：18 × 18 块边长 100 毫米的方砖，各带 6 毫米底座，用线性分配求出位置；300 块放着贝壳，24 格空着。屏幕上的浮雕高度放大了 2 倍，便于观看。",
    "notes.finishes": "材质",
    "notes.finishesText": "同一张高度场，六种实时着色器：等高线、线描、石膏、化石、螺钿、拓印。它们是材质研究，不是对加工工艺的模拟。",
    "notes.credit": "何宜东 Yidong He · Quantitative Aesthetics，第 4 次作业 · 2026<br>使用 three.js（MIT）· 西文字体 <a href=\"https://github.com/Interstices-/GapSans\" target=\"_blank\" rel=\"noopener\">Gap Sans</a>，Interstices 设计（SIL OFL 1.1）· 中文字体 <a href=\"https://github.com/TakWolf/fusion-pixel-font\" target=\"_blank\" rel=\"noopener\">缝合像素</a>（TakWolf）、<a href=\"https://github.com/welai/glow-sans\" target=\"_blank\" rel=\"noopener\">未来荧黑</a>（Celestial Phineas），均为 SIL OFL 1.1",

    "veil.sub": "潮水正在涌来……",
    noscript: "这件作品需要 JavaScript 和 WebGL 才能观看。",
  },

  aria: {
    stage: "可交互的三维作品：一片铺满贝壳的数字海滩",
    chapters: "章节",
    knob: "在故事中的位置",
    codec: "自编码器：128 × 128 的深度图压缩为 64 个数，再还原回来",
    loss: "80 轮训练中，训练误差与检验误差的变化",
    arrangement: "排列方式",
    finishes: "表面材质",
    close: "关闭",
  },

  noWebGL: "这件作品需要 WebGL，当前浏览器无法使用。",
  layoutFree: "自由排列：贝壳留在 t-SNE 原本的位置，连成一片群岛；彼此重叠的地方，高度相加。",
  layoutGrid: "网格排列：同样的贝壳排进 18 × 18 块边长 100 毫米的方砖，300 块放着贝壳，24 块空着。",
  tideStill: "让潮水停下",
  tideRun: "让潮水继续",
  scanNumbers: "个数",
  shells: (n) => `${n} 枚`,
  groupOf: (roman) => `第 ${roman} 组`,
  heldOut: "检验",
  training: "训练",
  loss: { axis: "误差（对数）", best: "最佳", training: "训练", heldOut: "检验" },

  // in the order of FINISHES in app.js
  finishes: [
    { name: "等高线", text: "当作一张群岛海图来读：每升高 2 毫米一条线，每 10 毫米加粗一条。" },
    { name: "线描", text: "褐墨钢笔，照铜版画的路数：先勾外形，再描肋纹，暗处用排线压下去。" },
    { name: "石膏", text: "一块石膏翻模，洁白而沉静。所有颜色都退成了阴影。" },
    { name: "化石", text: "压进深色的石头里，再沿边剔出一道槽，就像修复师把化石从页岩中一点点清理出来。" },
    { name: "螺钿", text: "螺钿嵌入黑漆：取自贝壳的光泽，又回到了贝壳身上。" },
    { name: "拓印", text: "鱼拓的做法：普鲁士蓝的墨，轻轻拍在湿棉布上。只有凸起的地方，才吃得上颜色。" },
  ],

  // the six groups, in cluster order
  groups: ["螺塔", "卵形", "圆贝", "扁平", "阔口", "盘旋"],

  // the islands' chart names, in cluster order
  isles: [
    { name: "尖塔之境", text: "又高又瘦的螺塔，一圈圈往上旋，全都朝同一个方向歪着。" },
    { name: "椭圆岛", text: "背面光滑，圆得像鸟蛋：宝螺、芋螺都在这里，连长着刺的骨螺，在这里也被读成了椭圆。" },
    { name: "圆贝王国", text: "一枚枚扇形、心形，肋纹从壳顶一直放射到边缘：扇贝、鸟蛤和各种蛤蜊。", minor: "远圆诸岛" },
    { name: "低地", text: "又宽又扁，几乎不隆起：鲍鱼、笠螺和核果螺，都紧贴着地面。" },
    { name: "阔口海岸", text: "这里的贝壳都张着口，宽大的壳口朝向天空。" },
    { name: "盘旋要塞", text: "壳盘得紧紧的，像日晷螺那样，一圈又一圈绕回自身。" },
  ],
  minorIsle: (n) => `同一类贝壳的另一片海岸：${n} 枚落在了远处。`,
};
