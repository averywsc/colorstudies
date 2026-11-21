const {cards, bear} = window.gallery;
const byId = id => document.getElementById(id);
const imageUrl = name => 'images/' + name;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const packLabels = {'After Dark':'After Dark','Warm Light':'Warm Light','Cinematic V2':'Cinematic V2','Original':'Creative V1'};
const cardsRoot = byId('cards');
const filters = byId('filters');
const packs = Object.keys(packLabels);
const cardNodes = [];
const revealObserver = !reduced.matches && 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach((entry,index) => {
      entry.target.animate([
        {opacity:0,transform:'translateY(20px)',clipPath:'inset(8% 0 0)'},
        {opacity:1,transform:'none',clipPath:'inset(0)'}
      ],{duration:560,delay:Math.min(index,3)*65,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'});
      revealObserver.unobserve(entry.target);
    });
  },{threshold:.12}) : null;

async function loadCube(item) {
  const response = await fetch('luts/' + item.lut);
  if (!response.ok || !response.body) throw new Error('Could not load LUT');
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  const values = new DataView(await new Response(stream).arrayBuffer());
  if (values.byteLength !== item.size ** 3 * 12) throw new Error('Incomplete LUT');
  const parts = [
    'TITLE "' + item.lutName + '"\nLUT_3D_SIZE ' + item.size + '\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n'
  ];
  const delta = [0,0,0];
  const rgb = [0,0,0];
  let rows = [];
  for (let offset = 0; offset < values.byteLength; offset += 12) {
    for (let channel = 0; channel < 3; channel++) {
      delta[channel] += values.getInt32(offset + channel * 4, true);
      rgb[channel] += delta[channel];
    }
    rows.push(rgb.map(value => (value / 1e7).toFixed(7)).join(' ') + '\n');
    if (rows.length === 2048) {
      parts.push(rows.join(''));
      rows = [];
    }
  }
  parts.push(rows.join(''));
  return new Blob(parts,{type:'text/plain'});
}

async function downloadCube(item,button) {
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    saveFile(await loadCube(item),item.lutName + '.cube');
    button.textContent = 'Download .cube';
  } catch {
    button.textContent = 'Retry download';
  } finally {
    button.disabled = false;
  }
}

function saveFile(file,filename) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url),10000);
}

for (const pack of packs) {
  for (const card of cards.filter(item => item.pack === pack)) {
    const item = document.createElement('figure');
    item.className = 'grade-card';
    item.classList.toggle('portrait',card.title === 'Bird at sunset');
    item.style.setProperty('--card-colour',card.palette[1]);
    item.hidden = !card.featured;
    const image = new Image();
    image.src = imageUrl(card.image);
    image.alt = card.title + ' graded with ' + card.name;
    image.loading = 'lazy';
    image.decoding = 'async';
    const caption = document.createElement('figcaption');
    const details = document.createElement('div');
    details.className = 'card-heading';
    const title = document.createElement('h3');
    title.textContent = card.name;
    const label = document.createElement('span');
    label.textContent = packLabels[pack];
    details.append(title,label);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const shot = document.createElement('span');
    shot.textContent = card.title;
    const cubeButton = document.createElement('button');
    cubeButton.className = 'cube-download';
    cubeButton.type = 'button';
    cubeButton.textContent = 'Download .cube';
    cubeButton.setAttribute('aria-label','Download ' + card.lutName + ' from ' + packLabels[pack]);
    cubeButton.addEventListener('click',() => downloadCube(card,cubeButton));
    actions.append(shot,cubeButton);
    const palette = document.createElement('div');
    palette.className = 'palette';
    palette.setAttribute('role','group');
    palette.setAttribute('aria-label','Sampled colours');
    for (const colour of card.palette) {
      const sample = document.createElement('div');
      const swatch = document.createElement('span');
      swatch.style.backgroundColor = colour;
      swatch.setAttribute('aria-hidden','true');
      const code = document.createElement('code');
      code.textContent = colour;
      sample.append(swatch,code);
      palette.append(sample);
    }
    caption.append(details);
    if (card.description) {
      const description = document.createElement('p');
      description.className = 'look-description';
      description.textContent = card.description;
      caption.append(description);
    }
    caption.append(palette,actions);
    item.append(image,caption);
    cardsRoot.append(item);
    if (!item.hidden) revealObserver?.observe(item);
    cardNodes.push({item,pack,featured:card.featured});
  }
}

const buttons = ['Featured',...packs].map((name,index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = packLabels[name] || name;
  button.setAttribute('aria-pressed',String(index === 0));
  button.addEventListener('click',() => {
    buttons.forEach(other => other.setAttribute('aria-pressed',String(other === button)));
    cardNodes.forEach(({item,pack,featured}) => {
      const wasHidden = item.hidden;
      item.hidden = index === 0 ? !featured : pack !== name;
      if (item.hidden) revealObserver?.unobserve(item);
      else if (wasHidden) revealObserver?.observe(item);
    });
  });
  filters.append(button);
  return button;
});

