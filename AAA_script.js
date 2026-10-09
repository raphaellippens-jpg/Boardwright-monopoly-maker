(()=>{
'use strict';

const $ = id => document.getElementById(id);
const STORE = 'boardwright-studio-v3';

const COLORS = {
  blank:'#fffdf5', street:'#9dbca0', station:'#a9b7c3',
  electricity:'#e4cf81', water:'#91c8d4', utility:'#a4c8c7',
  tax:'#ead5a0', chance:'#f0c28d', community:'#b7d5b5',
  start:'#dce8d1', parking:'#dce8d1', jail:'#e4e6df',
  gotojail:'#e4c4b7', custom:'#c7bce0'
};

const TYPES = {
  blank:'Empty space',
  street:'Street / property',
  station:'Station',
  electricity:'Electricity company',
  water:'Water company',
  utility:'Other utility',
  tax:'Tax / fee',
  chance:'Chance / event',
  community:'Community chest',
  start:'Start',
  parking:'Free parking',
  jail:'Jail',
  gotojail:'Go to jail',
  custom:'Custom special'
};

let count = 40;
let tiles = [];
let selected = 0;
let centerImage = '';
let undoStack = [];
let redoStack = [];
let saveTimer;

const clone = value => JSON.parse(JSON.stringify(value));

function blankTile(pos) {
  return {
    pos,
    name:'',
    type:'blank',
    price:'',
    color:COLORS.blank,
    icon:'',
    image:''
  };
}

function initialTiles(n) {
  return Array.from({length:n},(_,i)=>blankTile(i));
}

function toast(message) {
  const el = $('toast');
  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.style.display = 'block';

  clearTimeout(toast.timer);
  toast.timer = setTimeout(()=>{
    el.style.display = 'none';
  },2200);
}

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g,char=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[char]);
}

function slug(value) {
  return String(value || 'boardwright-board')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-|-$/g,'') || 'boardwright-board';
}

function projectData() {
  return {
    app:'Boardwright',
    version:3,
    count,
    tiles,
    centerImage,
    edition:$('edition').value,
    subtitle:$('subtitle').value,
    accent:$('accent').value
  };
}

function setStatus(message) {
  if ($('status')) $('status').textContent = message;
}

function saveToStorage(silent=false) {
  try {
    localStorage.setItem(STORE,JSON.stringify(projectData()));
    setStatus('Saved on this device');
    if (!silent) toast('Project saved');
  } catch(error) {
    setStatus('Could not save — export a backup');
    if (!silent) alert('Saving failed. Export a JSON backup instead.');
  }
}

function autoSave() {
  setStatus('Unsaved changes…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>saveToStorage(true),350);
}

function download(blob,filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function exportJSON() {
  const blob = new Blob(
    [JSON.stringify(projectData(),null,2)],
    {type:'application/json'}
  );

  download(blob,slug($('edition').value)+'.json');
  toast('Project backup exported');
}

function loadProject(project,notify=true) {
  if (
    !project ||
    !Array.isArray(project.tiles) ||
    ![28,40].includes(Number(project.count)) ||
    project.tiles.length !== Number(project.count)
  ) {
    throw new Error('Invalid Boardwright project file.');
  }

  count = Number(project.count);
  tiles = initialTiles(count);

  project.tiles.forEach((tile,index)=>{
    if (tile && index < count) {
      tiles[index] = {
        ...blankTile(index),
        ...tile,
        pos:index
      };
    }
  });

  centerImage = project.centerImage || '';

  $('edition').value = project.edition || 'MY CUSTOM EDITION';
  $('subtitle').value = project.subtitle || '';
  $('accent').value = project.accent || '#173b2e';
  $('layoutSelect').value = String(count);

  selected = Math.min(selected,count-1);

  updateCenterPreview();
  fillEditor();
  render();
  saveToStorage(true);

  if (notify) toast('Project loaded');
}

function loadSavedProject() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return false;

    loadProject(JSON.parse(raw),false);
    return true;
  } catch(error) {
    return false;
  }
}

