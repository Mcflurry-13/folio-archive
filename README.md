# Folio / Mini Me — Project Files

Xiaofan Ma · Technology Design Foundations · November 17, 2026

**Deployed prototype:** https://folio-archive.vercel.app/

**Repository:** https://github.com/Mcflurry-13/folio-archive

The current application source, tests and public sample assets are included in the Source folder for offline inspection.

Folio helps users turn saved references into material for a current creative task. Choose a public sample, ask a question, and inspect the source for each suggestion. Users can export selected references as a read-only bundle for a coding agent.

## System card versions

Start with **System-Cards/Current-System-Card.md**. The task agent uses folio-kb-0.8.8, the topic review validator uses folio-topic-review-3, and the reading-card generator uses cards-v5. The submission copy of the system card updates the older release-status labels against the final build records. The two files in Version-History show the original proposed behavior and a later snapshot before manual topic membership was added. Current executable instructions are in Source/lib/prompts.mjs.

## Evaluation set and results

- **Evaluation/Task-Agent-Evaluation.md** contains the five fixed questions, behavioral criteria and latest recorded results. Q4 found a relevant Three.js reference but the text lacked enough detail to produce the requested tutorial.
- **Source/tools/fixtures/eval-library.json** contains the controlled test library. **Evaluation/Task-Agent-Raw-Results-0.8.8.json** contains the recorded output.
- **Evaluation/Manual-Topic-Production-Test.json** records a live production-model check with controlled notes. Two overlapping manual topics matched one save. The returned reference appeared once and cited the saved text.
- **Evaluation/Reading-Card-Evaluation.md** contains the 12-note evaluation design and the v5 library-wide build results. The released samples include 197 generated cards and three user-approved overviews. Automated build checks and the owner’s qualitative review are reported separately; the v5 owner review is pending.
- **Evaluation/Unit-Test-Results.txt** records the offline unit suite run from the packaged source. This packaging check did not rerun paid language-model evaluations.

## Source and verification

See **Source/README.md** for local use. The demo returned HTTP 200 on the packaging check. The source snapshot is based on the deployed sample libraries. The public repository copy omits RedNote share-token parameters from sample URLs. The ZIP contains the public sample libraries; environment credentials and private evaluation archives are excluded.
