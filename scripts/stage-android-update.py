import json
from pathlib import Path
import re
import shutil
import sys
from zipfile import ZipFile


release, pages = map(Path, sys.argv[1:])
apks = list(release.glob('NainaiPaohuzi-*-release.apk'))
if len(apks) != 1:
    raise SystemExit('Expected exactly one Android APK in the latest Release.')

apk = apks[0]
with ZipFile(apk, metadata_encoding='utf-8') as archive:
    try:
        update = json.loads(archive.read('assets/www/update.json'))
    except KeyError:
        # The first supported release predates the bundled update feed.
        if apk.name != 'NainaiPaohuzi-1.0.1-release.apk':
            raise
        update = {'versionCode': 3, 'versionName': '1.0.1', 'apk': apk.name}

if (type(update.get('versionCode')) is not int or update['versionCode'] <= 0
        or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', update.get('versionName', ''))
        or apk.name != update.get('apk') or apk.name != f"NainaiPaohuzi-{update['versionName']}-release.apk"):
    raise SystemExit('Release APK and update metadata do not match.')

shutil.copyfile(apk, pages / apk.name)
(pages / 'update.json').write_text(json.dumps(update, indent=2) + '\n', encoding='utf-8')
