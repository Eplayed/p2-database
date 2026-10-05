/**
 * 天赋树指纹。
 *
 * 用途：判断一个角色的天赋树相对上次抓取有没有变。截图是整条天梯链里最慢的一步
 * （每个角色要开一次页面、等渲染、拍 canvas），而绝大多数角色的树每天并不变，
 * 有了指纹就能直接复用上一次的图，只给真的改过或新上榜的角色开浏览器。
 *
 * 只按 passiveSelection（点亮的节点编号）+ 树版本算，不看装备和技能：
 * 换装备不会改变天赋树，不该触发重拍。
 */

function djb2Hash(value) {
  const text = String(value)
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) & 0xffffffff
  }
  hash >>>= 0
  return `00000000${hash.toString(16)}`.slice(-8)
}

/**
 * @param {Object} character poe.ninja 角色详情
 * @returns {string} 8 位十六进制指纹；拿不到节点时返回空串（表示无法判断，必须重拍）
 */
function passiveTreeHash(character) {
  const selection = Array.isArray(character && character.passiveSelection) ? character.passiveSelection : []
  if (!selection.length) return ''
  const sorted = selection.slice().sort((left, right) => Number(left) - Number(right))
  return djb2Hash(`${(character && character.passiveTreeName) || ''}|${sorted.join(',')}`)
}

module.exports = { djb2Hash, passiveTreeHash }
