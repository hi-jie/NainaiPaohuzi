import { defaultNickname } from '../storage/save.mjs?v=202';

async function makeAvatar(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    const crop = Math.min(width, height);
    if (!crop) throw new Error('Empty image');

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    canvas.getContext('2d').drawImage(image, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, 256, 256);
    return canvas.toDataURL('image/webp', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function bindProfile(page, entry, nicknameDialog, profile, saveProfile) {
  const editor = page.querySelector('#profile-editor');
  const nickname = nicknameDialog.querySelector('#profile-nickname');
  const nicknameStatus = nicknameDialog.querySelector('#nickname-status');
  const fileInput = editor.querySelector('#avatar-file');
  const status = editor.querySelector('#profile-status');
  const homeName = entry.querySelector('#home-nickname');
  const profileName = editor.querySelector('#profile-display-name');
  const avatars = [entry.querySelector('.profile-avatar'), editor.querySelector('.profile-avatar')];
  let avatarRequest = 0;

  function renderIdentity() {
    homeName.textContent = profile.nickname;
    profileName.textContent = profile.nickname;
    entry.setAttribute('aria-label', `${profile.nickname}的个人页面`);
    for (const avatar of avatars) {
      const image = avatar.querySelector('img');
      if (profile.avatar) image.src = profile.avatar;
      else image.removeAttribute('src');
      image.hidden = !profile.avatar;
      avatar.querySelector('svg').toggleAttribute('hidden', Boolean(profile.avatar));
    }
  }

  function update(changes) {
    const next = { ...profile, ...changes };
    saveProfile(next);
    profile = next;
    renderIdentity();
  }

  editor.querySelector('#edit-nickname').addEventListener('click', () => {
    nickname.value = profile.nickname;
    nicknameStatus.textContent = '';
    nicknameDialog.showModal();
    nickname.select();
  });
  nicknameDialog.querySelector('#cancel-nickname').addEventListener('click', () => nicknameDialog.close());
  nicknameDialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const name = nickname.value.trim() || defaultNickname;
    try {
      update({ nickname: name });
      nicknameDialog.close();
      status.textContent = '昵称已保存';
    } catch {
      nicknameStatus.textContent = '昵称保存失败';
    }
  });

  editor.querySelector('#choose-avatar').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const request = ++avatarRequest;
    try {
      const avatar = await makeAvatar(file);
      if (request !== avatarRequest) return;
      update({ avatar });
      status.textContent = '头像已保存';
    } catch {
      if (request === avatarRequest) status.textContent = '无法保存这张图片';
    }
  });

  renderIdentity();
  return () => {
    status.textContent = '';
  };
}
