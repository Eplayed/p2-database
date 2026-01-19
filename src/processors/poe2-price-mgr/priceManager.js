const fs = require('fs');
const path = require('path');

class PriceManager {
    constructor(dataFile = './prices.json') {
        this.dataFile = path.resolve(dataFile);
        this.data = this.loadData();
    }

    // 加载数据
    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const content = fs.readFileSync(this.dataFile, 'utf8');
                return JSON.parse(content);
            }
            return [];
        } catch (error) {
            console.error('加载数据失败:', error.message);
            return [];
        }
    }

    // 保存数据
    saveData() {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 4));
            console.log('数据保存成功');
            return true;
        } catch (error) {
            console.error('保存数据失败:', error.message);
            return false;
        }
    }

    // 添加新的历史记录
    addHistory(itemId, stationCode, yuan2count, count2yuan, date = null) {
        if (!date) {
            date = new Date().toISOString().split('T')[0]; // 默认今天
        }

        const newRecord = {
            yuan2count: parseFloat(yuan2count),
            count2yuan: parseFloat(count2yuan),
            date: date
        };

        // 查找或创建物品
        let item = this.data.find(i => i._id === itemId);
        if (!item) {
            item = { _id: itemId, station: [] };
            this.data.push(item);
        }

        // 查找或创建站点
        let station = item.station.find(s => s.code === stationCode);
        if (!station) {
            station = { code: stationCode, history: [] };
            item.station.push(station);
        }

        // 检查是否已存在相同日期的记录
        const existingIndex = station.history.findIndex(h => h.date === date);
        if (existingIndex !== -1) {
            // 更新现有记录
            station.history[existingIndex] = newRecord;
            console.log(`已更新 ${itemId} - ${stationCode} 的 ${date} 数据`);
        } else {
            // 添加新记录到历史开头（最新数据在前）
            station.history.unshift(newRecord);
            console.log(`已添加 ${itemId} - ${stationCode} 的 ${date} 数据`);
        }

        return this.saveData();
    }

    // 批量添加历史记录
    addBatchHistory(records) {
        let successCount = 0;
        records.forEach(record => {
            const { itemId, stationCode, yuan2count, count2yuan, date } = record;
            if (this.addHistory(itemId, stationCode, yuan2count, count2yuan, date)) {
                successCount++;
            }
        });
        console.log(`批量添加完成: ${successCount}/${records.length} 条记录成功`);
        return successCount;
    }

    // 获取特定物品和站点的历史记录
    getHistory(itemId, stationCode, limit = null) {
        const item = this.data.find(i => i._id === itemId);
        if (!item) {
            console.log(`未找到物品: ${itemId}`);
            return [];
        }

        const station = item.station.find(s => s.code === stationCode);
        if (!station) {
            console.log(`未找到站点: ${stationCode}`);
            return [];
        }

        const history = limit ? station.history.slice(0, limit) : station.history;
        return history;
    }

    // 获取所有物品列表
    getItems() {
        return this.data.map(item => item._id);
    }

    // 获取物品的站点列表
    getStations(itemId) {
        const item = this.data.find(i => i._id === itemId);
        return item ? item.station.map(s => s.code) : [];
    }

    // 删除特定日期的记录
    deleteHistory(itemId, stationCode, date) {
        const item = this.data.find(i => i._id === itemId);
        if (!item) {
            console.log(`未找到物品: ${itemId}`);
            return false;
        }

        const station = item.station.find(s => s.code === stationCode);
        if (!station) {
            console.log(`未找到站点: ${stationCode}`);
            return false;
        }

        const initialLength = station.history.length;
        station.history = station.history.filter(h => h.date !== date);
        
        if (station.history.length < initialLength) {
            console.log(`已删除 ${itemId} - ${stationCode} 的 ${date} 数据`);
            return this.saveData();
        } else {
            console.log(`未找到 ${itemId} - ${stationCode} 的 ${date} 数据`);
            return false;
        }
    }

    // 获取最新价格
    getLatestPrice(itemId, stationCode) {
        const history = this.getHistory(itemId, stationCode, 1);
        return history.length > 0 ? history[0] : null;
    }

    // 显示数据统计
    showStats() {
        console.log('=== 数据统计 ===');
        console.log(`物品数量: ${this.data.length}`);
        
        this.data.forEach(item => {
            console.log(`\n物品: ${item._id}`);
            console.log(`  站点数量: ${item.station.length}`);
            
            item.station.forEach(station => {
                console.log(`  站点 ${station.code}: ${station.history.length} 条历史记录`);
                if (station.history.length > 0) {
                    const latest = station.history[0];
                    console.log(`    最新 - 日期: ${latest.date}, 元/个: ${latest.yuan2count}, 个/元: ${latest.count2yuan}`);
                }
            });
        });
    }
}

// 使用示例
if (require.main === module) {
    const manager = new PriceManager();
    
    // 显示当前数据统计
    manager.showStats();
    
    // 示例：添加新记录
    // manager.addHistory('chaos_orb', 'qiandao', 0.042, 23.81, '2025-10-17');
    
    // 示例：批量添加
    /*
    const batchRecords = [
        { itemId: 'chaos_orb', stationCode: 'qiandao', yuan2count: 0.042, count2yuan: 23.81, date: '2025-10-17' },
        { itemId: 'divine_orb', stationCode: 'dd373', yuan2count: 0.780, count2yuan: 1.282, date: '2025-10-17' }
    ];
    manager.addBatchHistory(batchRecords);
    */
}

module.exports = PriceManager;