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

## Course membership and individual purchases

The public catalog and sample can deploy independently. GitHub Pages must never
receive the private training ZIP, its full MP4s, or any server credentials.

1. In an active Supabase project, apply the migration and deploy the
   bookspark-members Edge Function. Configure Auth email delivery and allow
   the exact BookSpark learning-page redirect. This function verifies users
   with Supabase Auth and verifies Stripe webhook signatures itself.
2. Upload the six MP4s, six VTTs, and six Markdown lesson files from
   BookSpark-training-videos.zip to the root of the private
   bookspark-courses bucket. Preserve filenames. The public catalog contains
   only titles and goals.
3. In a Stripe sandbox, configure a $15 USD monthly price and one USD
   one-time price per course, along with the hosted Customer Portal and terms
   URL. Add a webhook destination at the Edge Function URL plus /webhook for
   all types in watchedEvents. Confirm your tax treatment and finalized
   customer terms before moving from sandbox to live.
4. Set BOOKSPARK_ORIGIN, BOOKSPARK_STRIPE_MODE (sandbox or live),
   BOOKSPARK_STRIPE_KEY (restricted key), BOOKSPARK_STRIPE_WEBHOOK_SECRET,
   BOOKSPARK_MEMBERSHIP_PRICE, and BOOKSPARK_COURSE_PRICES (JSON object mapping
   every slug in member-catalog.json to the corresponding Stripe price).
   Store credentials only in Edge Function secrets. Set
   BOOKSPARK_CHECKOUT_ENABLED=true in sandbox when contents are loaded.
   Configure members.js with the test project's public URL and publishable
   key in a test deployment. Leave production configuration blank until
   launch checks pass.
5. Verify email sign-in, monthly purchase, one-time purchase, locked course
   access, incomplete payment, duplicate webhook, refund, failed renewal,
   cancellation, private playback, captions, download, and sign-out. Confirm
   the live account and environment separately before enabling production.

The signed webhook records lifecycle events. Library and playback requests
resolve access from Stripe's latest state and issue new ten-minute asset
links for entitled users only. A link already issued lasts until its expiry.
Membership unlocks all six modules as soon as payment clears. A one-time
purchase unlocks the selected course. No release scheduler is needed for
immediate access. Future lesson releases require additional prepared material.

### Assessments and completion certificates

Apply both migrations before deploying the membership function. After private
playback and the exercise, the learner records their own completion and can
take the five-question BookSpark assessment. The server checks paid access and
grades the answers. A score of four or higher earns one saved certificate per
learner and module. The certificate is a BookSpark completion record. It is not
an accredited or Oracle credential. Paid activation checks should include
passing, failing, retrying, and reopening the certificate as the same learner.

### Deploying Ask BookSpark from GitHub

Add the Cloudflare account ID, a Cloudflare API token scoped to the designated
Workers account, and a dedicated OpenAI project API key as GitHub Actions
repository secrets. Name them CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN,
and OPENAI_API_KEY. The deployment job puts the model key in Worker secrets.
The public website should contain only the HTTPS endpoint, never credentials.

Run the **Deploy Ask BookSpark** workflow from main. Enter the public Worker
URL in the form https://bookspark-assistant.<workers-subdomain>.workers.dev/ask.
Cloudflare workers.dev must be configured for the account. The workflow makes
one actual OpenAI request to confirm a nonempty response. It can incur API
usage. After it passes, set ASK_ENDPOINT in ask-bookspark.js to this verified
URL and publish the site. Retest the site with one help-guide question and a
different question that only the AI backend can answer.
