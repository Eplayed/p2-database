# 阿里云函数FC Web函数部署指南

## 函数说明

### 1. fc-get-classes.js
- **功能**: 获取classes.json中的所有职业数据
- **HTTP方法**: GET
- **返回格式**: JSON
- **响应结构**:
```json
{
  "success": true,
  "data": [...], // classes.json中的数组数据
  "count": 10
}
```

### 2. fc-get-class-by-name.js
- **功能**: 通过职业名称获取对应职业的详细数据
- **HTTP方法**: GET
- **参数**: name (职业名称)
- **返回格式**: JSON
- **响应结构**:
```json
{
  "success": true,
  "name": "Shaman",
  "count": 100,
  "data": [...] // 对应职业的JSON数据
}
```

## 部署步骤

### 1. 创建函数目录结构
```
your-fc-project/
├── src/
│   ├── get-classes/
│   │   └── index.js (复制 fc-get-classes.js 内容)
│   └── get-class-by-name/
│       └── index.js (复制 fc-get-class-by-name.js 内容)
├── data/
│   ├── classes.json
│   ├── Amazon.json
│   ├── BloodMage.json
│   ├── Shaman.json
│   └── ... (其他职业JSON文件)
└── template.yml
```

### 2. 创建template.yml
```yaml
ROSTemplateFormatVersion: '2015-09-01'
Transform: Aliyun::Serverless-2018-04-03
Resources:
  fc-service:
    Type: Aliyun::Serverless::Service
    Properties:
      Description: PoE2 Class Data API
    Functions:
      get-classes:
        Type: Aliyun::Serverless::Function
        Properties:
          Description: Get all classes data
          Handler: index.handler
          Runtime: nodejs14
          CodeUri: ./src/get-classes
          MemorySize: 128
          Timeout: 10
          Events:
            httpTrigger:
              Type: HTTP
              Properties:
                AuthType: ANONYMOUS
                Methods: ['GET', 'POST', 'OPTIONS']
      
      get-class-by-name:
        Type: Aliyun::Serverless::Function
        Properties:
          Description: Get class data by name
          Handler: index.handler
          Runtime: nodejs14
          CodeUri: ./src/get-class-by-name
          MemorySize: 128
          Timeout: 10
          Events:
            httpTrigger:
              Type: HTTP
              Properties:
                AuthType: ANONYMOUS
                Methods: ['GET', 'POST', 'OPTIONS']
```

### 3. 部署命令
```bash
# 安装阿里云CLI并配置
npm install @alicloud/fc2 -g

# 部署到阿里云FC
s deploy --template template.yml
```

## API使用方式

### 获取所有职业列表
```
GET https://your-service-url.get-classes
```

### 通过名称获取职业数据
```
GET https://your-service-url.get-class-by-name?name=Shaman
GET https://your-service-url.get-class-by-name/Shaman
```

### 支持的职业名称
- Shaman
- Pathfinder  
- Oracle
- Stormweaver
- Amazon
- Blood Mage
- Deadeye
- Invoker
- Lich
- Disciple of Varashta

## 注意事项

1. **文件路径**: 确保data目录与函数代码在同一层级
2. **CORS配置**: 函数已配置CORS头部，支持跨域访问
3. **错误处理**: 包含完善的错误处理和友好的错误信息
4. **特殊字符**: 支持文件名中包含空格和特殊字符的职业名