const pack = byId('pack');
const look = byId('look');
const base = byId('base');
const graded = byId('grade');
const download = byId('download');
const status = byId('status');
const split = byId('split');
const logDownload = byId('download-log');
let renderVersion = 0;
base.src = imageUrl(bear.image);
base.alt = 'Original bear frame';
byId('selected-frame').textContent = bear.title;
for (const name of [...new Set(bear.grades.map(grade => grade.pack))]) {
  pack.add(new Option(packLabels[name],name));
}
pack.value = 'Warm Light';

function selectPack() {
  const options = bear.grades.filter(grade => grade.pack === pack.value);
  look.replaceChildren(...options.map(grade => new Option(grade.name,grade.image)));
  renderBear();
}

async function renderBear() {
  const version = ++renderVersion;
  const name = look.selectedOptions[0].text;
  byId('selected-look').textContent = name;
  logDownload.setAttribute('aria-label','Download ' + name);
  const image = new Image();
  image.src = imageUrl(look.value);
  status.textContent = 'Loading grade…';
  download.hidden = true;
  try {
    await image.decode();
  } catch {
    if (version === renderVersion) status.textContent = 'This grade could not load.';
    return;
  }
  if (version !== renderVersion) return;
  graded.src = image.src;
  download.href = image.src;
  download.download = 'Bear - ' + name + '.webp';
  download.hidden = false;
  status.textContent = '';
  if (!reduced.matches) graded.animate([{opacity:0,filter:'saturate(.65)'},{opacity:1,filter:'none'}],{duration:360,easing:'ease-out'});
}

pack.addEventListener('change',selectPack);
look.addEventListener('change',renderBear);
logDownload.addEventListener('click',() => downloadCube(bear.grades.find(item => item.image === look.value),logDownload));
split.addEventListener('input',() => byId('comparison').style.setProperty('--split',split.value + '%'));
selectPack();

const bundlePack = byId('bundle-pack');
const bundleFormat = byId('bundle-format');
const bundleDownload = byId('bundle-download');
const bundleStatus = byId('bundle-status');
const formats = {'creative':'Rec.709 creative','log':'Apple Log to Rec.709','complete':'Complete pack'};
const bundleItems = () => {
  const forPack = item => item.pack === bundlePack.value;
  const creative = cards.filter(forPack);
  const log = bear.grades.filter(forPack);
  return {creative,log,complete:[...creative,...log]};
};
function updateBundleCount() {
  const count = bundleItems()[bundleFormat.value].length;
  bundleStatus.textContent = count + (count === 1 ? ' LUT' : ' LUTs') + ' in this ZIP';
}
function updateBundleFormats() {
  const sets = bundleItems();
  const previous = bundleFormat.value;
  const names = sets.log.length ? ['complete','creative','log'] : ['creative'];
  bundleFormat.replaceChildren(...names.map(name => new Option(formats[name],name)));
  if (names.includes(previous)) bundleFormat.value = previous;
  updateBundleCount();
}
for (const name of packs) bundlePack.add(new Option(packLabels[name],name));
bundlePack.value = 'After Dark';
bundlePack.addEventListener('change',updateBundleFormats);
bundleFormat.addEventListener('change',updateBundleCount);
bundleDownload.addEventListener('click',async () => {
  const items = bundleItems()[bundleFormat.value];
  const filename = packLabels[bundlePack.value] + ' - ' + formats[bundleFormat.value] + '.zip';
  bundleDownload.disabled = bundlePack.disabled = bundleFormat.disabled = true;
  let progress = 0;
  try {
    const archive = await buildZip(items,async item => {
      bundleStatus.textContent = 'Preparing LUT ' + (++progress) + ' of ' + items.length;
      return loadCube(item);
    });
    saveFile(archive,filename);
    bundleStatus.textContent = 'Downloaded ' + items.length + ' LUTs';
  } catch {
    bundleStatus.textContent = 'Could not prepare the ZIP. Try again.';
  } finally {
    bundleDownload.disabled = bundlePack.disabled = bundleFormat.disabled = false;
  }
});
updateBundleFormats();

const opening = document.querySelector('.opening');
const root = document.documentElement;
function updateScroll() {
  const top = Math.max(0, window.scrollY);
  root.style.setProperty('--travel', Math.min(1, top / opening.offsetHeight));
}
window.addEventListener('scroll', updateScroll, {passive:true});
window.addEventListener('resize', updateScroll);
updateScroll();
opening.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse' && !reduced.matches) {
    opening.style.setProperty('--pointer', ((event.clientX / innerWidth - 0.5) * 25) + 'px');
  }
});
opening.addEventListener('pointerleave', () => opening.style.setProperty('--pointer', '0px'));
