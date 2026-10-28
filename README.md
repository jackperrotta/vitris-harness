# Vitrus Website Harness

Vitrus Website Harness gives a coding agent the context, design guidance, and checks to build distinctive websites. It includes a static site compiler, a template library, media tools, and an optional Cloudflare backend for leads, analytics, and owner administration. Each website lives in its own repository.

The package is [`@tryvitris/website-harness`](https://www.npmjs.com/package/@tryvitris/website-harness). Bring your own coding agent and Node.js 24 or newer. Generation normally ends with a verified local preview; Cloudflare launch is a separate, explicit step.

## Create a website

An optional separate business admin is available through `vitris admin setup|status|verify`; new-site `--admin` prepares follow-up instructions. See the [admin integration guide](docs/ADMIN.md) for pinned packages, local plan/apply, backend grants and the separate customer-account Cloudflare rollout.

```bash
npx --package @tryvitris/website-harness@1.0.0 vitris site create \
  --dir acme --slug acme --name "Acme Shop" \
  --from https://old-site.example --template "Still & Field" \
  --content-file ./acme-notes.md
cd acme
npm install
npx playwright install chromium
```

Replace the example values with your own. Use `--blank` instead of `--from` for a new site. `--template` accepts a catalog ID, name, or hosted preview URL; `--content` accepts supplied text directly. Both are optional. See the [CLI guide](docs/CLI.md) for input and media policies.

Open the **site directory** in your coding agent and ask it to build the site. It follows the site's `AGENTS.md` and the prepare → `agent/CURRENT.md` → work → complete loop until the local preview is ready. To start or resume manually, use `npm run go`; for a later change, use `npm run go -- --change "Describe the change"`.

To browse templates from a harness checkout, run `npm ci`, then `npm run templates:gallery` and open <http://127.0.0.1:4390/>. The gallery loads the hosted catalog. See the [template library guide](agent/refs/template-library.md) for creating and publishing templates.

## Built-in skills

The harness loads stage-specific instructions from [`agent/refs/`](agent/refs/) automatically. These are not installed agent slash commands: describe the work to your agent, and the workflow selects the relevant guidance. The creative workflow also has the following named skills; their prerequisites are included when needed.

| Skill | What it does |
| --- | --- |
| `business-positioning` | Ground the offer and distinguishing value in business evidence. |
| `narrative` | Organize the visitor journey, questions, and supporting proof. |
| `visual-research` | Adapt useful principles from visual references. |
| `art-direction` | Turn the central idea into a coherent visual direction. |
| `typography` | Establish readable, expressive type hierarchy. |
| `composition` | Shape page layout, rhythm, and visual priority. |
| `media-direction` | Select authentic imagery and identify media gaps. |
| `copy-layout` | Develop page copy and layout together. |
| `purposeful-interaction` | Choose interactions that help visitors act or decide. |
| `responsive-design` | Preserve hierarchy and usable controls across screen sizes. |
| `visual-critique` | Identify consequential visual weaknesses in rendered pages. |
| `visitor-journey` | Test whether visitors can complete intended tasks. |
| `motion-direction` | Plan useful movement and quiet intervals. |
| `motion-page` | Compose motion across each page's journey. |
| `motion-statistics` | Present supplied numbers accessibly, with motion where useful. |
| `motion-phrases` | Pace text without hiding essential copy. |
| `motion-choreography` | Coordinate imagery, captions, and process accents. |

For example, ask your agent to “improve the mobile layout,” “review the visitor journey,” or “adapt this template to the business.” The workflow includes additional guidance for template adaptation, copy, accessibility, SEO, browser checks, and launch. See the [workflow guide](agent/WORKFLOW.md) and [creative skill registry](src/agent/creative-skills.ts).

## Develop the harness

Customer sites build and verify locally, then upload the exact finished bundle directly to Cloudflare Pages. Use `npm run deploy:preview` for a hosted preview and `npm run deploy` for explicitly requested production publication. GitHub stores source; hosted deployment automation is opt-in. See [Cloudflare setup](docs/CLOUDFLARE.md) for new sites and migration of existing sites.

```bash
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run verify:package
```

For a local checkout, run `npm run build:cli` and create a sibling site with `--harness file:../vitris-harness`. See [distribution](docs/DISTRIBUTION.md) for package and upgrade details, and [official testing](docs/OFFICIAL-TEST.md) for frozen baselines.

## More information

- [Active-agent quickstart](docs/QUICKSTART.md) and [workflow guide](agent/WORKFLOW.md)
- [Cloudflare setup](docs/CLOUDFLARE.md), [contact forms](docs/CONTACT-FORMS.md), and [credential safety](docs/SECURITY.md)
- [Stock and customer media](docs/STOCK-MEDIA.md) and [icon guide](agent/refs/icons.md)
- [Evaluation protocol](agent/EVALUATION.md) and [CLI reference](docs/CLI.md)

MIT licensed. Hosted demonstrations and third-party media have their own license records; see [NOTICE](NOTICE).
