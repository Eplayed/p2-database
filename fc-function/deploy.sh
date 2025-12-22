#!/bin/bash

echo "📋 部署阿里云函数计算FC - 流放之路2翻译爬虫"
echo "=========================================="

# 检查工具是否安装
if ! command -v s &> /dev/null; then
    echo "❌ Serverless Devs工具未安装，请先安装："
    echo "npm install -g @serverless-devs/s"
    exit 1
fi

echo "✅ Serverless Devs工具已安装"

# 检查配置文件
if [ ! -f "oss-config.json" ]; then
    echo "❌ oss-config.json配置文件不存在"
    exit 1
fi

echo "✅ 配置文件存在"

# 提示用户配置阿里云账号
echo ""
echo "🔧 首次使用需要配置阿里云账号信息："
echo "1. AccessKey ID: $(cat oss-config.json | grep accessKeyId | cut -d'"' -f4)"
echo "2. AccessKey Secret: $(cat oss-config.json | grep accessKeySecret | cut -d'"' -f4)"
echo "3. Account ID: [需要从阿里云控制台获取]"
echo "4. 部署节点: 中国香港 (cn-hongkong)"
echo ""

read -p "是否现在配置阿里云账号？(y/n): " configure

if [ "$configure" = "y" ]; then
    echo "请按提示输入阿里云账号信息："
    s config add
fi

echo ""
echo "🚀 开始部署函数..."

# 尝试部署
if s deploy; then
    echo "✅ 部署成功！"
else
    echo "❌ 部署失败，请检查配置和权限"
    echo ""
    echo "💡 常见问题解决："
    echo "1. 确保已配置正确的阿里云账号"
    echo "2. 确保有FC函数计算和OSS存储权限"
    echo "3. 检查region是否正确"
fi