function pushHistory() {
  undoStack.push({
    data:clone(projectData()),
    selected
  });

  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function restoreHistory(entry) {
  const project = entry.data;
  count = project.count;
  tiles = clone(project.tiles);
  centerImage = project.centerImage || '';
  selected = Math.min(entry.selected,count-1);

  $('edition').value = project.edition || '';
  $('subtitle').value = project.subtitle || '';
  $('accent').value = project.accent || '#173b2e';
  $('layoutSelect').value = String(count);

  updateCenterPreview();
  fillEditor();
  render();
  autoSave();
  updateHistoryButtons();
}

function undo() {
  if (!undoStack.length) return;

  redoStack.push({
    data:clone(projectData()),
    selected
  });

  restoreHistory(undoStack.pop());
  toast('Undo complete');
}

function redo() {
  if (!redoStack.length) return;

  undoStack.push({
    data:clone(projectData()),
    selected
  });

  restoreHistory(redoStack.pop());
  toast('Redo complete');
}

function updateHistoryButtons() {
  if ($('undoBtn')) $('undoBtn').disabled = !undoStack.length;
  if ($('redoBtn')) $('redoBtn').disabled = !redoStack.length;
}

function isCorner(index) {
  return count === 40
    ? [0,10,20,30].includes(index)
    : [0,7,14,21].includes(index);
}

function gridPosition(index) {
  if (count === 40) {
    if (index <= 10) return {r:11,c:11-index};
    if (index <= 20) return {r:11-(index-10),c:1};
    if (index <= 30) return {r:1,c:1+(index-20)};
    return {r:1+(index-30),c:11};
  }

  if (index <= 7) return {r:8,c:8-index};
  if (index <= 14) return {r:8-(index-7),c:1};
  if (index <= 21) return {r:1,c:1+(index-14)};
  return {r:1+(index-21),c:8};
}

function setPreview(id,source) {
  const image = $(id);
  if (!image) return;

  if (source) {
    image.src = source;
    image.style.display = 'block';
  } else {
    image.removeAttribute('src');
    image.style.display = 'none';
  }
}

function updateCenterPreview() {
  setPreview('centerThumb',centerImage);
}

function fillEditor() {
  const tile = tiles[selected];
  if (!tile) return;

  $('selectedTitle').textContent =
    `Square ${selected+1}${isCorner(selected)?' · Corner':''}`;

  if ($('selectedCount')) {
    $('selectedCount').textContent = `${selected+1} / ${count}`;
  }

  $('spaceName').value = tile.name || '';
  $('spaceType').value = tile.type || 'blank';
  $('spacePrice').value = tile.price || '';
  $('spaceColor').value = tile.color || COLORS[tile.type] || COLORS.custom;
  $('spaceIcon').value = tile.icon || '';

  setPreview('tileThumb',tile.image || '');
}

function render() {
  const board = $('board');
  if (!board) return;

  const n = count === 40 ? 11 : 8;

  board.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${n},minmax(0,1fr))`;
  board.style.gridTemplateRows = `repeat(${n},minmax(0,1fr))`;

  const center = document.createElement('div');
  center.className = 'center';
  center.style.gridColumn = `2/${n}`;
  center.style.gridRow = `2/${n}`;

  center.innerHTML = `
    <div class="centerkicker">A CUSTOM BOARD GAME</div>
    <img class="centerphoto" alt="">
    <h3></h3>
    <div class="rule"></div>
    <p></p>
  `;

  if (centerImage) {
    center.querySelector('img').src = centerImage;
    center.classList.add('hasphoto');
  }

  center.querySelector('h3').textContent =
    $('edition').value || 'YOUR EDITION';

  center.querySelector('h3').style.color = $('accent').value;

  center.querySelector('p').textContent =
    $('subtitle').value || '';

  board.appendChild(center);

  tiles.forEach((tile,index)=>{
    const pos = gridPosition(index);
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'tile';
    button.style.gridRow = pos.r;
    button.style.gridColumn = pos.c;

    if (isCorner(index)) button.classList.add('corner');
    if (index === selected) button.classList.add('selected');

    button.style.background = '#fffdf5';
    button.setAttribute(
      'aria-label',
      tile.name || `Empty square ${index+1}`
    );

    if (tile.type !== 'blank') {
      const band = document.createElement('div');
      band.className = 'band';
      band.style.background =
        tile.color || COLORS[tile.type] || COLORS.custom;
      button.appendChild(band);
    }

    if (tile.image) {
      const image = document.createElement('img');
      image.className = 'tilephoto';
      image.src = tile.image;
      image.alt = '';
      button.appendChild(image);
    }

    if (tile.icon) {
      const icon = document.createElement('div');
      icon.className = 'tileicon';
      icon.textContent = tile.icon;
      button.appendChild(icon);
    }

    const name = document.createElement('div');
    name.className = 'tilename';
    name.textContent = tile.name || '+';
    button.appendChild(name);

    if (tile.price) {
      const price = document.createElement('div');
      price.className = 'tileprice';
      price.textContent = tile.price;
      button.appendChild(price);
    }

    button.addEventListener('click',()=>{
      selected = index;
      fillEditor();
      render();
    });

    board.appendChild(button);
  });

  if ($('geometryLabel')) {
    $('geometryLabel').textContent = `${count} spaces · 4 corners`;
  }

  if ($('boardStatus')) {
    const customised = tiles.filter(
      tile=>tile.name || tile.image || tile.icon
    ).length;

    $('boardStatus').textContent =
      `${count} independent squares · ${customised} customised`;
  }

  updateHistoryButtons();
}

function applyEditor() {
  pushHistory();

  tiles[selected] = {
    ...tiles[selected],
    name:$('spaceName').value.trim(),
    type:$('spaceType').value,
    price:$('spacePrice').value.trim(),
    color:$('spaceColor').value,
    icon:$('spaceIcon').value.trim()
  };

  render();
  autoSave();
  toast('Square updated');
}

function clearSelected() {
  pushHistory();
  tiles[selected] = blankTile(selected);
  fillEditor();
  render();
  autoSave();
  toast('Square cleared');
}

function handleImage(file,which) {
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Choose an image file.');
    return;
  }

  if (file.size > 2.5*1024*1024) {
    alert('Choose an image smaller than 2.5 MB.');
    return;
  }

  const reader = new FileReader();

  reader.onload = ()=>{
    pushHistory();

    if (which === 'center') {
      centerImage = reader.result;
      updateCenterPreview();
    } else {
      tiles[selected].image = reader.result;
      setPreview('tileThumb',tiles[selected].image);
    }

    render();
    autoSave();
    toast('Photo added');
  };

  reader.onerror = ()=>alert('Could not read that image.');
  reader.readAsDataURL(file);
}

function changeLayout(value) {
  const next = Number(value);

  if (next === count) return;

  if (tiles.some(tile=>tile.pos >= next && tile.name)) {
    if (!confirm('Changing layout may remove customised spaces. Continue?')) {
      $('layoutSelect').value = String(count);
      return;
    }
  }

  pushHistory();

  if (next < count) {
    tiles = tiles.slice(0,next);
  } else {
    while (tiles.length < next) {
      tiles.push(blankTile(tiles.length));
    }
  }

  count = next;
  selected = Math.min(selected,count-1);

  fillEditor();
  render();
  autoSave();
}

function newBoard() {
  if (!confirm('Create a new blank board?')) return;

  pushHistory();
  tiles = initialTiles(count);
  selected = 0;
  centerImage = '';

  $('edition').value = 'MY CUSTOM EDITION';
  $('subtitle').value = '';

  updateCenterPreview();
  fillEditor();
  render();
  autoSave();
  toast('New board created');
}

function exportSVG() {
  const n = count === 40 ? 11 : 8;
  const size = 1600;
  const cell = size/n;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" fill="#294536"/>`
  ];

  const inner = cell*(n-2);

  parts.push(
    `<rect x="${cell}" y="${cell}" width="${inner}" height="${inner}" fill="#f4f4e9"/>`
  );

  parts.push(
    `<text x="${size/2}" y="${size*.3}" text-anchor="middle" font-family="Arial" font-size="28" fill="#718073">A CUSTOM BOARD GAME</text>`
  );

  parts.push(
    `<text x="${size/2}" y="${size*.48}" text-anchor="middle" font-family="Arial" font-size="64" font-weight="bold" fill="${$('accent').value}">${safe($('edition').value || 'YOUR EDITION')}</text>`
  );

  parts.push(
    `<text x="${size/2}" y="${size*.56}" text-anchor="middle" font-family="Arial" font-size="25" fill="#6a766e">${safe($('subtitle').value)}</text>`
  );

  tiles.forEach((tile,index)=>{
    const p = gridPosition(index);
    const x = (p.c-1)*cell;
    const y = (p.r-1)*cell;
    const w = cell-2;

    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="${isCorner(index)?'#e6eddf':'#fffdf5'}" stroke="#bfcabf" stroke-width="2"/>`
    );

    if (tile.type !== 'blank') {
      parts.push(
        `<rect x="${x+2}" y="${y+2}" width="${w-4}" height="${cell*.13}" fill="${tile.color || COLORS[tile.type] || COLORS.custom}"/>`
      );
    }

    if (tile.name) {
      parts.push(
        `<text x="${x+cell/2}" y="${y+cell*.58}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#1c2922">${safe(tile.name)}</text>`
      );
    }

    if (tile.price) {
      parts.push(
        `<text x="${x+cell/2}" y="${y+cell*.91}" text-anchor="middle" font-family="Arial" font-size="15" fill="#637065">${safe(tile.price)}</text>`
      );
    }
  });

  parts.push('</svg>');

  download(
    new Blob([parts.join('')],{type:'image/svg+xml;charset=utf-8'}),
    slug($('edition').value)+'.svg'
  );

  toast('SVG exported');
}

function importJSON(file) {
  const reader = new FileReader();

  reader.onload = ()=>{
    try {
      const project = JSON.parse(reader.result);
      pushHistory();
      loadProject(project);
    } catch(error) {
      alert(error.message || 'Invalid project file.');
    }
  };

  reader.onerror = ()=>alert('Could not read that file.');
  reader.readAsText(file);
}

function bind(id,event,callback) {
  const element = $(id);
  if (element) element.addEventListener(event,callback);
}

bind('applyBtn','click',applyEditor);
bind('clearTileBtn','click',clearSelected);
bind('undoBtn','click',undo);
bind('redoBtn','click',redo);
bind('newBtn','click',newBoard);
bind('saveBtn','click',()=>saveToStorage(false));
bind('saveProjectBtn','click',exportJSON);
bind('jsonBtn','click',exportJSON);
bind('exportBtn','click',exportSVG);

bind('layoutSelect','change',event=>changeLayout(event.target.value));

bind('centerFile','change',event=>{
  handleImage(event.target.files[0],'center');
  event.target.value='';
});

bind('tileFile','change',event=>{
  handleImage(event.target.files[0],'tile');
  event.target.value='';
});

bind('removeCenter','click',()=>{
  if (!centerImage) return;
  pushHistory();
  centerImage='';
  updateCenterPreview();
  render();
  autoSave();
});

bind('removeTilePhoto','click',()=>{
  if (!tiles[selected].image) return;
  pushHistory();
  tiles[selected].image='';
  setPreview('tileThumb','');
  render();
  autoSave();
});

bind('accent','input',()=>{
  render();
  autoSave();
});

['edition','subtitle'].forEach(id=>{
  bind(id,'input',()=>{
    render();
    autoSave();
  });
});

bind('spaceType','change',()=>{
  $('spaceColor').value = COLORS[$('spaceType').value] || COLORS.custom;
});

bind('jsonFile','change',event=>{
  if (event.target.files[0]) importJSON(event.target.files[0]);
  event.target.value='';
});

bind('loadProjectBtn','click',()=>{
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = ()=>{
    if (input.files[0]) importJSON(input.files[0]);
  };
  input.click();
});

tiles = initialTiles(count);

if (!loadSavedProject()) {
  fillEditor();
  render();
  saveToStorage(true);
}

updateHistoryButtons();

})();
