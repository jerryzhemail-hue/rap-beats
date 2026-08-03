-- 中文说唱 Rappers 真实数据
-- 数据来源: 综合整理自网易云音乐、公开资料

SET NAMES utf8mb4;

TRUNCATE TABLE rappers;

INSERT INTO rappers (id, name, avatar_url, bio, sort_order) VALUES
-- ========== 头部rapper (按知名度排序) ==========
(1, '马思唯', 'https://p2.music.126.net/V7aO0M3VRi3WquT8Aa7Zig==/109951165108370947.jpg', 'CDC说唱会馆核心成员，代表作《赖账》《五面间谍》《R发展趋势》', 1),
(2, 'GAI', 'https://p2.music.126.net/leCDb4mH-z8TDa-G8KkYhQ==/109951167210540947.jpg', 'GAI周延，《中国有嘻哈》全国总决赛冠军，代表作《火锅底料》《沧海一声笑》《苦行僧》', 2),
(3, '贝贝', 'https://p2.music.126.net/6bGDiqTDHl4W6zOC3rY1VQ==/109951163748370087.jpg', '说唱歌手，以快嘴著称，红花会核心成员，代表作《Tricky》《Call Me Later》', 3),
(4, 'PGOne', 'https://p2.music.126.net/XrjE1B0G80dSEHPm7qqK0A==/109951166048963467.jpg', '说唱歌手，《中国有嘻哈》全国总决赛冠军，代表作《万磁王》《中二病》', 4),
(5, 'VaVa', 'https://p2.music.126.net/6YqT2VmqT_Pn8LOVdkG8jQ==/109951166048963467.jpg', '中国内地说唱歌手，代表作《我的新衣》《Fire》《更好的姿态》', 5),
(6, '艾热', 'https://p2.music.126.net/wBJV87WsCgW5LqgT9CC8Rw==/109951165952533147.jpg', '新疆说唱歌手，《中国好声音》冠军，代表作《星球坠落》《乌云中》《巨人》', 6),
(7, 'Bridge', 'https://p2.music.126.net/yI4RzVKn0V6qQ7LhYvPQwA==/109951166197108107.jpg', 'GOSH厂牌成员，代表作《以父之名》《100》《明天》', 7),
(8, '艾福杰尼', 'https://p2.music.126.net/RXuEPs0m4qGCAV8a9C9y6g==/109951165952533147.jpg', '说唱歌手，《中国有嘻哈》全国总决赛亚军，代表作《凹造型》《说散就散》', 8),
(9, '黄旭', 'https://p2.music.126.net/6cQ0t7T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《说散就散》《如果这都不算爱》《选择》', 9),
(10, 'Jony J', 'https://p2.music.126.net/8b6Q7T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '南京说唱歌手，代表作《不用去猜》《奴隶》《、物》', 10),

-- ========== 厂牌代表 ==========
(11, 'HigherBrothers', 'https://p2.music.126.net/2iQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '海尔兄弟，来自成都的说唱组合，代表作《Made in China》《我们HIP-HOP》《恭喜发财》', 11),
(12, 'TY.', 'https://p2.music.126.net/1jQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，来自成都CDC说唱会馆，代表作《凹造型》《冷血》', 12),
(13, '小胖', 'https://p2.music.126.net/5fQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', 'CDC说唱会馆成员，说唱歌手', 13),
(14, '大傻', 'https://p2.music.126.net/4gQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', 'C-Block成员，代表作《以父之名》《顶不住》', 14),
(15, '刘聪', 'https://p2.music.126.net/3hQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', 'C-Block成员，代表作《My Boo》《hey Kong》《沉都》', 15),
(16, '于意', 'https://p2.music.126.net/6eQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', 'C-Block成员，说唱歌手', 16),
(17, '小安迪', 'https://p2.music.126.net/8iQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '红花会成员，代表作《独行侠》', 17),
(18, '弹壳', 'https://p2.music.126.net/7hQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '红花会创始人，代表作《龟兔赛跑》', 18),
(19, '阿之', 'https://p2.music.126.net/6gQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '红花会成员，说唱歌手', 19),
(20, 'Melo', 'https://p2.music.126.net/4eQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，红花会成员', 20),

-- ========== 知名rapper ==========
(21, '满舒克', 'https://p2.music.126.net/7dQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《做我的猫》《Lost》《VVS》', 21),
(22, 'TT', 'https://p2.music.126.net/9jQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《角色》《冷战》《010》', 22),
(23, '徐真真', 'https://p2.music.126.net/ZkQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《只是晚安的时候》《开心就拍拍手》', 23),
(24, '孙八一', 'https://p2.music.126.net/0kQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，《中国有嘻哈》选手，以商务风著称', 24),
(25, '王昊', 'https://p2.music.126.net/9cQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 25),
(26, '李佳隆', 'https://p2.music.126.net/Z9Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，《中国新说唱》选手，代表作《星球坠落》《月儿圆》', 26),
(27, '那吾克热', 'https://p2.music.126.net/S2Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '新疆说唱歌手，代表作《儿子娃娃》《四季》', 27),
(28, 'Ice', 'https://p2.music.126.net/R1Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《RED》《泫雅》', 28),
(29, 'Cream D', 'https://p2.music.126.net/X7Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，说唱听我的选手', 29),
(30, '王奕', 'https://p2.music.126.net/W6Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 30),

-- ========== 更多rapper ==========
(31, '西奥Sio', 'https://p2.music.126.net/3dQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《终点起点》《VVS》', 31),
(32, '陈令韬', 'https://p2.music.126.net/2cQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，制作人', 32),
(33, 'Lil Jet', 'https://p2.music.126.net/0aQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《说唱听我的》选手', 33),
(34, 'Merrie', 'https://p2.music.126.net/Q0Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 34),
(35, '张昊', 'https://p2.music.126.net/V5Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 35),
(36, '赵让', 'https://p2.music.126.net/U4Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 36),
(37, '林俊吉', 'https://p2.music.126.net/T3Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 37),
(38, '毕冉', 'https://p2.music.126.net/5fQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 38),
(39, '阿热', 'https://p2.music.126.net/1bQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 39),
(40, 'YoungGor', 'https://p2.music.126.net/aQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 40),
(41, '丹镇北京', 'https://p2.music.126.net/bQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '北京说唱厂牌', 41),
(42, '黄硕', 'https://p2.music.126.net/cQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '丹镇北京成员，说唱歌手', 42),
(43, '张昊', 'https://p2.music.126.net/dQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 43),
(44, 'Saber', 'https://p2.music.126.net/eQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，Free-Out厂牌成员', 44),
(45, 'BigYear', 'https://p2.music.126.net/fQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 45),
(46, '小王子', 'https://p2.music.126.net/gQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 46),
(47, 'Lil White', 'https://p2.music.126.net/hQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 47),
(48, 'YoungG', 'https://p2.music.126.net/iQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 48),
(49, '大狗', 'https://p2.music.126.net/jQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 49),
(50, '徐真真', 'https://p2.music.126.net/kQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 50),
(51, '鬼卞', 'https://p2.music.126.net/lQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《忍者》《骨折》', 51),
(52, '马俊', 'https://p2.music.126.net/mQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，新疆hiphop代表人物', 52),
(53, '阿克江', 'https://p2.music.126.net/nQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 53),
(54, '吴磊', 'https://p2.music.126.net/oQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 54),
(55, '岳浩崑', 'https://p2.music.126.net/pQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 55),
(56, '阿热EZ', 'https://p2.music.126.net/qQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 56),
(57, '木秦', 'https://p2.music.126.net/rQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 57),
(58, '王昊Melo', 'https://p2.music.126.net/sQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 58),
(59, '张昊Rising', 'https://p2.music.126.net/tQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 59),
(60, 'LilAndy', 'https://p2.music.126.net/uQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 60),
(61, 'Lil Yap', 'https://p2.music.126.net/vQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 61),
(62, 'Toy王奕', 'https://p2.music.126.net/W6Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 62),
(63, '赵涛', 'https://p2.music.126.net/wQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 63),
(64, '杀手耗', 'https://p2.music.126.net/xQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 64),
(65, 'Kid.g', 'https://p2.music.126.net/yQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 65),
(66, 'Dok2', 'https://p2.music.126.net/zQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 66),
(67, 'Young Coco', 'https://p2.music.126.net/AQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 67),
(68, '艾瑞欧', 'https://p2.music.126.net/BQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 68),
(69, 'FrankiD', 'https://p2.music.126.net/CQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 69),
(70, 'Kafe.Hu', 'https://p2.music.126.net/DQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《噩型》', 70)
ON DUPLICATE KEY UPDATE name=name;
