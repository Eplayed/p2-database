const fs = require('fs');
const path = require('path');

exports.handler = async (request, context) => {
    try {
        // 获取URL参数中的name值
        let name = '';
        
        // 从query string获取name参数
        if (request.queryString && request.queryString.name) {
            name = request.queryString.name;
        } 
        // 如果没有query参数，尝试从path获取
        else if (request.pathParameters && request.pathParameters.name) {
            name = request.pathParameters.name;
        }
        // 如果都没有，尝试解析URL路径
        else if (request.path) {
            const pathParts = request.path.split('/');
            name = pathParts[pathParts.length - 1];
        }

        if (!name) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'name parameter is required'
                })
            };
        }

        // 构建文件路径，支持文件名中的空格和特殊字符
        const fileName = name.endsWith('.json') ? name : `${name}.json`;
        const classDataPath = path.join(__dirname, 'data', fileName);
        
        // 如果直接路径不存在，尝试智能匹配
        if (!fs.existsSync(classDataPath)) {
            const dataDir = path.join(__dirname, 'data');
            const allFiles = fs.readdirSync(dataDir);
            
            // 尝试多种匹配策略
            const possibleMatches = [
                fileName, // 原始文件名
                name.replace(/\s+/g, '') + '.json', // 移除空格 (Blood Mage -> BloodMage)
                name.toLowerCase() + '.json', // 小写
                name.replace(/\s+/g, '').toLowerCase() + '.json', // 移除空格且小写
                name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '.json', // 移除特殊字符且小写
                name.replace(/\s+/g, '-').toLowerCase() + '.json', // 空格替换为连字符且小写
                name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.json' // 小写+空格转连字符+移除特殊字符
            ];
            
            let foundFile = null;
            for (const match of possibleMatches) {
                const fullPath = path.join(dataDir, match);
                if (fs.existsSync(fullPath)) {
                    foundFile = fullPath;
                    break;
                }
            }
            
            if (!foundFile) {
                return {
                    statusCode: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: `Class data file not found for name: ${name}`,
                        availableClasses: fs.readdirSync(dataDir)
                            .filter(file => file.endsWith('.json') && file !== 'classes.json')
                            .map(file => file.replace('.json', ''))
                    })
                };
            }
            
            // 使用找到的文件路径
            const classData = fs.readFileSync(foundFile, 'utf8');
            const parsedData = JSON.parse(classData);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                },
                body: JSON.stringify({
                    success: true,
                    name: name,
                    count: parsedData.length,
                    data: parsedData
                })
            };
        }

        const classData = fs.readFileSync(classDataPath, 'utf8');
        const parsedData = JSON.parse(classData);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify({
                success: true,
                name: name,
                count: parsedData.length,
                data: parsedData
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};