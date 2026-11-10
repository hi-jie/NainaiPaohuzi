export const grades = ['丙', '乙', '甲'];
export const pointsPerGrade = 10;

export const ranks = [
  { name: '牌童', description: '初识字牌', mark: '童', color: '#bd825d' },
  { name: '息士', description: '识胡算息', mark: '士', color: '#65a98a' },
  { name: '偎客', description: '稳守巧偎', mark: '偎', color: '#6a9daf' },
  { name: '跑将', description: '能跑能胡', mark: '将', color: '#a88bd2' },
  { name: '名堂师', description: '巧做名堂', mark: '师', color: '#cc9856' },
  { name: '贰柒手', description: '精通二七十', mark: '贰', color: '#cd6e59' },
  { name: '字尊', description: '字牌高手', mark: '尊', color: '#a6bbd7' },
  { name: '湘牌王', description: '湘楚牌仙', mark: '王', color: '#ffce6a' }
];

export const rankThreshold = (rank, grade) => (rank * grades.length + grade) * pointsPerGrade;

export function rankForScore(score) {
  const top = ranks.length * grades.length - 1;
  const level = Math.min(top, Math.max(0, Math.floor(score / pointsPerGrade)));
  return {
    rank: Math.floor(level / grades.length),
    grade: level % grades.length,
    nextAt: level < top ? (level + 1) * pointsPerGrade : null
  };
}
