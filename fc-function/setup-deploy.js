#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 配置阿里云CLI和Serverless Devs');

// 读取OSS配置文件
const configPath = path.join(__dirname, 'oss-config.json');
if (!fs.existsSync(configPath)) {
    console.error('❌ 找不到配置文件: oss-config.json');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const {
    region,
    bucket,
    accessKeyId,
    accessKeySecret,
    endpoint,
    folder
} = config;

console.log('📋 配置信息:');
console.log(`   区域: ${region}`);
console.log(`   存储桶: ${bucket}`);
console.log(`   文件夹: ${folder}`);
console.log(`   端点: ${endpoint}`);
console.log(`   AccessKey ID: ${accessKeyId.substring(0, 8)}...`);

// 创建阿里云CLI配置目录
const aliyunDir = path.join(process.env.HOME || process.env.USERPROFILE, '.aliyun');
if (!fs.existsSync(aliyunDir)) {
    fs.mkdirSync(aliyunDir, { recursive: true });
}

// 写入阿里云CLI配置
const aliyunConfig = {
    current: "default",
    profiles: [{
        name: "default",
        mode: "AK",
        access_key_id: accessKeyId,
        access_key_secret: accessKeySecret,
        region_id: region,
        output_format: "json"
    }]
};

fs.writeFileSync(
    path.join(aliyunDir, 'config.json'),
    JSON.stringify(aliyunConfig, null, 2)
);
console.log('✅ 阿里云CLI配置完成');

// 创建Serverless Devs配置目录
const sDir = path.join(process.env.HOME || process.env.USERPROFILE, '.s');
if (!fs.existsSync(sDir)) {
    fs.mkdirSync(sDir, { recursive: true });
}

// 写入Serverless Devs配置
const sConfig = {
    accounts: {
        default: {
            access: accessKeyId,
            secret: accessKeySecret,
            accountID: "YOUR_ACCOUNT_ID" // 需要用户填写
        }
    }
};

fs.writeFileSync(
    path.join(sDir, 'access.yaml'),
    `accounts:\n  default:\n    access: ${accessKeyId}\n    secret: ${accessKeySecret}\n    accountID: YOUR_ACCOUNT_ID\n`
);
console.log('✅ Serverless Devs配置完成');

// 验证阿里云CLI
try {
    console.log('\n🔍 验证阿里云CLI...');
    const identity = execSync('aliyun sts GetCallerIdentity', { encoding: 'utf8' });
    const identityData = JSON.parse(identity);
    console.log('✅ 阿里云CLI验证通过');
    console.log(`   Account ID: ${identityData.AccountId}`);
    
    // 更新Serverless Devs配置，填入正确的Account ID
    const updatedSConfig = {
        accounts: {
            default: {
                access: accessKeyId,
                secret: accessKeySecret,
                accountID: identityData.AccountId
            }
        }
    };
    
    fs.writeFileSync(
        path.join(sDir, 'access.yaml'),
        `accounts:\n  default:\n    access: ${accessKeyId}\n    secret: ${accessKeySecret}\n    accountID: ${identityData.AccountId}\n`
    );
    console.log('✅ Serverless Devs配置已更新Account ID');
    
} catch (error) {
    console.log('⚠️  阿里云CLI验证失败，但配置已写入');
    console.log('   请手动运行: aliyun sts GetCallerIdentity');
}

// 创建部署脚本
const deployScript = `#!/bin/bash

echo "🚀 部署到阿里云函数计算FC"

# 检查配置
if ! s config get >/dev/null 2>&1; then
    echo "❌ Serverless Devs未配置，请先运行: node setup-deploy.js"
    exit 1
fi

echo "✅ 配置检查通过"

# 部署
echo ""
echo "🚀 开始部署..."
s deploy

if [ \$? -eq 0 ]; then
    echo ""
    echo "🎉 部署成功！"
    echo ""
    echo "📋 函数信息:"
    s list
    
    echo ""
    echo "🔗 访问链接:"
    echo "   FC控制台: https://fc.console.aliyun.com/${region}/services"
    echo "   函数列表: https://fc.console.aliyun.com/${region}/services/poe2-translate-crawler-fc/functions/poe2-translate-crawler"
    
    echo ""
    echo "🧪 测试函数:"
    echo "   手动触发: s invoke"
    echo "   查看日志: s logs --follow"
else
    echo "❌ 部署失败"
    exit 1
fi
`;

fs.writeFileSync(path.join(__dirname, 'deploy-to-fc.sh'), deployScript);
fs.chmodSync(path.join(__dirname, 'deploy-to-fc.sh'), '755');

console.log('\n✅ 创建部署脚本: deploy-to-fc.sh');

// 输出下一步操作
console.log('\n📖 下一步:');
console.log('1. 运行部署: ./deploy-to-fc.sh');
console.log('2. 查看函数: https://fc.console.aliyun.com/' + region + '/services');
console.log('3. 手动测试: s invoke');
console.log('4. 查看日志: s logs --follow');

console.log('\n🎉 配置完成！');
console.log('📍 FC区域: ' + region);
console.log('🗂️  OSS存储桶: ' + bucket);
console.log('📁 OSS文件夹: ' + folder);