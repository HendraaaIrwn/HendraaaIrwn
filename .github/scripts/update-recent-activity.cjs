const fs = require('node:fs')

const README_PATH = 'README.md'
const WAKATIME_CARD_PATH = 'assets/wakatime.svg'
const ACTIVITY_START = '<!--RECENT_ACTIVITY:start-->'
const ACTIVITY_END = '<!--RECENT_ACTIVITY:end-->'
const UPDATE_START = '<!--RECENT_ACTIVITY:last_update-->'
const UPDATE_END = '<!--RECENT_ACTIVITY:last_update_end-->'

function replaceSection(content, startMarker, endMarker, body) {
  const start = content.indexOf(startMarker)
  const end = content.indexOf(endMarker)

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Missing or invalid README markers: ${startMarker} / ${endMarker}`)
  }

  const before = content.slice(0, start + startMarker.length)
  const after = content.slice(end)

  return `${before}\n${body}\n${after}`
}

function repositoryLink(repository) {
  return `[${repository}](https://github.com/${repository})`
}

function eventLine(event) {
  const repository = repositoryLink(event.repo.name)
  const payload = event.payload || {}

  switch (event.type) {
    case 'PushEvent': {
      const count = payload.size || payload.commits?.length || 1
      return `⬆️ Pushed ${count} commit${count === 1 ? '' : 's'} to ${repository}`
    }
    case 'CreateEvent':
      return `📦 Created ${payload.ref_type || 'something new'} in ${repository}`
    case 'WatchEvent':
      return `⭐ Starred ${repository}`
    case 'ForkEvent':
      return `🍴 Forked ${repository}`
    case 'PullRequestEvent': {
      const number = payload.number
      const url = payload.pull_request?.html_url
      const pullRequest = number && url ? `[#${number}](${url})` : 'a pull request'
      return `🔀 ${payload.action || 'Updated'} ${pullRequest} in ${repository}`
    }
    case 'IssuesEvent': {
      const number = payload.issue?.number
      const url = payload.issue?.html_url
      const issue = number && url ? `[#${number}](${url})` : 'an issue'
      return `📝 ${payload.action || 'Updated'} ${issue} in ${repository}`
    }
    case 'ReleaseEvent': {
      const url = payload.release?.html_url
      const tag = payload.release?.tag_name || 'a release'
      const release = url ? `[${tag}](${url})` : tag
      return `🚀 Published ${release} in ${repository}`
    }
    default:
      return null
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function buildWakaTimeCard(stats) {
  const colors = ['#00e5ff', '#ff4ecd', '#a855f7', '#f9c74f', '#22c55e']
  const languages = (stats.languages || []).slice(0, 5)
  const rows = languages.map((language, index) => {
    const y = 62 + index * 40
    const percent = Math.max(0, Math.min(100, Number(language.percent) || 0))
    const width = Math.max(3, Math.round((percent / 100) * 300))
    const color = colors[index % colors.length]

    return `
      <text x="250" y="${y}" fill="#f8fafc" font-size="13" font-weight="600">${escapeXml(language.name)}</text>
      <text x="724" y="${y}" fill="#a5b4fc" font-size="12" text-anchor="end">${escapeXml(language.text)} · ${percent.toFixed(1)}%</text>
      <rect x="250" y="${y + 9}" width="300" height="8" rx="4" fill="#20263a" />
      <rect x="250" y="${y + 9}" width="${width}" height="8" rx="4" fill="${color}" />`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="270" viewBox="0 0 760 270" role="img" aria-labelledby="title description">
  <title id="title">WakaTime coding activity for the last seven days</title>
  <desc id="description">${escapeXml(stats.human_readable_total)} total coding time with a daily average of ${escapeXml(stats.human_readable_daily_average)}</desc>
  <defs>
    <linearGradient id="border" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00e5ff" />
      <stop offset="50%" stop-color="#a855f7" />
      <stop offset="100%" stop-color="#ff4ecd" />
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(104 36) rotate(39) scale(520 300)">
      <stop stop-color="#312e81" stop-opacity="0.65" />
      <stop offset="1" stop-color="#0d1117" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect x="1" y="1" width="758" height="268" rx="18" fill="#0d1117" stroke="url(#border)" stroke-width="2" />
  <rect x="2" y="2" width="756" height="266" rx="17" fill="url(#glow)" />
  <text x="28" y="34" fill="#00e5ff" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="700">WAKATIME · LAST 7 DAYS</text>
  <text x="28" y="91" fill="#ffffff" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="30" font-weight="800">${escapeXml(stats.human_readable_total)}</text>
  <text x="28" y="114" fill="#94a3b8" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12">TOTAL CODING TIME</text>
  <text x="28" y="169" fill="#ff4ecd" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="23" font-weight="700">${escapeXml(stats.human_readable_daily_average)}</text>
  <text x="28" y="191" fill="#94a3b8" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12">DAILY AVERAGE</text>
  <text x="28" y="242" fill="#a5b4fc" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11">wakatime.com/@neuhendra</text>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${rows}
  </g>
</svg>
`
}

async function updateWakaTimeCard(core) {
  const username = process.env.WAKATIME_USERNAME || 'neuhendra'

  try {
    const response = await fetch(`https://wakatime.com/api/v1/users/${username}/stats/last_7_days`)
    if (!response.ok) {
      throw new Error(`WakaTime responded with HTTP ${response.status}`)
    }

    const payload = await response.json()
    fs.mkdirSync('assets', { recursive: true })
    fs.writeFileSync(WAKATIME_CARD_PATH, buildWakaTimeCard(payload.data))
    core.info(`Updated public WakaTime card for ${username}.`)
  } catch (error) {
    core.warning(`WakaTime card was not updated: ${error.message}`)
  }
}

module.exports = async ({ github, context, core }) => {
  const username = context.repo.owner
  const response = await github.rest.activity.listPublicEventsForUser({
    username,
    per_page: 100,
  })

  const activity = response.data
    .map(eventLine)
    .filter(Boolean)
    .slice(0, 6)
    .map((line) => `- ${line}`)

  const activityBody = activity.length
    ? activity.join('\n')
    : '- No recent public activity found.'

  const lastUpdated = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date())

  let readme = fs.readFileSync(README_PATH, 'utf8')
  readme = replaceSection(readme, ACTIVITY_START, ACTIVITY_END, activityBody)
  readme = replaceSection(
    readme,
    UPDATE_START,
    UPDATE_END,
    `<sub>Last synced ${lastUpdated} · Asia/Jakarta</sub>`,
  )

  fs.writeFileSync(README_PATH, readme)
  core.info(`Updated ${activity.length} recent activity entries for ${username}.`)
  await updateWakaTimeCard(core)
}
