# 🔧 run_full_process.js 更新日志

## 📋 问题描述
在auto_browser目录下运行`run_full_process.js`时出现路径问题，脚本无法正确检测项目文件和执行命令。

## ✅ 修复内容

### 1. 路径检测优化
- **修复前**: 脚本无法在子目录中正确检测项目根目录文件
- **修复后**: 自动检测项目根目录，支持在任何子目录中运行

### 2. 文件检查逻辑增强
- **修复前**: 只检查固定路径的文件
- **修复后**: 支持检查多个位置的文件：
  - `auto_browser/class_list.json` (当前目录职业列表)
  - `ladder/data/classes.json` (ladder目录职业列表)
  - `all_ladders.json` (当前目录梯子数据)
  - 项目根目录的文件

### 3. 执行命令路径修正
- **修复前**: 在项目根目录执行所有命令
- **修复后**: 
  - `useRoot = true`: 在项目根目录执行
  - `useRoot = false`: 在当前目录执行
  - 根据脚本位置智能选择执行目录

### 4. 新增功能
- **强制刷新模式**: `--force` 参数重新获取所有数据
- **增量更新**: 默认模式，优先使用现有数据
- **智能配置检测**: 支持使用当前目录或项目根目录的OSS配置

## 🚀 使用方法

### 基本使用（增量更新）
```bash
cd auto_browser
node run_full_process.js
```

### 强制刷新所有数据
```bash
cd auto_browser
node run_full_process.js --force
```

### 查看帮助
```bash
cd auto_browser
node run_full_process.js -h
```

## 📁 文件检测逻辑

### 职业列表检测优先级
1. `auto_browser/class_list.json` (当前目录)
2. `ladder/data/classes.json` (ladder目录)

### 梯子数据检测优先级
1. `auto_browser/all_ladders.json` (当前目录)
2. 项目根目录的 `all_ladders.json`

### OSS配置检测优先级
1. `auto_browser/oss-config.json` (当前目录)
2. 项目根目录的 `oss-config.json`

## 🔧 执行流程

1. **环境检查**: 检测项目配置和OSS凭证
2. **职业列表获取**: 如果不存在，自动运行 `index.js` 获取
3. **梯子数据获取**: 优先使用 `auto_ladder.js`，备选 `get_all_ladders.js`
4. **OSS上传**: 上传生成的数据文件
5. **报告生成**: 生成详细的执行报告

## ✅ 测试结果

- ✅ 在auto_browser目录中正常运行
- ✅ 正确检测现有文件
- ✅ 智能获取缺失数据
- ✅ OSS配置文件正确检测
- ✅ 强制刷新模式正常工作

现在脚本已完全适配auto_browser目录的文件结构！