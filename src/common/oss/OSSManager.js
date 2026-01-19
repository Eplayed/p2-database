const OSS = require('ali-oss');
const fs = require('fs');
const path = require('path');

class OSSManager {
    constructor(config) {
        // 支持传入 config 对象，或者从 process.env 读取
        this.config = {
            region: config?.region || process.env.OSS_REGION,
            accessKeyId: config?.accessKeyId || process.env.OSS_ACCESS_KEY_ID,
            accessKeySecret: config?.accessKeySecret || process.env.OSS_ACCESS_KEY_SECRET,
            bucket: config?.bucket || process.env.OSS_BUCKET
        };

        // 简单的校验
        if (!this.config.accessKeyId || !this.config.accessKeySecret) {
            console.warn('⚠️ OSS credentials not found in config or environment variables.');
        } else {
            try {
                this.client = new OSS(this.config);
            } catch (e) {
                console.error('❌ OSS Initialization failed:', e.message);
            }
        }
    }

    /**
     * 上传单个文件
     * @param {string} localPath 本地文件绝对路径
     * @param {string} remotePath OSS 远程路径
     */
    async uploadFile(localPath, remotePath) {
        if (!this.client) return false;
        try {
            await this.client.put(remotePath, localPath);
            return true;
        } catch (e) {
            console.error(`❌ Upload failed for ${remotePath}:`, e.message);
            return false;
        }
    }

    /**
     * 递归上传文件夹
     * @param {string} localDir 本地目录
     * @param {string} remotePrefix 远程前缀 (e.g. "poe2/data/")
     * @param {function} filterFn 过滤函数 (fileFullPath) => boolean
     */
    async uploadDir(localDir, remotePrefix, filterFn = null) {
        if (!this.client) return 0;
        if (!fs.existsSync(localDir)) {
            console.error(`❌ Directory not found: ${localDir}`);
            return 0;
        }

        const files = this._getAllFiles(localDir);
        const filesToUpload = filterFn ? files.filter(filterFn) : files;

        console.log(`🚀 Uploading ${filesToUpload.length} files from ${localDir} to ${remotePrefix}`);

        let successCount = 0;
        for (const localPath of filesToUpload) {
            const relativePath = path.relative(localDir, localPath).split(path.sep).join('/');
            const remotePath = `${remotePrefix}${relativePath}`;
            
            const success = await this.uploadFile(localPath, remotePath);
            if (success) {
                successCount++;
                if (successCount % 10 === 0) process.stdout.write('.');
            }
        }
        console.log(`\n✅ Upload complete: ${successCount}/${filesToUpload.length}`);
        return successCount;
    }

    _getAllFiles(dirPath, arrayOfFiles = []) {
        const files = fs.readdirSync(dirPath);
        files.forEach((file) => {
            if (file === '.DS_Store') return;
            const fullPath = path.join(dirPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                this._getAllFiles(fullPath, arrayOfFiles);
            } else {
                arrayOfFiles.push(fullPath);
            }
        });
        return arrayOfFiles;
    }
}

module.exports = OSSManager;
