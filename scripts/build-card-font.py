"""Build the small display font for the twenty Hengyang card faces."""
from math import hypot
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen


def ink(*points):
    """Outline a stroke from (x, y, width) samples on a 100-unit square."""
    sides = [[], []]
    for index, (x, y, width) in enumerate(points):
        left = points[max(0, index - 1)]
        right = points[min(len(points) - 1, index + 1)]
        dx, dy = right[0] - left[0], right[1] - left[1]
        length = hypot(dx, dy)
        nx, ny = -dy * width / (2 * length), dx * width / (2 * length)
        sides[0].append((x + nx, y + ny))
        sides[1].append((x - nx, y - ny))
    return sides[0] + sides[1][::-1]


def bar(x, y, width, weight=13):
    return [
        (x, y + weight * .32), (x + width * .19, y - weight * .21),
        (x + width * .79, y - weight * .48), (x + width, y + weight * .12),
        (x + width * .85, y + weight * .48), (x + width * .22, y + weight * .58),
    ]


def down(x, y, height, weight=12):
    return [(x - weight * .6, y), (x + weight * .55, y + 5),
            (x + weight * .38, y + height * .72), (x - weight * .08, y + height),
            (x - weight * .53, y + height * .82)]


def box(x, y, w, h, weight=10):
    return [bar(x, y, w, weight), down(x + 4, y, h, weight),
            down(x + w - 6, y, h, weight), bar(x, y + h - 3, w, weight)]


def hand():
    return [
        down(22, 7, 83, 13), bar(3, 28, 35, 9),
        ink((3, 62, 3), (23, 55, 13), (41, 45, 1)),
        ink((22, 71, 12), (21, 90, 10), (9, 83, 1)),
    ]


faces = {
    '一': [[(7, 58), (25, 46), (73, 39), (94, 48), (78, 61), (28, 65)]],
    '二': [bar(20, 32, 60, 19), bar(7, 73, 86, 23)],
    '三': [bar(17, 24, 67, 16), bar(24, 49, 54, 15), bar(8, 76, 84, 20)],
    '四': [
        *box(10, 20, 80, 61, 15),
        ink((39, 23, 12), (35, 52, 11), (24, 64, 1)),
        ink((58, 24, 13), (58, 53, 13), (70, 59, 12), (82, 49, 1)),
    ],
    '五': [
        bar(14, 22, 70, 14), ink((45, 21, 17), (39, 54, 15), (29, 80, 9)),
        bar(22, 50, 58, 14), ink((73, 49, 16), (66, 74, 13), (63, 81, 9)),
        bar(6, 80, 87, 18),
    ],
    '六': [
        ink((38, 11, 2), (49, 17, 15), (58, 29, 8)), bar(9, 43, 84, 18),
        ink((38, 56, 17), (28, 73, 14), (7, 90, 1)),
        ink((61, 57, 2), (78, 68, 15), (91, 86, 15)),
    ],
    '七': [
        [(7, 49), (29, 38), (73, 29), (90, 33), (77, 43), (28, 53)],
        [(33, 12), (52, 17), (47, 68), (54, 76), (77, 74), (87, 57),
         (92, 80), (85, 87), (48, 88), (34, 79)],
    ],
    '八': [
        ink((37, 18, 22), (35, 45, 19), (23, 68, 13), (4, 91, 1)),
        ink((53, 17, 1), (63, 40, 11), (78, 63, 20), (96, 82, 20)),
    ],
    '九': [
        bar(13, 36, 61, 14),
        ink((43, 9, 16), (43, 43, 14), (34, 69, 14), (8, 92, 1)),
        [(62, 29), (77, 34), (72, 70), (78, 76), (86, 75), (92, 61),
         (96, 83), (87, 90), (68, 90), (58, 82)],
    ],
    '十': [
        [(5, 43), (26, 32), (75, 27), (95, 35), (78, 45), (23, 49)],
        [(41, 6), (60, 11), (57, 62), (48, 96), (44, 73)],
    ],
    '壹': [
        bar(19, 18, 62, 10), down(50, 6, 26, 12), bar(27, 31, 47, 9),
        bar(12, 43, 76, 10), down(14, 41, 18, 10), down(83, 40, 15, 11),
        bar(24, 55, 53, 9), *box(29, 66, 43, 14, 8),
        ink((29, 79, 3), (34, 89, 12)), ink((66, 80, 11), (60, 90, 4)),
        bar(9, 94, 82, 11),
    ],
    '贰': [
        bar(7, 24, 86, 12), bar(14, 39, 46, 9), bar(16, 50, 37, 8),
        down(20, 58, 23, 9), down(51, 57, 23, 9), bar(17, 59, 39, 9),
        ink((37, 65, 11), (34, 84, 12), (12, 96, 1)),
        ink((40, 82, 2), (56, 92, 12)),
        ink((61, 6, 16), (65, 39, 15), (76, 70, 13), (88, 85, 11), (94, 69, 1)),
        ink((76, 7, 2), (86, 13, 11)),
    ],
    '叁': [
        ink((47, 4, 14), (36, 18, 12), (24, 23, 4)),
        ink((25, 23, 10), (65, 19, 8), (73, 28, 7)), bar(12, 38, 76, 11),
        ink((47, 30, 13), (37, 51, 12), (7, 64, 1)),
        ink((55, 36, 2), (68, 51, 10), (94, 63, 12)),
        bar(28, 63, 43, 9), bar(22, 76, 57, 9), bar(11, 90, 78, 12),
    ],
    '肆': [
        bar(13, 13, 33, 9), down(14, 12, 46, 9),
        bar(15, 25, 29, 8), bar(15, 37, 30, 8), bar(4, 51, 43, 10),
        ink((24, 53, 13), (15, 79, 12), (10, 86, 7)),
        ink((10, 84, 9), (28, 81, 10), (44, 74, 1)),
        ink((33, 65, 1), (41, 80, 9), (44, 87, 8)),
        down(68, 5, 92, 11), bar(49, 21, 39, 9), down(86, 20, 27, 9),
        bar(45, 34, 52, 9), bar(48, 47, 43, 9), bar(49, 60, 43, 9), bar(45, 74, 52, 10),
    ],
    '伍': [
        ink((30, 8, 16), (23, 31, 15), (4, 53, 1)), down(20, 32, 62, 12),
        bar(40, 21, 51, 12), ink((61, 21, 13), (57, 50, 12), (49, 83, 9)),
        bar(42, 49, 43, 12), ink((83, 48, 13), (78, 78, 10), (74, 83, 7)),
        bar(31, 84, 66, 16),
    ],
    '陆': [
        down(14, 11, 82, 12), bar(10, 13, 30, 10),
        ink((38, 14, 12), (28, 34, 9), (39, 49, 12), (32, 61, 12), (19, 55, 1)),
        bar(49, 24, 41, 12), bar(43, 43, 54, 12), down(67, 8, 82, 13),
        down(47, 58, 32, 12), down(90, 58, 33, 12), bar(44, 86, 51, 13),
    ],
    '柒': [
        ink((15, 7, 2), (26, 12, 12)), ink((7, 24, 2), (20, 30, 12)),
        ink((10, 48, 13), (23, 38, 10), (29, 29, 1)), bar(37, 21, 57, 11),
        ink((55, 4, 13), (53, 33, 12), (62, 40, 10), (84, 38, 10), (93, 28, 1)),
        bar(10, 58, 80, 13), down(49, 45, 52, 13),
        ink((44, 60, 15), (34, 77, 14), (5, 94, 1)),
        ink((54, 61, 3), (69, 76, 12), (93, 89, 14)),
    ],
    '捌': [
        *hand(), *box(40, 19, 31, 24, 8), bar(39, 55, 31, 9),
        ink((56, 42, 10), (53, 68, 12), (36, 94, 1)),
        ink((67, 54, 10), (64, 81, 9), (59, 87, 7), (52, 79, 1)),
        down(78, 24, 39, 9), down(91, 12, 77, 11),
        ink((91, 75, 11), (89, 91, 10), (78, 85, 1)),
    ],
    '玖': [
        bar(7, 21, 37, 11), bar(10, 46, 31, 10), down(25, 20, 56, 11),
        ink((4, 80, 7), (22, 74, 13), (46, 63, 2)),
        ink((64, 8, 15), (58, 29, 13), (43, 46, 1)),
        bar(55, 28, 28, 10), ink((81, 27, 14), (73, 49, 12), (59, 74, 14), (37, 94, 1)),
        ink((67, 56, 4), (79, 72, 12), (96, 90, 15)),
    ],
    '拾': [
        *hand(), ink((68, 8, 15), (61, 26, 13), (39, 46, 1)),
        ink((69, 15, 6), (79, 29, 13), (98, 41, 14)),
        bar(49, 47, 39, 10), *box(48, 64, 43, 27, 11),
    ],
}


