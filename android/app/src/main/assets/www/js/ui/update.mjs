export function bindAppUpdate() {
  const section = document.querySelector('#app-update');
  const version = document.querySelector('#app-version');
  const controls = section.querySelector('.update-controls');
  const check = document.querySelector('#check-update');
  const install = document.querySelector('#install-update');
  const download = document.querySelector('#update-download');
  const progress = document.querySelector('#update-progress');
  const percent = document.querySelector('#update-percent');
  const status = document.querySelector('#update-status');
  const dialog = document.querySelector('#update-dialog');
  const description = document.querySelector('#update-description');

  check.addEventListener('click', () => {
    check.disabled = true;
    location.href = 'paohuzi://check-update';
  });
  document.querySelector('#download-update').addEventListener('click', () => {
    location.href = 'paohuzi://download-update';
  });
  install.addEventListener('click', () => { location.href = 'paohuzi://install-update'; });

  function showVersion(name) {
    version.textContent = `版本 ${name}`;
    section.hidden = false;
  }

  window.addEventListener('paohuzi-update', ({ detail }) => {
    showVersion(detail.version);
    controls.hidden = false;
    status.hidden = false;
    check.hidden = detail.downloading;
    check.disabled = detail.checking;
    check.textContent = detail.checking ? '检查中…' : '检查更新';
    install.hidden = !detail.ready || detail.downloading;
    download.hidden = !detail.downloading;
    if (detail.progress < 0) progress.removeAttribute('value');
    else progress.value = detail.progress;
    percent.textContent = detail.progress < 0 ? '正在下载…' : `${detail.progress}%`;
    status.textContent = detail.message;
    if (detail.available && !section.closest('#settings').hidden && !dialog.open) {
      description.textContent = `发现 ${detail.available} 版，是否下载？`;
      dialog.showModal();
    }
  });

  if (version.dataset.webVersion) showVersion(version.dataset.webVersion);
}
