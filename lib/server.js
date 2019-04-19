const Slackbot = require('slackbots')
const pullhub = require('pullhub')
const messages = require('./messages')
const {
  isDirectMessage,
  isBotMessage,
  isMessage,
  isBotCommand
} = require('./helpers')

module.exports = function server () {
  const env = process.env
  const requiredEnvs = ['SLACK_TOKEN', 'GH_TOKEN', 'GH_REPOS']

  if (!requiredEnvs.every((k) => !!env[k])) {
    throw (
      new Error('Missing one of this required ENV vars: ' + requiredEnvs.join(','))
    )
  }

  const channels = env.SLACK_CHANNELS ? env.SLACK_CHANNELS.split(',') : []
  const groups = env.SLACK_GROUPS ? env.SLACK_GROUPS.split(',') : []
  const repos = env.GH_REPOS ? env.GH_REPOS.split(',') : []
  const labels = env.GH_LABELS
  const checkInterval = env.CHECK_INTERVAL || 3600000 // 1 hour default
  const daysToCheck = env.DAYS_TO_CHECK.split(",").map(Number) || [0,1,2,3,4,5,6,7] // [0,1,2,3,4,5,6,7] default
  const botParams = { icon_url: env.SLACK_BOT_ICON }

  const bot = new Slackbot({
    token: env.SLACK_TOKEN,
    name: env.SLACK_BOT_NAME || 'Pr. Police'
  })

  bot.on('start', () => {
    setInterval(() => {
      now = new Date();
      if (daysToCheck.includes(now.getDay())) {
        getPullRequests()
          .then(buildMessage)
          .then(notifyAllChannels)
      } else {
        console.log("I will no check for PR's today")
      }
    }, checkInterval)
  })

  bot.on('message', (data) => {
    if ((isMessage(data) && isBotCommand(data)) ||
      (isDirectMessage(data) && !isBotMessage(data))) {
      getPullRequests()
        .then(buildMessage)
        .then((message) => {
          bot.postMessage(data.channel, message, botParams)
        })
    }
  })

  bot.on('error', (err) => {
    console.error(err)
  })

  function getPullRequests () {
    console.log('Checking for pull requests...')

    return pullhub(repos, labels).catch((err) => { console.error(err) })
  }

  function buildMessage (data) {
    if (!data) {
      return Promise.resolve(messages.GITHUB_ERROR)
    }

    if (data.length < 1) {
      return Promise.resolve(messages.NO_PULL_REQUESTS)
    }

    const headers = [ messages.PR_LIST_HEADER, '\n' ]

    const message = data.map((item) => {
      return `:star: ${item.title} | ${item.html_url}`
    })

    return Promise.resolve(headers.concat(message).join('\n'))
  }

  function notifyAllChannels (message) {
    channels.map((channel) => {
      bot.postMessageToChannel(channel, message, botParams)
    })

    groups.map((group) => {
      bot.postMessageToGroup(group, message, botParams)
    })
  }
}
