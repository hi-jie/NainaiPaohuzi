import hashlib
import io
import json
import re
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'android/app/src/main/assets/www'
ROSTER = WEB / 'js/data/opponents.mjs'
ATLAS = WEB / 'media/avatars/opponents.webp'
CACHE = Path(tempfile.gettempdir()) / 'paohuzi-opponent-icons'
SOURCE = 'https://baike.mihoyo.com/ys/obc/channel/map/189/25'
API = 'https://api-static.mihoyo.com/common/blackboard/ys_obc/v1/home/content/list?app_sn=ys_obc&channel_id=189'
SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡林何郭罗高郑梁谢宋唐许邓韩曹彭曾萧田董袁潘蒋蔡'
# Traditional surname list in simplified characters, including common variant forms.
# https://zh.wikisource.org/zh-hans/百家姓
HUNDRED_FAMILY_SURNAMES = set(
    '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'
    '戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐'
    '费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄'
    '和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁'
    '杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍'
    '虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚'
    '程嵇邢滑裴陆荣翁荀於羊惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓'
    '牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘针厉戎祖武符刘景詹束龙'
    '叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双'
    '闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀郏浦尚农'
    '温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘'
    '匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩库聂晁勾敖融冷訾辛阚那简饶空'
    '曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公晋楚闫法汝鄢涂钦'
    '岳帅缑亢况后商牟佘佴墨哈谯笪年爱阳佟言福锺丘厐鉏麹鞠甯虙翼厍郈'
)
COMPOUND_SURNAMES = set(
    '万俟 司马 上官 欧阳 夏侯 诸葛 闻人 东方 赫连 皇甫 尉迟 公羊 澹台 公冶 宗政 濮阳 '
    '淳于 单于 太叔 申屠 公孙 仲孙 轩辕 令狐 钟离 宇文 长孙 慕容 鲜于 闾丘 司徒 司空 '
    '亓官 司寇 仉督 子车 颛孙 端木 巫马 公西 漆雕 乐正 壤驷 公良 拓跋 夹谷 宰父 谷梁 '
    '段干 百里 东郭 南门 呼延 归海 羊舌 微生 有琴 梁丘 左丘 东门 西门 伯赏 南宫 第五'.split()
)
TILE_SIZE = 48
COLUMNS = 8
BEGIN = '// BEGIN GENERATED OPPONENT DATA'
END = '// END GENERATED OPPONENT DATA'


def download(url):
    request = Request(url, headers={'Referer': SOURCE})
    with urlopen(request, timeout=25) as response:
        return response.read()


def fetch_roles():
    payload = json.loads(download(API))
    if payload['retcode'] != 0:
        raise RuntimeError(f"图鉴更新失败：{payload['message']}")
    channels = payload['data']['list'][0]['children']
    roles = next(channel['list'] for channel in channels if channel['id'] == 25)
    roles = sorted(
        (role for role in roles if not role['title'].strip().startswith('旅行者')),
        key=lambda role: role['content_id'],
    )
    if len({role['content_id'] for role in roles}) != len(roles) or len(roles) < 4:
        raise ValueError('图鉴返回的角色列表不完整或含重复编号。')
    return roles


