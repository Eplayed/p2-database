const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getBrowserRestartInterval,
  isRecoverableBrowserError
} = require('../auto_browser/puppeteer_resilience')

test('本地和 CI 默认每 3 个职业重启浏览器', () => {
  assert.equal(getBrowserRestartInterval({ isCI: false }), 3)
  assert.equal(getBrowserRestartInterval({ isCI: true }), 3)
})

test('允许用环境变量调整浏览器重启间隔，并拒绝非法值', () => {
  assert.equal(getBrowserRestartInterval({ value: '2' }), 2)
  assert.equal(getBrowserRestartInterval({ value: '0' }), 3)
  assert.equal(getBrowserRestartInterval({ value: 'abc' }), 3)
})

test('识别需要重建浏览器会话的 Puppeteer 协议错误', () => {
  assert.equal(isRecoverableBrowserError(new Error('Page.addScriptToEvaluateOnNewDocument timed out')), true)
  assert.equal(isRecoverableBrowserError(new Error('Protocol error (Runtime.callFunctionOn): Target closed')), true)
  assert.equal(isRecoverableBrowserError(new Error('普通字段翻译失败')), false)
})
