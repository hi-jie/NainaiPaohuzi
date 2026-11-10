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
    used_names = {previous[role['content_id']] for role in roles if role['content_id'] in previous}
    entries = []
    for index, role in enumerate(roles):
        role_id = role['content_id']
        character = role['title'].strip()
        name = previous.get(role_id)
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
    print(f'已更新 {len(entries)} 名对家，新增 {added} 名，头像图集 {len(atlas) / 1024:.1f} KiB。')


if __name__ == '__main__':
    main()
