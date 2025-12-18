# 环境配置说明

## 概述
本项目支持开发环境和生产环境的分离，通过环境变量来区分不同环境的文件名和OSS路径。

## 环境配置文件

### .env 文件
```env
# 环境配置
NODE_ENV=dev
# NODE_ENV=production

# 开发环境文件后缀
DEV_SUFFIX=_dev

# OSS 存储路径配置
DEV_OSS_PATH=dev/
PROD_OSS_PATH=prod/
```

## 环境变量说明

| 变量 | 说明 | 开发环境默认值 | 生产环境默认值 |
|------|------|----------------|----------------|
| `NODE_ENV` | 环境标识 | `dev` | `production` |
| `DEV_SUFFIX` | 开发环境文件后缀 | `_dev` | - |
| `DEV_OSS_PATH` | 开发环境OSS路径 | `dev/` | - |
| `PROD_OSS_PATH` | 生产环境OSS路径 | - | `prod/` |

## 文件命名规则

### 开发环境 (NODE_ENV=dev)
- `all_ladders_dev.json`
- `all_data_full_dev.json` 
- `classes_dev.json`
- `class_list_dev.json`
- `ladders_temp_dev.json`

### 生产环境 (NODE_ENV=production)
- `all_ladders.json`
- `all_data_full.json`
- `classes.json`
- `class_list.json`
- `ladders_temp.json`

## OSS 路径规则

### 开发环境
```
poe2-ladders/dev/all_ladders_dev_20251217.json
poe2-ladders/dev/all_data_full_dev_20251217.json
poe2-ladders/dev/classes_dev.json
```

### 生产环境
```
poe2-ladders/prod/all_ladders_20251217.json
poe2-ladders/prod/all_data_full_20251217.json
poe2-ladders/prod/classes.json
```

## 使用方法

### 切换到开发环境
```bash
# 编辑 .env 文件
NODE_ENV=dev
```

### 切换到生产环境
```bash
# 编辑 .env 文件
NODE_ENV=production
```

### 运行脚本
```bash
# 开发环境运行
node run_full_process.js

# 生成开发环境文件，上传到 dev/ 路径
```

## 优势

1. **环境隔离**: 开发和生产数据完全分离
2. **避免冲突**: 开发测试不会影响生产数据
3. **灵活配置**: 可以自定义文件后缀和OSS路径
4. **易于调试**: 本地开发使用 _dev 后缀，一目了然

## 注意事项

1. 修改 .env 文件后需要重启脚本
2. OSS 配置文件 (oss-config.json) 环境共享
3. 上传日志会根据文件名自动识别环境
4. 建议本地开发始终使用 dev 环境