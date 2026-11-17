# Reading cards: evaluation

A reading card answers one question at a glance: what can I take from this note? The model writes one sentence in Chinese and English; the program decides the post format (text, image, video), the author and the date, and checks every card before it is saved.

## Program checks (deterministic)

- One finished sentence: Chinese at most 50 characters ending in 。！？, English at most 30 words ending in . ! ?; no ellipsis. A card that does not fit is rejected and regenerated, never trimmed.
- Does not open by describing the post ("This post", "The author describes", "本文", "这篇", "作者介绍").
- Evidence is an exact sentence from the saved text with at least 10 letters or characters (not a heading or label).
- Provenance notes and the cut build-time excerpt of the X sample are removed before the model sees the text.
- Format, author and date come from the record. Video posts always carry "Video post · Folio read only the text".

## Fixed set (12 notes)

X: text prompt post (Review a UI), video with a described method (Curate interaction experiments), video with a blank cover (Dashboard cards), research announcement (Pyrite), opportunity (Research roles), course link (Stanford agents course). RedNote: recruitment (Twiddle), platform contest promo (Vibe Coding income), shared prompt (Gemini3 avatar), opinion (designers learning vibe coding), resume method (AI resume), question post (Figma then Codex).

Pass: a reader can tell what to take from the note, the card stays within the text, keeps the author's stance and the specifics that identify it. Partial: correct but loses who/what or blurs meaning. Fail: invents a claim, turns a personal practice into advice, or writes a card for a promotion.

## Version 1 · 2026-11-14 · gpt-4.1-mini

Run by `node --env-file=.env.local tools/generate-cards.mjs eval`. All 12 passed the program checks; manual review below.

| # | Note | Result | Note on the output |
| --- | --- | --- | --- |
| 1 | Review a UI across screen sizes | Pass | |
| 2 | Curate generated interaction experiments | Partial | zh says "generate experiment rules"; en says "user preferences" for the author's own taste |
| 3 | Dashboard cards surface a chosen metric | Partial | drops Vercel, so the example has no source |
| 4 | Pyrite | Pass | |
| 5 | Research roles in collaborative intelligence | Partial | zh drops Diyi Yang and adds an unclear "提升技能" |
| 6 | Stanford agents course | Pass | |
| 7 | Twiddle internships | Partial | the three roles are not named; evidence is a label line |
| 8 | Vibe Coding income title, contest promo body | Fail | a platform contest notice became a card; should be insufficient |
| 9 | Gemini3 avatar prompt | Pass | evidence is the label "👉Prompt" |
| 10 | Why designers should learn vibe coding | Partial | the author's opinion is stated as fact |
| 11 | AI-assisted resume writing | Partial | "use the author's method" although the method is not in the text |
| 12 | Figma first, then Codex | Fail | turns the author's own workflow into advice and adds "more stable" |

3 pass, 7 partial, 2 fail.

Changes drafted for version 2 after this review (superseded by the owner review below): keep the author's stance for opinions, workflows and questions; never add benefits the text does not state; keep the source (person, team, product) and short lists; platform contests and promotions are insufficient; the evidence must be a full supporting sentence (program check: at least 10 letters or characters).

### Owner review of version 1 (Xiaofan Ma)

