# BookSpark Daily Brief deployment

This update targets the root of svinnakota84/book-spark-academy. Copy the
included files over the matching paths on main. Keep the repository's CNAME
and existing assets. The archive contains a hidden .github directory.

In repository Settings → Pages, set the publishing source to GitHub Actions
if it currently uses a branch. Run “Publish BookSpark Daily Brief” once from
the Actions tab and confirm that the build and deploy jobs succeed. Then
open the homepage and My Learning and confirm the same headlines load on both
pages. Scheduled runs at minutes 13 and 43 generate the shared JSON and deploy
it with the rest of the site. GitHub can delay scheduled runs.

Source links remain available when the feed cannot be loaded. Partial feed
failures display a status. If all approved feeds fail, the job publishes an empty edition with an
unavailable status. The workflow log records source and article checks.
The existing My Learning page is a public preview. Customer sign-in and
subscription access require a separate authentication integration.

To check the feed locally:
  python3 scripts/refresh-news.py daily-brief.json
  python3 -m http.server 8000
Open http://localhost:8000/ and /learning.html over HTTP.

## Ask BookSpark

Deploy assistant-worker as a Cloudflare Worker with Wrangler 4.36 or later.
From that directory, set OPENAI_API_KEY as a Worker secret using
`wrangler secret put OPENAI_API_KEY`, then run `wrangler deploy`.
Use an OpenAI API project dedicated to this assistant. Review its usage and
limits before enabling the public form. API calls can incur usage charges.
Never put the API key in repository files or browser JavaScript.

Set ASK_ENDPOINT in ask-bookspark.js to the deployed Worker HTTPS URL
ending in /ask. Keep SITE_ORIGIN set to the exact production BookSpark origin.
Deploy the Pages update, then ask a general question and a current-events
question. Verify the response and the current-events source links.

The Worker rate-limits by client IP. This is a public assistant. The site
does not have authenticated customer sessions or account-specific answers.
Questions are sent to OpenAI for processing.
