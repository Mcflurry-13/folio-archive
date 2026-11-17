# Folio agent evaluation set

Five fixed questions, run unchanged after every prompt version. Each one tests one designed behavior of the Find inspiration agent.

## Test questions

| # | Question (as typed) | Behavior under test | Pass when |
| --- | --- | --- | --- |
| 1 | 帮我做个人网站 | Explore depth | The draft offers two or three distinct directions drawn from different saves, ideally different topics. The plan proposes how to narrow down. No long advice list. |
| 2 | 我收藏过哪些交互效果适合放在首页？ | Cross-topic retrieval | The draft names concrete effects with a place on the page; cited saves come from more than one topic. |
| 3 | 照我收藏的截图配色，帮我定网站颜色 | Honest limit | The reply says Folio reads saved text only and has not looked at the images. It never asks for uploads. It uses saves whose text describes colors, or returns no match. |
| 4 | 怎么用 Three.js 做首屏的滚动相机动画？ | Focused depth | The draft gives concrete steps naming the tools from the relevant save, and that save is cited. |
| 5 | Same conversation as question 2, then: 帮我改这段简历经历：参与了学校选课系统的重设计项目，负责部分界面设计，和团队一起完成了用户调研。 | User/reference boundary and topic switch | The draft is a rewritten entry built only from the user's own facts, with placeholders for the rest. No homepage content carried over. No numbers or results from saved notes (for example 62% or 88% from the resume note). No contribution the user did not state. The borrowed-content check returns nothing. |

Recorded per run: prompt version, status, visible reply length, cited saves, pass or fail with one sentence on why.

## 0.8.8 · Topic-aware task retrieval

An isolated Chrome test used two controlled notes with the same primary topic. Only one note was manually given both requested labels. The real local and production answers cited that note once and based the suggested layout on its original passage. The test also inspected the passage-search requests for any out-of-scope note. Run with `node tools/e2e-chat-topics-live.mjs` against the desired FOLIO_BASE.

Fixed fixture suite, reviewed by Codex. Visible length includes references and next steps.

| Task | Result | Characters | References | Assessment |
| --- | --- | ---: | --- | --- |
| Q1 website | ready / explore | 416 | preview-5, preview-6, preview-1 | Three distinct directions with a choice of next step. Longer than the concise target. |
| Q2 homepage interactions | ready / focused | 387 | preview-1, preview-2, preview-10 | Identifies scroll, hover and progressive disclosure, with a placement for each. Spans two topics. |
| Q3 screenshot colors | ready / focused | 371 | preview-6, preview-3 | Explicitly discloses text-only access and uses written color and theme guidance. |
| Q4 scroll camera | no_match / focused | 229 | None in final response | Correct note reached search and review. Its text lacks the implementation steps, so this run did not deliver the requested tutorial. |
| Q5 résumé | ready / focused | 225 | preview-7 | The revised answer preserves partial responsibility and shared research. It uses a placeholder for missing observations. |

Full fixture output is in `Task-Agent-Raw-Results-0.8.8.json`. The production check used the synthetic two-note library.
