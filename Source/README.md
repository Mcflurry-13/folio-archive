# Folio source
Node.js 22 or newer. Start with `npm start` and open http://127.0.0.1:5180/. Run `npm test` for the offline unit suite. Sample data and images are included. Live AI requests require a configured server-side OPENAI_API_KEY. The deployed version is https://folio-archive.vercel.app/.

The task-agent instructions are in lib/prompts.mjs and the output checks are in lib/knowledge-agent.mjs. Fixed test inputs are in tools/fixtures/eval-library.json. With a configured local server running, node tools/eval-agent.mjs runs the five fixture tasks. The optional Playwright browser tests use the dev dependency in package-lock.json.
