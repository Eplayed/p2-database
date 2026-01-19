const envConfig = require('../config/env-config');
const OSSManager = require('../src/common/oss/OSSManager');
const fs = require('fs');
const path = require('path');

console.log('--- Integration Test ---');

// 1. Test env-config
console.log('1. Checking env-config...');
console.log('   Project Root:', envConfig.projectRoot);
console.log('   Data Root:', envConfig.dataRoot);
console.log('   Data Dir:', envConfig.dataDir);
if (envConfig.projectRoot && envConfig.dataRoot) {
    console.log('   ✅ env-config loaded correctly');
} else {
    console.error('   ❌ env-config failed');
}

// 2. Test OSSManager
console.log('\n2. Checking OSSManager...');
const ossManager = new OSSManager({
    region: 'oss-test',
    accessKeyId: 'test-id',
    accessKeySecret: 'test-secret',
    bucket: 'test-bucket'
});
if (ossManager.client) {
    console.log('   ✅ OSSManager initialized');
} else {
    console.log('   ⚠️ OSSManager failed (expected if no valid credentials)');
}

// 3. Test Dictionary Paths
console.log('\n3. Checking Dictionary Paths...');
const dictPath = path.join(__dirname, '../src/common/dictionaries/dist/dict_base.json');
if (fs.existsSync(dictPath)) {
    console.log('   ✅ Dictionary file found at:', dictPath);
} else {
    console.error('   ❌ Dictionary file NOT found at:', dictPath);
}

// 4. Test Crafting Data Paths
console.log('\n4. Checking Crafting Data Paths...');
const craftingDataPath = path.join(__dirname, '../src/processors/poe2-crafting/data/crafting_db.json');
if (fs.existsSync(craftingDataPath)) {
    console.log('   ✅ Crafting DB found');
} else {
    console.error('   ❌ Crafting DB NOT found');
}

console.log('\n--- End Test ---');
