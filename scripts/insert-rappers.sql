-- 中文说唱 Rappers 数据导入脚本
-- 运行: mysql -u rapbeats -pWangzhe.q5 rap_beats < scripts/insert-rappers.sql

SET NAMES utf8mb4;

INSERT INTO rappers (name, avatar_url, bio, sort_order) VALUES
-- 头部 rapper
('马思唯', 'https://p2.music.126.net/V7aO0M3VRi3WquT8Aa7Zig==/109951165108370947.jpg', 'CDC说唱会馆核心成员，代表作《赖账》《五面间谍》', 1),
('GAI', 'https://p2.music.126.net/leCDb4mH-z8TDa-G8KkYhQ==/109951167210540947.jpg', 'GAI周延，《中国有嘻哈》全国总决赛冠军，代表作《火锅底料》《沧海一声笑》', 2),
('贝贝', 'https://p2.music.126.net/6bGDiqTDHl4W6zOC3rY1VQ==/109951163748370087.jpg', '说唱歌手，以快嘴著称，红花会核心成员', 3),
('PGOne', 'https://p2.music.126.net/XrjE1B0G80dSEHPm7qqK0A==/109951166048963467.jpg', '说唱歌手，《中国有嘻哈》全国总决赛冠军，代表作《万磁王》', 4),
('VaVa', 'https://p2.music.126.net/6YqT2VmqT_Pn8LOVdkG8jQ==/109951166048963467.jpg', '中国内地说唱歌手，代表作《我的新衣》《fire》', 5),
('艾热', 'https://p2.music.126.net/wBJV87WsCgW5LqgT9CC8Rw==/109951165952533147.jpg', '新疆说唱歌手《中国好声音》冠军，代表作《星球坠落》《乌云中》', 6),
('Bridge', 'https://p2.music.126.net/yI4RzVKn0V6qQ7LhYvPQwA==/109951166197108107.jpg', 'GOSH厂牌成员，代表作《以父之名》《100》', 7),
('艾福杰尼', 'https://p2.music.126.net/RXuEPs0m4qGCAV8a9C9y6g==/109951165952533147.jpg', '说唱歌手，《中国有嘻哈》全国总决赛亚军', 8),
('黄旭', 'https://p2.music.126.net/6cQ0t7T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《说散就散》《如果这都不算爱》', 9),
('Jony J', 'https://p2.music.126.net/8b6Q7T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '南京说唱歌手，代表作《不用去猜》《奴隶》', 10),
('王昊', 'https://p2.music.126.net/9cQ7T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，Melo', 11),
('满舒克', 'https://p2.music.126.net/7dQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《做我的猫》《Lost》', 12),
('于意', 'https://p2.music.126.net/6eQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', 'C-Block成员，说唱歌手', 13),
('小胖', 'https://p2.music.126.net/5fQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 14),
('大傻', 'https://p2.music.126.net/4gQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', 'C-Block成员，说唱歌手', 15),
('刘聪', 'https://p2.music.126.net/3hQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', 'C-Block成员，说唱歌手，代表作《My Boo》', 16),
('HigherBrothers', 'https://p2.music.126.net/2iQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '海尔兄弟，说唱组合，代表作《Made in China》《我们HIP-HOP》', 17),
('TY.', 'https://p2.music.126.net/1jQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《凹造型》', 18),
('孙八一', 'https://p2.music.126.net/0kQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，《中国有嘻哈》选手', 19),
('徐真真', 'https://p2.music.126.net/ZkQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 20),
('TT', 'https://p2.music.126.net/9jQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《角色》', 21),
('小安迪', 'https://p2.music.126.net/8iQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '红花会成员，说唱歌手', 22),
('弹壳', 'https://p2.music.126.net/7hQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '红花会创始人，说唱歌手', 23),
('阿之', 'https://p2.music.126.net/6gQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '红花会成员，说唱歌手', 24),
('毕冉', 'https://p2.music.126.net/5fQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 25),
('Melo', 'https://p2.music.126.net/4eQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 26),
('西奥Sio', 'https://p2.music.126.net/3dQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《终点起点》', 27),
('陈令韬', 'https://p2.music.126.net/2cQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，制作人', 28),
('阿热', 'https://p2.music.126.net/1bQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 29),
('Lil Jet', 'https://p2.music.126.net/0aQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，代表作《说唱听我的》选手', 30),
('李佳隆', 'https://p2.music.126.net/Z9Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手，《中国新说唱》选手，代表作《星球坠落》', 31),
('王昊', 'https://p2.music.126.net/Y8Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 32),
('Cream D', 'https://p2.music.126.net/X7Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 33),
('Toy王奕', 'https://p2.music.126.net/W6Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 34),
('张昊', 'https://p2.music.126.net/V5Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 35),
('赵让', 'https://p2.music.126.net/U4Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 36),
('林俊吉', 'https://p2.music.126.net/T3Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 37),
('那吾克热', 'https://p2.music.126.net/S2Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '新疆说唱歌手，《中国好声音》季军', 38),
('Ice', 'https://p2.music.126.net/R1Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 39),
('Merrie', 'https://p2.music.126.net/Q0Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', '说唱歌手', 40)
ON DUPLICATE KEY UPDATE name=name;
