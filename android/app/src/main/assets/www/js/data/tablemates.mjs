export const tablemates = [
  '钟叔', '江叔', '麻婶', '邓婶', '刘叔', '周婶', '陈叔', '李婶', '王叔', '张婶',
  '罗叔', '胡婶', '何叔', '彭婶', '唐叔', '蒋婶', '谢叔', '肖婶', '曾叔', '谭婶',
  '许叔', '邹婶', '伍叔', '贺婶', '廖叔',
  '张三', '李四', '王五', '赵六', '孙七', '周八', '吴九', '郑十',
  '陈桂兰', '刘秀英', '王春梅', '李玉珍', '周桂香', '何淑珍', '杨春兰', '罗秀莲',
  '蒋玉兰', '唐凤英', '谢秋菊', '许月娥', '胡桂珍', '彭建国', '黄福生', '梁德明', '刘长顺'
];

export function pickTablemates(count, random = Math.random) {
  const available = tablemates.map((_, id) => id);
  return Array.from({ length: count }, () => available.splice(Math.floor(random() * available.length), 1)[0]);
}
