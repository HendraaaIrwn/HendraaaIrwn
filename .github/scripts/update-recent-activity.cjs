const fs = require('node:fs')

const README_PATH = 'README.md'
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
}
