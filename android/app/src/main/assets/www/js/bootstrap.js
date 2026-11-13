(function () {
  var root = document.documentElement;
  var chrome = /Chrome\/(\d+)/.exec(navigator.userAgent);
  var key = 'paohuzi-force-compat';
  var forced = localStorage.getItem(key) === 'true';
  var isPreview = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var native = window.paohuziDiagnosticsNative;
  var testBuild = native && typeof native.compatibilityTesting === 'function' && native.compatibilityTesting();
  var forceAvailable = testBuild || isPreview;
  var useCompat = (forceAvailable && forced) || (chrome && Number(chrome[1]) < 108);
  if (!chrome) {
    useCompat = useCompat || !window.CSS || !CSS.supports('height', '100dvh') ||
      !CSS.supports('selector(:has(*))') || !Element.prototype.getAnimations ||
      !Object.hasOwn || !Array.prototype.findLast;
  }
  root.dataset.renderer = useCompat ? 'compat' : 'modern';

  var script = document.createElement('script');
  script.type = 'module';
  script.src = useCompat ? './compat/game.mjs?v=260' : './js/main.mjs?v=259';
  if (useCompat) {
    var stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = './compat/app.css?v=265';
    stylesheet.onload = function () {
      document.querySelector('link[href^="./css/app.css"]').disabled = true;
      document.head.appendChild(script);
    };
    document.head.appendChild(stylesheet);
  } else {
    document.head.appendChild(script);
  }

  if (!forceAvailable) return;
  document.querySelector('#app-update').hidden = false;
  var checkbox = document.querySelector('#force-compat');
  checkbox.parentElement.hidden = false;
  checkbox.checked = forced;
  checkbox.onchange = function () {
    localStorage.setItem(key, String(checkbox.checked));
    location.reload();
  };
})();
