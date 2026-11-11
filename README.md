# 衡阳跑胡子

一款给奶奶做的单机衡阳字牌游戏。你和电脑牌友同桌，选好玩法就能开局。安卓安装包内置游戏、字体和音频，断网也能打。

**[下载最新版安卓 APK](https://github.com/hi-jie/NainaiPaohuzi/releases/latest)** · **[网页试玩](https://hi-jie.github.io/NainaiPaohuzi/)** · [发布记录](https://github.com/hi-jie/NainaiPaohuzi/releases)

## 安装和开局

- 安卓正式版支持 Android 8.0 及以上。在最新版发布页的附件列表中下载 `.apk`。已装过调试版的手机需要先卸载旧版，再安装正式版。卸载会清除该版本的本机积分、个人资料和对局存档。
- 打开游戏选择玩法。在开始页面点「教程」，可以查看对局流程、动作、胡牌条件和计分规则。
- 默认开启「一五十」和「放炮胡」，开局前可以调整。麻雀牌可在开局前选择人数。

## 玩法

桌上人数包含你和电脑牌友。

| 玩法 | 桌上人数 |
| --- | --- |
| 六胡抢 | 4 人 |
| 十胡卡 | 3 人 |
| 十五胡 | 3 人 |
| 麻雀牌 | 3–5 人 |

- **理牌和吃牌**　开局自动理牌，也可以拖动手牌自己分组。出现多种吃法时，可以先看预览再确认。
- **结算和回看**　胡牌或黄庄后，点「查看牌局」可以回看各家手牌和剩余牌墩。
- **个人资料与积分**　可设置头像和昵称，各玩法的积分分别保存。个人资料、设置和对局进度保存在本机。
- **衡阳方言报牌**　摸牌、出牌和吃碰胡等动作有语音提示。设置里可分别开关游戏音效和背景音乐，也可独立调节音量。

## 音乐鸣谢

背景音乐（BGM）来自 **HOYO-MiX**。收录《天使的馈赠》《品茗尝清心（望舒昼间）》《柔风浅酌》和《醵饮同欢》。前两首的素材署名为陈致逸与 HOYO-MiX。[项目曲目列表](android/app/src/main/assets/www/media/audio/music/playlist.mjs)

## 问题反馈

如果遇到安装、显示或玩法问题，可以在 [GitHub Issues](https://github.com/hi-jie/NainaiPaohuzi/issues) 反馈。请附上使用的平台或手机型号、游戏版本，以及出现问题前的操作。

## 开发与维护

<details>
<summary>本地预览、构建与资料</summary>

在仓库根目录启动静态预览，然后打开 [本地牌桌](http://127.0.0.1:8000/)。

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory android/app/src/main/assets/www
```

在仓库根目录运行 `node --test` 可执行规则测试。网页和安卓应用共用同一套 HTML、CSS 和 JavaScript。

安卓构建使用 JDK 17、Android SDK Platform 35 和 Build Tools 34.0.0。设置 `ANDROID_HOME`，或在 `android/local.properties` 填写 `sdk.dir`。首次构建会下载 Gradle 和依赖。

```powershell
cd android
.\gradlew.bat :app:assembleDebug
```

正式包使用 `:app:assembleRelease`，签名配置通过 [Gradle 配置](android/app/build.gradle) 中的环境变量读取。

- [玩法规则确认稿](docs/衡阳跑胡子玩法规则确认稿.md) · [麻雀牌玩法规则](docs/麻雀牌玩法规则.md) · [当前牌局规则与代码审查](docs/当前牌局规则与代码审查.md)
- [早期功能规格](docs/功能规格.md) · [项目结构](docs/项目结构.md)
- [音量设计规范](docs/音量设计规范.md) · [背景音乐目录](android/app/src/main/assets/www/media/audio/music) · [衡阳方言录音目录](android/app/src/main/assets/www/media/audio/hengyang)

曲目变更后可运行 `node scripts/update-music.mjs --playlist-only` 更新播放列表。需要转换 OGG 时，运行 `node scripts/update-music.mjs`，脚本通过 FFmpeg 和 ffprobe 生成并校验 MP3，成功后删除对应 OGG。方言录音用 `node scripts/process-voices.mjs` 从原始录音重新生成，需要 FFmpeg。

</details>