Reviewed blind on a review page (the model reviewer's grades were hidden).

| # | Note | Owner | Owner's comment |
| --- | --- | --- | --- |
| 1 | Review a UI across screen sizes | Partial | Why lead with "review"? The post is a prompt technique |
| 2 | Curate generated interaction experiments | Partial | It is an interaction-design technique that reflects personal taste |
| 3 | Dashboard cards | Pass | |
| 4 | Pyrite | Pass | |
| 5 | Research roles | Pass | |
| 6 | Stanford agents course | Pass | |
| 7 | Twiddle internships | Pass | |
| 8 | Contest promo | Pass | |
| 9 | Gemini3 avatar prompt | Pass | |
| 10 | Designers learning vibe coding | Pass | |
| 11 | AI-assisted resume writing | Partial | Lead with "for career switchers: a third-party view to find project highlights" |
| 12 | Figma then Codex | Fail | Summarise the person's question and point to the comments; the card only restated the title as advice |

8 pass, 3 partial, 1 fail. The two reviews agree on #2, #11 and #12 and disagree on six notes.

What the disagreement changed:

- The model reviewer graded accuracy (source named, stance kept) and missed that cards #1, #2 and #11 do not say what kind of resource the note is. The owner reads a card first for its kind. Version 2 starts every card with the kind ("提示词：", "交互设计方法：", "提问：", "活动通知：") and, when the note names an audience, leads with it.
- The owner passed the contest card: an honest card lets her skip the note at a glance. The drafted rule that turned promotions into "insufficient" (no card) was withdrawn; promotions now get a plain card saying what they are and that the text holds no method.
- Question posts state the question and that the discussion is in the comments, which Folio has not read.
- Naming the source and writing "the author argues" stay in the rules but are no longer reasons for a lower grade.
- Length limits rose to fit the kind prefix: prompt 45 Chinese characters / 28 words; program limit 56 / 34.

Pass criterion from version 2 on: the card names the kind of resource, gives the point a reader can act on, stays within the text, and leaves nothing for the reader to guess.

## Version 2 · 2026-11-14 · gpt-4.1-mini

Rules after the owner review of version 1: kind first, audience first when the note names one, question posts point to the comments, promotions get an honest card. All 12 passed the program checks.

| # | Note | Owner | Model reviewer | Owner's comment / reviewer note |
| --- | --- | --- | --- | --- |
| 1 | Review a UI across screen sizes | Fail | Fail | still "Method: UI review…"; the only sign that this is a prompt ("Good prompt to polish your app") sat in the cut excerpt that version 1 removed from the model's input |
| 2 | Curate generated interaction experiments | Partial | Partial | owner: "build the collection from the liked examples", not "keep only the liked examples"; reviewer: "视频：" used as the kind |
| 3 | Dashboard cards | Pass | Partial | reviewer: "视频：" as kind; filler "简洁呈现关注内容" |
| 4 | Pyrite | Pass | Partial | reviewer: "视频：" as kind |
| 5 | Research roles | Pass | Pass | |
| 6 | Stanford agents course | Partial | Pass | owner: keep only "Stanford opens a course on building agents" |
| 7 | Twiddle internships | Pass | Partial | reviewer: evidence is the label line "目前开放这几个实习岗位：" |
| 8 | Contest promo | Pass | Pass | |
| 9 | Gemini3 avatar prompt | Pass | Pass | |
| 10 | Designers learning vibe coding | Partial | Partial | owner: drop "非转行开发"; reviewer: an opinion labelled "method" |
| 11 | AI-assisted resume writing | Pass | Pass | fixed from version 1 |
| 12 | Figma then Codex | Pass | Pass | fixed from version 1 |

Owner: 8 pass, 3 partial, 1 fail (same count as version 1, different notes). Question posts and audience-first notes are fixed; the new failures are cards that say too much and a kind taken from the post format.

Changes for version 3:

- Data flow: the cut opening of an X post is kept in the model's input, labelled "Post opening (cut short in the source)", so the model can tell a prompt post from a method post. Readers still never see the cut line.
- One point only, about 15 to 35 Chinese characters (never more than 45) or 22 English words. Drop co-teachers, what the thing is not, restated benefits and filler; keep the organisation or product that identifies the item.
- The kind is what the content is, never the post format. Program check rejects cards that start with "视频：", "图片：", "Video:" or "Image:".
- "观点：/Opinion:" added as a kind. Keep the relation between steps the text states.
- Program check rejects evidence that ends with a colon (a label line).

## Version 3 · 2026-11-14 · gpt-4.1-mini

Reviewed by the model reviewer only; two failures and three regressions were clear enough to fix before asking the owner.

| # | Note | Result | Note |
| --- | --- | --- | --- |
| 1 | Review a UI | Fail | still "方法：" although the post opening now says "Good prompt…" |
| 2 | Curate interaction experiments | Partial | kind fixed ("方法"), but brevity dropped "the liked examples build a taste library", the point the owner asked for |
| 3 | Dashboard cards | Pass | "视频：" gone |
| 4 | Pyrite | Pass | "研究：" |
| 5 | Research roles | Partial | dropped Diyi Yang; unclear "协作智能提升技能" |
| 6 | Stanford agents course | Pass | matches the owner's wording |
| 7 | Twiddle internships | Failed | the new label check rejected "目前开放这几个实习岗位：" on all three attempts; the roles below it were separate one-line passages, too short to cite |
| 8 | Contest promo | Pass | |
| 9 | Gemini3 avatar prompt | Failed | same cause: "👉Prompt" was a separate label passage |
| 10 | Designers learning vibe coding | Pass | "观点：作者认为…" and the negation clause is gone |
| 11 | AI-assisted resume writing | Partial | regression: lost "a third-party view to find project highlights" |
| 12 | Figma then Codex | Partial | regression: Chinese card no longer points to the comments |

Changes for version 4:

- Program: quotable passages are built by `evidenceOptions`; a label line is joined with the lines under it into one exact span of the source, and a date like "10.30" no longer splits a sentence. The stricter evidence check now has passages that can pass it.
- Program: a question card must mention the comments (评论 / comment).
- Instructions: the one point is the one a reader needs to decide whether to open the note (for a method, what it produces or is for; for an audience note, the audience and the core idea); keep the person who makes the offer; when the text or opening calls it a prompt, the kind is 提示词/Prompt.

## Version 4 · 2026-11-14 · gpt-4.1-mini

All 12 passed the program checks on the first attempt (versions 1 to 3 needed retries; version 3 failed two notes).

Owner: 12 pass. Model reviewer: 9 pass, 3 partial (logged, not acted on, since the owner passed them):

- #1 still labelled "方法" although the post calls itself a prompt; the owner accepts it.
- #4 a research announcement labelled "观点" (opinion): a wrong kind, to watch in the full run.
- #6 names Diyi Yang, which the owner asked to drop in version 2; the version 4 rule "keep the person who makes the offer" brought it back. The owner passed it.

Owner results across versions: v1 8 / 3 / 1, v2 8 / 3 / 1, v4 12 / 0 / 0 (pass / partial / fail; v3 not owner-reviewed). Next: generate all 200 cards with version 4, then check the kinds and lengths across the whole set and spot-check a sample the eval did not cover.

## Full run with version 4 · 2026-11-15 · 200 notes

`tools/generate-cards.mjs build`: X 100 ready; RedNote 79 ready and 21 insufficient (all 21 screened by the program for too little body text, none by the model). 6 program rejections in total, all regenerated. Chinese cards 19 to 48 characters (mean 31); English 9 to 21 words.

A spot check of 20 notes outside the evaluation set found the content mostly accurate. The full run showed a problem the 12-note set could not: the kind labels drifted. X used 23 different labels and RedNote 24 ("招聘", "招聘通知", "招聘信息", "实习招聘" for the same kind; "视频教程", "视频案例" carrying the post format; "方法观点"). Some kinds were wrong: motion-design advice as "观点", an illustration prompt as "方法", a PNAS paper as "观点". Some English cards had no kind. Under the version 5 rules, 70 of the 179 ready cards (X 32, RedNote 38) would be rejected.

Lesson: a fixed evaluation set checks quality one card at a time; consistency across a whole library only shows in the full run.

Changes for version 5:

- A closed list of twelve kinds with a one-line definition each: 提示词 Prompt, 方法 Method, 工具 Tool, 案例 Example, 研究 Research, 观点 Opinion, 资源 Resource, 课程 Course, 招聘 Hiring, 经验 Experience, 提问 Question, 活动 Event. Advice stays a method even when stated as a view; a paper or benchmark is research; a post that names a prompt is a prompt.
- Program check: every card starts with a kind from the list, and the Chinese and English cards name the same kind. Anything else is regenerated.

## Full run with version 5 · 2026-11-15 · 200 notes

Run by Codex after its source enrichment: 18 RedNote notes that had too little text were supplemented with labelled image-text (OCR) and speech-transcript excerpts, and their cards were written under version 5 and reviewed. The build kept those 18 and regenerated the rest; a few cards needed targeted retries or a correction to the required kind prefix (see CHANGES.md). The three notes with no recoverable text show an owner-approved overview, marked as such, not a model card.

Result: 197 model cards, every one starting with one of the twelve kinds and passing the program checks (X uses 10 kinds, RedNote all 12). Chinese 20 to 49 characters (mean 31). The mislabels found in the version 4 run are fixed: motion advice is now 方法, the PNAS paper 研究, the illustration prompt 提示词.

On the 12-note set, compared with version 4 (all passed by the owner): the kind is now right on #3 (案例), #4 (研究) and #8 (活动). Two cards slipped although their rules did not change: #11 lost "a third-party view to find project highlights", and #12 is no longer written as a question. This is run-to-run variation of the model; one run per version cannot separate the effect of a rule change from chance. Owner review of version 5: pending.