def fetch_icon(url):
    cached = CACHE / hashlib.sha256(url.encode()).hexdigest()
    if cached.is_file():
        data = cached.read_bytes()
    else:
        data = download(url)
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
        cached.write_bytes(data)
    with Image.open(io.BytesIO(data)) as image:
        return ImageOps.fit(image.convert('RGB'), (TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)


def build_roster(roles, previous):
    characters = {role['content_id']: role['title'].strip() for role in roles}
    assigned = {
        role_id: character for role_id, character in characters.items()
        if character[:1] in HUNDRED_FAMILY_SURNAMES or character[:2] in COMPOUND_SURNAMES
    }
    used_names = set(assigned.values())
    for role_id in characters:
        name = previous.get(role_id)
        if role_id not in assigned and name and name not in used_names:
            assigned[role_id] = name
            used_names.add(name)
    entries = []
    for index, (role_id, character) in enumerate(characters.items()):
        name = assigned.get(role_id)
        if name is None:
            given = ''.join(re.findall(r'[\u3400-\u9fff]', character.split('·', 1)[0]))[-2:]
            if not given:
                raise ValueError(f'无法从角色名「{character}」取字。')
            offset = index % len(SURNAMES)
            name = next(surname + given for surname in SURNAMES[offset:] + SURNAMES[:offset]
                        if surname + given not in used_names)
            used_names.add(name)
        entries.append([role_id, name, character])
    return entries


def build_atlas(roles, rows):
    urls = list(dict.fromkeys(role['icon'] for role in roles))
    CACHE.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=8) as workers:
        icons = dict(zip(urls, workers.map(fetch_icon, urls)))
    sheet = Image.new('RGB', (COLUMNS * TILE_SIZE, rows * TILE_SIZE))
    for index, role in enumerate(roles):
        sheet.paste(icons[role['icon']], (index % COLUMNS * TILE_SIZE, index // COLUMNS * TILE_SIZE))
    buffer = io.BytesIO()
    sheet.save(buffer, 'WEBP', quality=70, method=6)
    return buffer.getvalue()


def versioned_entry(text, module, revision, separator):
    pattern = rf'({re.escape(module)}\?v=[\w-]+)(?:{re.escape(separator)}avatars=[a-f\d]{{12}})?'
    updated, count = re.subn(pattern, rf'\g<1>{separator}avatars={revision}', text)
    if count != 1:
        raise ValueError(f'找不到唯一的资源版本引用：{module}')
    return updated


def write_assets(outputs):
    with tempfile.TemporaryDirectory(prefix='.opponents-', dir=ROOT) as folder:
        staged = []
        for index, (path, contents) in enumerate(outputs.items()):
            if path.is_file() and path.read_bytes() == contents:
                continue
            temporary = Path(folder) / str(index)
            temporary.write_bytes(contents)
            staged.append((temporary, path))
        for temporary, path in staged:
            temporary.replace(path)


def main():
    source = ROSTER.read_text(encoding='utf-8')
    data_pattern = r'export const opponents = (\[\n.*?\n\]);'
    previous = {role_id: name for role_id, name, _ in json.loads(re.search(data_pattern, source, re.S)[1])}
    roles = fetch_roles()
    entries = build_roster(roles, previous)
    rows = (len(entries) + COLUMNS - 1) // COLUMNS
    roster = ',\n'.join('  ' + json.dumps(entry, ensure_ascii=False) for entry in entries)
    atlas = build_atlas(roles, rows)
    revision = hashlib.sha256(atlas + roster.encode()).hexdigest()[:12]
    generated = (
        f"{BEGIN}\nconst columns = {COLUMNS};\nconst rows = {rows};\n"
        f"const avatarRevision = '{revision}';\n\nexport const opponents = [\n{roster}\n];\n{END}"
    )
    start = source.index(BEGIN)
    stop = source.index(END, start) + len(END)
    roster_file = (source[:start] + generated + source[stop:]).encode()
    main_path = WEB / 'js/main.mjs'
    table_path = WEB / 'js/ui/table.mjs'
    index_path = WEB / 'index.html'
    main = versioned_entry(main_path.read_text(encoding='utf-8'), 'opponents.mjs', revision, '&')
    main = versioned_entry(main, 'table.mjs', revision, '&')
    write_assets({
        ATLAS: atlas,
        ROSTER: roster_file,
        table_path: versioned_entry(table_path.read_text(encoding='utf-8'), 'opponents.mjs', revision, '&').encode(),
        main_path: main.encode(),
        index_path: versioned_entry(index_path.read_text(encoding='utf-8'), 'main.mjs', revision, '&amp;').encode(),
    })
    added = sum(role_id not in previous for role_id, _, _ in entries)
    renamed = sum(role_id in previous and name != previous[role_id] for role_id, name, _ in entries)
    print(f'已更新 {len(entries)} 名对家，新增 {added} 名，调整 {renamed} 个名字，头像图集 {len(atlas) / 1024:.1f} KiB。')


if __name__ == '__main__':
    main()