def glyph(strokes):
    pen = TTGlyphPen(None)
    for outline in strokes:
        # Match the winding of each contour so overlapping strokes print solid.
        area = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2)
                   in zip(outline, outline[1:] + outline[:1]))
        points = [(round(50 + x * 9), round(905 - y * 9))
                  for x, y in (outline if area > 0 else outline[::-1])]
        pen.moveTo(points[0])
        for point in points[1:]:
            pen.lineTo(point)
        pen.closePath()
    return pen.glyph()


def build():
    cmap = {ord(char): f'uni{ord(char):04X}' for char in faces}
    glyphs = {'.notdef': glyph([])}
    glyphs.update({cmap[ord(char)]: glyph(strokes) for char, strokes in faces.items()})
    font = FontBuilder(1000, isTTF=True)
    font.setupGlyphOrder(list(glyphs))
    font.setupCharacterMap(cmap)
    font.setupGlyf(glyphs)
    font.setupHorizontalMetrics({name: (1000, glyphs[name].xMin if name != '.notdef' else 0) for name in glyphs})
    font.setupHorizontalHeader(ascent=920, descent=-80)
    font.setupNameTable({'familyName': 'Hengyang Card Ink', 'styleName': 'Regular',
                         'uniqueFontIdentifier': 'Hengyang Card Ink 1.0',
                         'fullName': 'Hengyang Card Ink', 'psName': 'HengyangCardInk'})
    font.setupOS2(sTypoAscender=920, sTypoDescender=-80, usWinAscent=920, usWinDescent=80)
    font.setupPost()
    font.font.flavor = 'woff'
    output = Path(__file__).resolve().parents[1] / 'android/app/src/main/assets/www/media/fonts/hengyang-card.woff'
    font.save(output)


if __name__ == '__main__':
    build()
