const DEFAULT_BROWSER_RESTART_INTERVAL = 3

function getBrowserRestartInterval({ value } = {}) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_BROWSER_RESTART_INTERVAL
}

function isRecoverableBrowserError(error) {
  const message = String(error && error.message ? error.message : error || '')
  return [
    'ProtocolError',
    'Protocol error',
    'timed out',
    'Target closed',
    'Session closed',
    'Connection closed',
    'Execution context was destroyed'
  ].some(fragment => message.includes(fragment))
}

module.exports = {
  DEFAULT_BROWSER_RESTART_INTERVAL,
  getBrowserRestartInterval,
  isRecoverableBrowserError
}
