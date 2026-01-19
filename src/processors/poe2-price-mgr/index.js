const PriceManager = require('./priceManager');
const manager = new PriceManager();

// 添加今天的数据（自动获取日期）
// chaos_orb 混沌石
manager.addHistory('chaos_orb', 'qiandao', 0.042, 27.696);
// divine_orb 神圣石
manager.addHistory('divine_orb', 'qiandao', 0.519, 1.925);
// exalted_orb 崇高石
manager.addHistory('exalted_orb', 'qiandao', 0.001, 1390.645);
// orb_of_transmutation 点金石
manager.addHistory('orb_of_transmutation', 'qiandao', 0.001, 1663.019);
// orb_of_alchemy  富豪石
manager.addHistory('orb_of_alchemy', 'qiandao', 0.001, 830.862);
//  orb_of_chance 机会石
manager.addHistory('orb_of_chance', 'qiandao', 0.02, 50.956);

// dd373
// chaos_orb 混沌石
manager.addHistory('chaos_orb', 'dd373', 0.055, 18.18);
// divine_orb 神圣石
manager.addHistory('divine_orb', 'dd373', 0.57, 1.75);
// exalted_orb 崇高石
manager.addHistory('exalted_orb', 'dd373', 0.001, 526.315);
// orb_of_transmutation 点金石
manager.addHistory('orb_of_transmutation', 'dd373', 0.001, 1340.78);
// orb_of_alchemy  富豪石
manager.addHistory('orb_of_alchemy', 'dd373', 0.0013, 769.8229);
//  orb_of_chance 机会石
manager.addHistory('orb_of_chance', 'dd373', 0.15, 6.67);

// 查看统计
manager.showStats();
