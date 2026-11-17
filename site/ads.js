// Ads for iqprep.app: OFF until a Google AdSense publisher ID and ad slot are filled in below.
// They show only on the parents' pages (this script is never loaded inside the game at /play/), and
// they request non-personalised ads. Before turning them on, also mark the site as child-directed in
// your AdSense account and set up a consent message for visitors in the EEA and UK.
(() => {
  const ADS = { client: '', slot: '' }; // e.g. client: 'ca-pub-0000000000000000', slot: '1234567890'
  if (!ADS.client || !ADS.slot) return;
  const box = document.querySelector('[data-ad]');
  if (!box) return;
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.dataset.adClient = ADS.client;
  ins.dataset.adSlot = ADS.slot;
  ins.dataset.adFormat = 'auto';
  ins.dataset.fullWidthResponsive = 'true';
  box.querySelector('.ad__slot').replaceChildren(ins);
  box.hidden = false;
  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.requestNonPersonalizedAds = 1;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS.client}`;
  document.head.append(s);
  window.adsbygoogle.push({});
})();
