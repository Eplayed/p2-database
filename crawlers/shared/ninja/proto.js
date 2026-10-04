/**
 * poe.ninja builds 接口的 protobuf 读取。
 *
 * 为什么不用 protobufjs 写死 schema：他们的响应没有公开 .proto，而且实测是「按列存」的结构
 * （每列一个字段数组），写死 schema 一旦上游新增字段就会整体解错。这里只做通用遍历，
 * 再按实测确认过的字段号取值，字段含义见 docs/POE1_DATA_PIPELINE.md 的「poe.ninja builds 接入」。
 *
 * 实测结构（poe1 / poe2 字段号一致）：
 *   外层            1 -> SearchResult
 *   SearchResult    1: total(varint)  6: 字典引用{1:id,2:hash}  7/8: 字段定义
 *                   12: 列{1:列名, 2:类型, 7:字符串值[], 6:打包整数值[], 8:其他值[]}
 *   Dictionary      1: 字典id  2: 字符串值[]  3: 属性{1:属性id, 2:值[]}
 */

function readVarint(buffer, cursor) {
  let result = 0
  let shift = 0
  let byte
  do {
    if (cursor.i >= buffer.length) throw new Error('protobuf 读取越界（varint）')
    byte = buffer[cursor.i++]
    result += (byte & 0x7f) * Math.pow(2, shift)
    shift += 7
  } while (byte & 0x80)
  return result
}

/**
 * 遍历一段消息，返回 [{field, wire, value|start+length}]。
 * 支持 legacy group（wire 3/4）：poe.ninja 的 search 响应里字段 10 就是 group，
 * 不认识它就会在这里断掉，并丢掉排在它后面的列数据（字段 12）。
 */
function readFields(buffer, start, end, stopGroupField) {
  const fields = []
  let i = start
  while (i < end) {
    const cursor = { i }
    const tag = readVarint(buffer, cursor)
    i = cursor.i
    const field = Math.floor(tag / 8)
    const wire = tag % 8
    if (wire === 4) {
      // 结束分组：交回给上一层
      return { fields, next: i }
    }
    if (wire === 3) {
      const bodyStart = i
      const sub = readFields(buffer, bodyStart, end, field)
      fields.push({ field, wire, start: bodyStart, length: sub.next - bodyStart })
      i = sub.next
    } else if (wire === 0) {
      const valueCursor = { i }
      const value = readVarint(buffer, valueCursor)
      i = valueCursor.i
      fields.push({ field, wire, value })
    } else if (wire === 2) {
      const lengthCursor = { i }
      const length = readVarint(buffer, lengthCursor)
      i = lengthCursor.i
      if (i + length > end) throw new Error('protobuf 读取越界（bytes）')
      fields.push({ field, wire, start: i, length })
      i += length
    } else if (wire === 5) {
      fields.push({ field, wire, value: buffer.readUInt32LE(i) })
      i += 4
    } else if (wire === 1) {
      fields.push({ field, wire, value: Number(buffer.readDoubleLE(i)) })
      i += 8
    } else {
      throw new Error(`不支持的 protobuf wire 类型 ${wire}（字段 ${field}，偏移 ${i - 1}）`)
    }
  }
  return { fields, next: i }
}

/** 只要字段列表的便捷包装 */
function listFields(buffer, start, end) {
  return readFields(buffer, start, end).fields
}

const asText = (buffer, entry) => buffer.subarray(entry.start, entry.start + entry.length).toString('utf8')

/** 打包 repeated 整数字段（wire=2 里塞多个 varint） */
function readPackedVarints(buffer, entry) {
  const values = []
  let i = entry.start
  const end = entry.start + entry.length
  while (i < end) {
    const cursor = { i }
    values.push(readVarint(buffer, cursor))
    i = cursor.i
  }
  return values
}

function groupByField(fields) {
  const groups = {}
  fields.forEach(entry => {
    if (!groups[entry.field]) groups[entry.field] = []
    groups[entry.field].push(entry)
  })
  return groups
}

/**
 * 解析榜单 search 响应。
 * @param {Buffer} buffer 原始 protobuf 字节
 * @returns {{total: number, columns: Array, dictionaries: Array}}
 */
function decodeSearch(buffer) {
  const outer = listFields(buffer, 0, buffer.length)
  const body = outer.find(entry => entry.field === 1 && entry.wire === 2)
  if (!body) throw new Error('search 响应缺少外层结果体')
  const inner = listFields(buffer, body.start, body.start + body.length)
  const totalEntry = inner.find(entry => entry.field === 1)

  const columns = inner
    .filter(entry => entry.field === 12)
    .map(entry => {
      const groups = groupByField(listFields(buffer, entry.start, entry.start + entry.length))
      const id = groups[1] ? asText(buffer, groups[1][0]) : ''
      const type = groups[2] ? asText(buffer, groups[2][0]) : ''
      const strings = (groups[7] || []).map(item => (item.length === 0 ? '' : asText(buffer, item)))
      const numbers = (groups[6] || []).length && groups[6][0].wire === 2
        ? readPackedVarints(buffer, groups[6][0])
        : (groups[6] || []).map(item => item.value).filter(v => v !== undefined)
      return { id, type, strings, numbers, raw: groups }
    })
    .filter(column => column.id)

  const dictionaries = inner
    .filter(entry => entry.field === 6)
    .map(entry => {
      const groups = groupByField(listFields(buffer, entry.start, entry.start + entry.length))
      return {
        id: groups[1] ? asText(buffer, groups[1][0]) : '',
        hash: groups[2] ? asText(buffer, groups[2][0]) : ''
      }
    })
    .filter(item => item.id && item.hash)

  return { total: totalEntry ? totalEntry.value : 0, columns, dictionaries }
}

/**
 * 解析字典响应：列里存的是下标，要靠它还原成名称。
 * @param {Buffer} buffer 原始 protobuf 字节
 * @returns {{id: string, values: string[], properties: Object}}
 */
function decodeDictionary(buffer) {
  const fields = listFields(buffer, 0, buffer.length)
  const groups = groupByField(fields)
  const properties = {}
  ;(groups[3] || []).forEach(entry => {
    const sub = groupByField(listFields(buffer, entry.start, entry.start + entry.length))
    if (!sub[1]) return
    const key = asText(buffer, sub[1][0])
    properties[key] = (sub[2] || []).map(item => asText(buffer, item))
  })
  return {
    id: groups[1] ? asText(buffer, groups[1][0]) : '',
    values: (groups[2] || []).map(item => asText(buffer, item)),
    properties
  }
}

module.exports = { decodeSearch, decodeDictionary, readFields, listFields, readVarint }
